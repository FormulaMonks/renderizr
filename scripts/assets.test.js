import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
    isUrl,
    loadFont,
    loadLogo,
    loadWorkspace,
    toDataUri,
} from "./assets.js";
import {
    GIF_1X1,
    JPEG_32X64,
    WEBP_HEADER,
    fixture,
    withFetch,
    withTempDir,
    writeBrokenWorkspace,
} from "./__fixtures__/helpers.js";

const PNG = await readFile(fixture("logo.png"));

/** Collect what a body writes to one of the process streams. */
async function captured(stream, body) {
    const original = stream.write;
    let text = "";
    stream.write = (chunk) => {
        text += chunk;
        return true;
    };
    try {
        const value = await body();
        return { value, text };
    } finally {
        stream.write = original;
    }
}

/* -------------------------------------------------------------------- isUrl */

test("isUrl recognizes http and https and nothing else", () => {
    for (const value of [
        "http://example.test/a.json",
        "https://example.test/a.json",
        "HTTPS://EXAMPLE.TEST/a.json",
    ]) {
        assert.equal(isUrl(value), true, `${value} should be a URL`);
    }

    for (const value of [
        "./workspace.json",
        "/abs/workspace.json",
        "workspace.json",
        "data:image/png;base64,AAAA",
        "//example.test/a.json",
        "ftp://example.test/a.json",
        "file:///a.json",
    ]) {
        assert.equal(isUrl(value), false, `${value} should not be a URL`);
    }
});

/* --------------------------------------------------------------- toDataUri */

test("binary images become base64 data URIs that decode back", () => {
    const uri = toDataUri(PNG, "image/png");

    assert.ok(uri.startsWith("data:image/png;base64,"));
    assert.deepEqual(
        Buffer.from(uri.slice("data:image/png;base64,".length), "base64"),
        PNG,
    );
});

test("SVG is minified before it is encoded", () => {
    const svg = [
        '<?xml version="1.0"?>',
        "<!DOCTYPE svg PUBLIC 'x' 'y'>",
        "<!-- a comment -->",
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="ns" viewBox="0 0 10 10">',
        "  <title>Title</title>",
        "  <desc>Desc</desc>",
        "  <metadata><rdf:RDF /></metadata>",
        '  <rect inkscape:label="x" width="10" height="10" />',
        "</svg>",
    ].join("\n");

    const uri = toDataUri(Buffer.from(svg), "image/svg+xml");
    const decoded = decodeURIComponent(
        uri.replace(/^data:image\/svg\+xml,/, ""),
    );

    for (const gone of [
        "<?xml",
        "<!DOCTYPE",
        "a comment",
        "<title>",
        "<desc>",
        "<metadata>",
        "inkscape:label",
        "xmlns:inkscape",
    ]) {
        assert.ok(!decoded.includes(gone), `${gone} survived minification`);
    }

    assert.ok(decoded.startsWith("<svg"));
    assert.ok(decoded.includes("<rect"));
    assert.ok(!decoded.includes(">\n"), "whitespace between tags survived");
});

test("SVG encoding never emits a bare double quote, which would end an attribute", () => {
    const uri = toDataUri(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>'),
        "image/svg+xml",
    );
    assert.ok(!uri.includes('"'), `a raw quote leaked into ${uri}`);
});

test("SVG encoding takes whichever of percent and base64 is smaller", () => {
    // Path data is letters, digits and spaces, all of which percent-encoding
    // either leaves alone or hands straight back.
    const path = "M 10 20 L 30 40 L 50 60 z ".repeat(30);
    const plain = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="${path}"/></svg>`;
    assert.ok(
        toDataUri(Buffer.from(plain), "image/svg+xml").startsWith(
            "data:image/svg+xml,",
        ),
    );

    // Markup made of characters that each cost three bytes percent-encoded.
    const dense = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${"é".repeat(
        400,
    )}</text></svg>`;
    assert.ok(
        toDataUri(Buffer.from(dense), "image/svg+xml").startsWith(
            "data:image/svg+xml;base64,",
        ),
    );
});

/* ---------------------------------------------------------------- loadLogo */

test("no logo is not an error", async () => {
    assert.equal(await loadLogo(null), null);
});

test("a PNG logo carries its sniffed dimensions", async () => {
    const logo = await loadLogo({ source: fixture("logo.png") });

    assert.equal(logo.width, 120);
    assert.equal(logo.height, 40);
    assert.equal(logo.alt, "");
    assert.equal(logo.href, null);
    assert.ok(logo.src.startsWith("data:image/png;base64,"));
});

test("alt text and href are carried through", async () => {
    const logo = await loadLogo({
        source: fixture("logo.png"),
        alt: "Acme",
        href: "https://acme.test",
    });

    assert.equal(logo.alt, "Acme");
    assert.equal(logo.href, "https://acme.test");
});

test("an SVG logo takes its dimensions from the viewBox", async () => {
    const logo = await loadLogo({ source: fixture("logo.svg") });

    assert.equal(logo.width, 120);
    assert.equal(logo.height, 40);
    assert.ok(logo.src.startsWith("data:image/svg+xml"));
    assert.ok(
        !logo.src.includes("metadata"),
        "the SVG was embedded unminified",
    );
});

test("an SVG that would run script is refused", async () => {
    for (const name of ["logo-scripted.svg", "logo-onload.svg"]) {
        await assert.rejects(
            loadLogo({ source: fixture(name) }),
            /contains script, which would run in the page/,
            `${name} was accepted`,
        );
    }
});

test("an oversized logo warns but still builds", async () => {
    const { value, text } = await captured(process.stderr, () =>
        loadLogo({ source: fixture("logo-oversized.png") }),
    );

    assert.equal(value.width, 600);
    assert.equal(value.height, 400);
    assert.match(text, /warning: logo is 600x400px but renders at 40px tall/);
});

test("a logo that fits does not warn", async () => {
    const { text } = await captured(process.stderr, () =>
        loadLogo({ source: fixture("logo.png") }),
    );
    assert.equal(text, "");
});

test("GIF, JPEG and WEBP are all sniffed from their bytes", async () => {
    await withTempDir(async (dir) => {
        const cases = [
            ["logo.gif", GIF_1X1, "image/gif", 1, 1],
            ["logo.jpg", JPEG_32X64, "image/jpeg", 32, 64],
            ["logo.webp", WEBP_HEADER, "image/webp", null, null],
        ];

        for (const [name, bytes, mime, width, height] of cases) {
            const path = join(dir, name);
            await writeFile(path, bytes);

            const logo = await loadLogo({ source: path });
            assert.ok(
                logo.src.startsWith(`data:${mime};base64,`),
                `${name} was sniffed as something other than ${mime}`,
            );
            assert.equal(logo.width, width, `${name} width`);
            assert.equal(logo.height, height, `${name} height`);
        }
    });
});

test("a file that is not an image at all is refused", async () => {
    await withTempDir(async (dir) => {
        const path = join(dir, "notes.txt");
        await writeFile(path, "this is plain text, not an image at all");

        await assert.rejects(
            loadLogo({ source: path }),
            /Unrecognized image format/,
        );
    });
});

test("a remote logo is fetched and inlined", async () => {
    await withFetch(
        { "https://example.test/logo.png": { body: PNG } },
        async (calls) => {
            const logo = await loadLogo({
                source: "https://example.test/logo.png",
            });
            assert.equal(logo.width, 120);
            assert.ok(logo.src.startsWith("data:image/png;base64,"));
            assert.equal(calls.length, 1);
        },
    );
});

test("a remote logo that 404s names the status", async () => {
    await withFetch(
        {
            "https://example.test/missing.png": {
                ok: false,
                status: 404,
                statusText: "Not Found",
            },
        },
        async () => {
            await assert.rejects(
                loadLogo({ source: "https://example.test/missing.png" }),
                /https:\/\/example\.test\/missing\.png responded 404 Not Found/,
            );
        },
    );
});

/* ---------------------------------------------------------------- loadFont */

const FONT_CSS = (family, faces) =>
    faces
        .map(
            ({ subset, weight, style = "normal", url, format = "woff2" }) => `
/* ${subset} */
@font-face {
  font-family: '${family}';
  font-style: ${style};
  font-weight: ${weight};
  font-display: block;
  src: url(${url}) format('${format}');
  unicode-range: U+0000-00FF;
}`,
        )
        .join("\n");

const GOOGLE = (candidate) =>
    `https://fonts.googleapis.com/css2?family=${candidate}&display=block`;

const WOFF2 = Buffer.from("wOF2 fixture bytes");

test("no font is not an error", async () => {
    assert.equal(await loadFont(null), null);
});

test("a font is fetched, its faces embedded, and a CSS variable declared", async () => {
    const css = FONT_CSS("Inter", [
        {
            subset: "latin",
            weight: 400,
            url: "https://fonts.gstatic.com/a.woff2",
        },
    ]);

    await withFetch(
        {
            [GOOGLE("Inter:wght@400..700")]: { body: css },
            "https://fonts.gstatic.com/a.woff2": { body: WOFF2 },
        },
        async (calls) => {
            const { value: font, text } = await captured(process.stdout, () =>
                loadFont({
                    family: "Inter",
                    weights: ["400", "700"],
                    subsets: ["latin"],
                    italic: false,
                }),
            );

            assert.equal(font.family, "Inter");
            assert.ok(
                font.css.includes(
                    `url(data:font/woff2;base64,${WOFF2.toString("base64")})`,
                ),
                "the woff2 was not inlined",
            );
            assert.ok(!font.css.includes("https://fonts.gstatic.com"));
            assert.ok(
                font.css.endsWith(
                    "--renderizr-font:'Inter',Helvetica,Arial,sans-serif}",
                ),
                font.css.slice(-120),
            );
            assert.match(text, /Embedded Inter \(1 face, \d+KB\)/);

            // Google only serves woff2 to a browser it recognizes.
            for (const call of calls) {
                assert.match(
                    call.init.headers["User-Agent"],
                    /^Mozilla\/5\.0 /,
                    `${call.url} was requested without a browser User-Agent`,
                );
            }
        },
    );
});

test("a family with spaces is asked for by its plus-joined name", async () => {
    await withFetch(
        {
            [GOOGLE("Source+Sans+3:wght@300..600")]: {
                body: FONT_CSS("Source Sans 3", [
                    {
                        subset: "latin",
                        weight: 300,
                        url: "https://fonts.gstatic.com/s.woff2",
                    },
                ]),
            },
            "https://fonts.gstatic.com/s.woff2": { body: WOFF2 },
        },
        async () => {
            const { value } = await captured(process.stdout, () =>
                loadFont({
                    family: "  Source   Sans 3 ",
                    weights: ["600", "300"],
                    subsets: ["latin"],
                    italic: false,
                }),
            );
            assert.equal(value.family, "  Source   Sans 3 ");
        },
    );
});

test("the candidate ladder falls back when a family has no variable range", async () => {
    const seen = [];

    await withFetch(
        {
            default: (url) => {
                seen.push(url);
                if (url.startsWith("https://fonts.gstatic.com")) {
                    return { body: WOFF2 };
                }
                if (url === GOOGLE("Lora:wght@400;700")) {
                    return {
                        body: FONT_CSS("Lora", [
                            {
                                subset: "latin",
                                weight: 400,
                                url: "https://fonts.gstatic.com/l.woff2",
                            },
                        ]),
                    };
                }
                return { ok: false, status: 400, statusText: "Bad Request" };
            },
        },
        async () => {
            await captured(process.stdout, () =>
                loadFont({
                    family: "Lora",
                    weights: ["400", "700"],
                    subsets: ["latin"],
                    italic: false,
                }),
            );

            assert.deepEqual(seen.slice(0, 2), [
                GOOGLE("Lora:wght@400..700"),
                GOOGLE("Lora:wght@400;700"),
            ]);
            assert.ok(
                !seen.includes(GOOGLE("Lora")),
                "the ladder kept going after a candidate succeeded",
            );
        },
    );
});

test("italics ask for both axes on every rung of the ladder", async () => {
    const seen = [];

    await withFetch(
        {
            default: (url) => {
                seen.push(url);
                return { ok: false, status: 400, statusText: "Bad Request" };
            },
        },
        async () => {
            await assert.rejects(
                loadFont({
                    family: "Inter",
                    weights: ["400", "700"],
                    subsets: ["latin"],
                    italic: true,
                }),
                /Google Fonts has no family called "Inter"/,
            );
        },
    );

    assert.deepEqual(seen, [
        GOOGLE("Inter:ital,wght@0,400..700;1,400..700"),
        GOOGLE("Inter:ital,wght@0,400;1,400;0,700;1,700"),
        GOOGLE("Inter"),
    ]);
});

test("a format other than woff2 is refused rather than embedded", async () => {
    await withFetch(
        {
            default: {
                body: FONT_CSS("Inter", [
                    {
                        subset: "latin",
                        weight: 400,
                        url: "https://fonts.gstatic.com/a.ttf",
                        format: "truetype",
                    },
                ]),
            },
        },
        async () => {
            await assert.rejects(
                loadFont({
                    family: "Inter",
                    weights: ["400"],
                    subsets: ["latin"],
                    italic: false,
                }),
                /format other than woff2/,
            );
        },
    );
});

test("only the requested subsets are embedded", async () => {
    const css = FONT_CSS("Inter", [
        {
            subset: "cyrillic",
            weight: 400,
            url: "https://fonts.gstatic.com/cyr.woff2",
        },
        {
            subset: "latin-ext",
            weight: 400,
            url: "https://fonts.gstatic.com/ext.woff2",
        },
        {
            subset: "latin",
            weight: 400,
            url: "https://fonts.gstatic.com/lat.woff2",
        },
    ]);

    await withFetch(
        {
            [GOOGLE("Inter:wght@400..400")]: { body: css },
            "https://fonts.gstatic.com/lat.woff2": { body: WOFF2 },
            "https://fonts.gstatic.com/ext.woff2": { body: WOFF2 },
            // cyrillic is deliberately unstubbed: fetching it must not happen.
        },
        async () => {
            const { value: font, text } = await captured(process.stdout, () =>
                loadFont({
                    family: "Inter",
                    weights: ["400"],
                    subsets: ["latin", "latin-ext"],
                    italic: false,
                }),
            );

            assert.match(text, /Embedded Inter \(2 faces, \d+KB\)/);
            assert.equal(
                (font.css.match(/@font-face/g) ?? []).length,
                2,
                "an unrequested subset was embedded",
            );
        },
    );
});

test("a family without the requested subset is refused", async () => {
    await withFetch(
        {
            default: {
                body: FONT_CSS("Inter", [
                    {
                        subset: "latin",
                        weight: 400,
                        url: "https://fonts.gstatic.com/a.woff2",
                    },
                ]),
            },
        },
        async () => {
            await assert.rejects(
                loadFont({
                    family: "Inter",
                    weights: ["400"],
                    subsets: ["cyrillic", "greek"],
                    italic: false,
                }),
                /"Inter" has no cyrillic\/greek subset\./,
            );
        },
    );
});

test("a face reused across subsets is downloaded once", async () => {
    const css = FONT_CSS("Inter", [
        {
            subset: "latin",
            weight: 400,
            url: "https://fonts.gstatic.com/shared.woff2",
        },
        {
            subset: "latin-ext",
            weight: 400,
            url: "https://fonts.gstatic.com/shared.woff2",
        },
    ]);

    await withFetch(
        {
            [GOOGLE("Inter:wght@400..400")]: { body: css },
            "https://fonts.gstatic.com/shared.woff2": { body: WOFF2 },
        },
        async (calls) => {
            await captured(process.stdout, () =>
                loadFont({
                    family: "Inter",
                    weights: ["400"],
                    subsets: ["latin", "latin-ext"],
                    italic: false,
                }),
            );

            const downloads = calls.filter((call) =>
                call.url.endsWith("shared.woff2"),
            );
            assert.equal(downloads.length, 1);
        },
    );
});

/* ----------------------------------------------------------- loadWorkspace */

test("a local workspace is parsed", async () => {
    const workspace = await loadWorkspace(fixture("workspace.json"));

    assert.equal(workspace.name, "Fixture Workspace");
    assert.equal(workspace.documentation.sections.length, 2);
    assert.equal(workspace.documentation.decisions.length, 2);
    assert.equal(workspace.views.systemContextViews.length, 2);
});

test("invalid JSON names the file and the parse error", async () => {
    await withTempDir(async (dir) => {
        await assert.rejects(
            loadWorkspace(await writeBrokenWorkspace(dir)),
            /broken\.json is not valid JSON — /,
        );
    });
});

test("a remote workspace is fetched", async () => {
    const raw = await readFile(fixture("workspace.json"), "utf-8");

    await withFetch(
        { "https://example.test/workspace.json": { body: raw } },
        async () => {
            const workspace = await loadWorkspace(
                "https://example.test/workspace.json",
            );
            assert.equal(workspace.name, "Fixture Workspace");
        },
    );
});

test("a remote workspace that 404s names the status", async () => {
    await withFetch(
        {
            default: { ok: false, status: 500, statusText: "Server Error" },
        },
        async () => {
            await assert.rejects(
                loadWorkspace("https://example.test/workspace.json"),
                /responded 500 Server Error/,
            );
        },
    );
});

test("a workspace with no themes and no remote assets makes no requests", async () => {
    await withFetch({}, async (calls) => {
        await loadWorkspace(fixture("workspace.json"));
        assert.deepEqual(calls, []);
    });
});

test("themes are merged into the styles and then cleared", async () => {
    await withFetch(
        {
            "https://example.test/themes/one/theme.json": {
                body: {
                    elements: [
                        { tag: "From Theme One", background: "#111111" },
                    ],
                    relationships: [{ tag: "Theme Relationship" }],
                },
            },
            "https://example.test/themes/two/theme.json": {
                body: {
                    elements: [
                        { tag: "From Theme Two", background: "#222222" },
                    ],
                },
            },
            default: { body: PNG },
        },
        async () => {
            const workspace = await loadWorkspace(
                fixture("workspace-remote-assets.json"),
            );
            const { configuration } = workspace.views;

            assert.deepEqual(
                configuration.themes,
                [],
                "the renderer would still wait on the network at startup",
            );

            const tags = configuration.styles.elements.map(
                (style) => style.tag,
            );
            // Theme styles are the base; the workspace's own styles win.
            assert.deepEqual(tags, [
                "From Theme Two",
                "From Theme One",
                "Themed",
                "Local",
            ]);
            assert.deepEqual(
                configuration.styles.relationships.map((style) => style.tag),
                ["Theme Relationship", "Existing Relationship"],
            );
        },
    );
});

test("a theme that cannot be loaded warns and the build carries on", async () => {
    const { value: workspace, text } = await captured(process.stderr, () =>
        withFetch(
            {
                "https://example.test/themes/one/theme.json": new Error(
                    "getaddrinfo ENOTFOUND example.test",
                ),
                "https://example.test/themes/two/theme.json": {
                    body: { elements: [{ tag: "Survivor" }] },
                },
                default: { body: PNG },
            },
            () => loadWorkspace(fixture("workspace-remote-assets.json")),
        ),
    );

    assert.match(
        text,
        /warning: could not load theme https:\/\/example\.test\/themes\/one\/theme\.json/,
    );
    assert.ok(
        workspace.views.configuration.styles.elements.some(
            (style) => style.tag === "Survivor",
        ),
        "the second theme was dropped because the first one failed",
    );
});

test("remote icons and the branding logo are inlined", async () => {
    await withFetch(
        {
            "https://example.test/icons/themed.png": { body: PNG },
            "https://example.test/branding/logo.png": { body: PNG },
            default: { body: { elements: [] } },
        },
        async () => {
            const workspace = await loadWorkspace(
                fixture("workspace-remote-assets.json"),
            );
            const { configuration } = workspace.views;
            const byTag = Object.fromEntries(
                configuration.styles.elements.map((style) => [
                    style.tag,
                    style,
                ]),
            );

            assert.ok(byTag.Themed.icon.startsWith("data:image/png;base64,"));
            assert.ok(
                configuration.branding.logo.startsWith(
                    "data:image/png;base64,",
                ),
            );
            // An icon that is already inline is left exactly as it was.
            assert.equal(byTag.Local.icon, "data:image/png;base64,AAAA");
        },
    );
});

test("an icon that cannot be inlined warns and is left as a URL", async () => {
    const { value: workspace, text } = await captured(process.stderr, () =>
        withFetch(
            {
                "https://example.test/icons/themed.png": {
                    ok: false,
                    status: 404,
                    statusText: "Not Found",
                },
                "https://example.test/branding/logo.png": { body: PNG },
                default: { body: { elements: [] } },
            },
            () => loadWorkspace(fixture("workspace-remote-assets.json")),
        ),
    );

    assert.match(
        text,
        /warning: could not inline https:\/\/example\.test\/icons\/themed\.png/,
    );
    assert.equal(
        workspace.views.configuration.styles.elements.find(
            (style) => style.tag === "Themed",
        ).icon,
        "https://example.test/icons/themed.png",
    );
});

test("a chosen font is handed to the diagram engine too", async () => {
    const workspace = await loadWorkspace(fixture("workspace.json"), {
        font: { family: "Inter", css: "@font-face{}" },
    });

    assert.deepEqual(workspace.views.configuration.branding.font, {
        name: "Inter",
    });
});

test("a workspace with no views at all still receives the font", async () => {
    await withTempDir(async (dir) => {
        const path = join(dir, "bare.json");
        await writeFile(path, JSON.stringify({ name: "Bare" }));

        const workspace = await loadWorkspace(path, {
            font: { family: "Lora", css: "" },
        });

        assert.deepEqual(workspace.views.configuration.branding.font, {
            name: "Lora",
        });
    });
});

/* ------------------------------------------------------------ known defects */

test("a workspace with no views comes back un-normalized", async () => {
    // Pinning a defect, not endorsing it. `inlineWorkspaceAssets` opens with
    //
    //     const views = workspace.views ?? {};
    //
    // which binds a *fresh* object when the workspace has no `views`, so the
    // `views.configuration ??= {}` and `configuration.styles ??= {}` that
    // follow are written to a throwaway and the workspace itself is never
    // normalized. Nothing downstream notices today: the only caller that needs
    // `views.configuration` is the font branch of `loadWorkspace`, which does
    // the normalization again on the workspace itself — which is why the test
    // above this one passes.
    //
    // The fix is two lines:
    //
    //     workspace.views ??= {};
    //     const views = workspace.views;
    //
    // after which this assertion becomes `assert.ok(workspace.views...)`.
    await withTempDir(async (dir) => {
        const path = join(dir, "no-views.json");
        await writeFile(path, JSON.stringify({ name: "No Views" }));

        const workspace = await loadWorkspace(path);

        assert.equal(
            workspace.views,
            undefined,
            "if this now exists, scripts/assets.js:279 has been fixed — invert the assertion",
        );
    });
});
