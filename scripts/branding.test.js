import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
    brandingChanges,
    brandingNotices,
    brandingProperties,
    checkBranding,
    chooseBranding,
    loadBranding,
    loadSetBranding,
    NO_BRANDING_FLAGS,
} from "./branding.js";
import { fixture, withFetch, withTempDir } from "./__fixtures__/helpers.js";

const PNG = await readFile(fixture("logo.png"));

const flags = (set = {}) => ({ ...NO_BRANDING_FLAGS, ...set });

/** A workspace with `properties` set at its root. */
const workspaceWith = (properties = {}, views = {}) => ({
    name: "Acme",
    properties,
    views,
});

const ALL_PROPERTIES = {
    "renderizr.logo": "logo.svg",
    "renderizr.logoAlt": "Acme",
    "renderizr.logoHref": "https://acme.example",
    "renderizr.font": "Inter",
    "renderizr.primaryColor": "#e4572e",
};

const SOURCE = "/work/arch/workspace.json";
const CWD = "/work";

/* ------------------------------------------------------- chooseBranding */

test("with no flags and no properties, nothing is branded and the logo's alt text stays empty", () => {
    const chosen = chooseBranding({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith(),
        source: SOURCE,
        cwd: CWD,
    });
    assert.equal(chosen.logo, null);
    assert.equal(chosen.font, null);
    assert.equal(chosen.primaryColor, null);
});

test("the workspace's renderizr.* properties brand the site when no flag is passed", () => {
    const chosen = chooseBranding({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith(ALL_PROPERTIES),
        source: SOURCE,
        cwd: CWD,
    });
    assert.deepEqual(chosen.logo, {
        source: "/work/arch/logo.svg",
        alt: "Acme",
        href: "https://acme.example",
    });
    assert.deepEqual(chosen.font, {
        family: "Inter",
        weights: ["400", "700"],
        subsets: ["latin"],
        italic: false,
    });
    assert.equal(chosen.primaryColor, "#e4572e");
});

test("every flag overrides its workspace property for the run", () => {
    const chosen = chooseBranding({
        flags: flags({
            logo: "brand/other.png",
            logoAlt: "Other",
            logoHref: "https://other.example",
            font: "Lora",
            fontWeights: ["300"],
            primaryColor: "rebeccapurple",
        }),
        workspace: workspaceWith(ALL_PROPERTIES),
        source: SOURCE,
        cwd: CWD,
    });
    assert.deepEqual(chosen.logo, {
        source: "brand/other.png",
        alt: "Other",
        href: "https://other.example",
    });
    assert.equal(chosen.font.family, "Lora");
    assert.deepEqual(chosen.font.weights, ["300"]);
    assert.equal(chosen.primaryColor, "rebeccapurple");
});

test("--logo-alt and --logo-href apply to the workspace's logo", () => {
    const { logo } = chooseBranding({
        flags: flags({ logoAlt: "Flagged" }),
        workspace: workspaceWith({ "renderizr.logo": "logo.svg" }),
        source: SOURCE,
        cwd: CWD,
    });
    assert.equal(logo.alt, "Flagged");
    assert.equal(logo.href, null);
});

test("a relative renderizr.logo resolves against the workspace file, or the workspace URL", () => {
    const cases = [
        [SOURCE, "logo.svg", "/work/arch/logo.svg"],
        [SOURCE, "../brand/logo.svg", "/work/brand/logo.svg"],
        ["arch/workspace.json", "logo.svg", resolve("arch/logo.svg")],
        [
            "https://example.test/arch/workspace.json",
            "logo.svg",
            "https://example.test/arch/logo.svg",
        ],
        [
            SOURCE,
            "https://cdn.example/logo.svg",
            "https://cdn.example/logo.svg",
        ],
        [SOURCE, "data:image/svg+xml,<svg/>", "data:image/svg+xml,<svg/>"],
    ];
    for (const [source, value, expected] of cases) {
        const { logo } = chooseBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({ "renderizr.logo": value }),
            source,
            cwd: process.cwd(),
        });
        assert.equal(logo.source, expected, `${value} in ${source}`);
    }
});

test("a renderizr.primaryColor that isn't a CSS color fails, naming the property and the workspace", () => {
    assert.throws(
        () =>
            chooseBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith({
                    "renderizr.primaryColor": "red; } body { x",
                }),
                source: SOURCE,
                cwd: CWD,
            }),
        /renderizr\.primaryColor in \/work\/arch\/workspace\.json takes a CSS color.*got "red; } body \{ x"/,
    );
});

test("a workspace value that a flag overrides is never checked", () => {
    const { primaryColor } = chooseBranding({
        flags: flags({ primaryColor: "#fff" }),
        workspace: workspaceWith({ "renderizr.primaryColor": "not a color" }),
        source: SOURCE,
        cwd: CWD,
    });
    assert.equal(primaryColor, "#fff");
});

/* ------------------------------------------------------ brandingNotices */

test("a branding block with a logo or a font and no matching property draws a one-line notice", () => {
    const block = { configuration: { branding: { font: { name: "Inter" } } } };
    for (const [properties, expected] of [
        [{}, 1],
        [{ "renderizr.font": "Inter" }, 0],
    ]) {
        const notices = brandingNotices({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith(properties, block),
            source: SOURCE,
            cwd: CWD,
        });
        assert.equal(notices.length, expected, JSON.stringify(properties));
    }
    const [notice] = brandingNotices({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith(
            {},
            { configuration: { branding: { logo: "x" } } },
        ),
        source: SOURCE,
        cwd: CWD,
    });
    assert.match(notice, /renderizr\.logo/);
    assert.match(notice, /renderizr\.font/);
    assert.ok(!notice.includes("\n"), "the notice spans more than one line");
});

test("flags that match the workspace print no hint", () => {
    const notices = brandingNotices({
        flags: flags({
            logo: "arch/logo.svg",
            font: "Inter",
            primaryColor: "#e4572e",
        }),
        workspace: workspaceWith(ALL_PROPERTIES),
        source: SOURCE,
        cwd: CWD,
    });
    assert.deepEqual(notices, []);
});

test("a flag that differs from the workspace prints a ready-to-paste properties block", () => {
    const [hint] = brandingNotices({
        flags: flags({
            logo: "brand/logo.png",
            logoAlt: "Acme",
            primaryColor: "#000",
        }),
        workspace: workspaceWith({ "renderizr.logoAlt": "Acme" }),
        source: SOURCE,
        cwd: CWD,
    });
    assert.match(
        hint,
        /properties \{\n {8}"renderizr\.logo" "\.\.\/brand\/logo\.png"\n {8}"renderizr\.primaryColor" "#000"\n {4}\}/,
    );
    assert.ok(!hint.includes("logoAlt"), "an unchanged value made the hint");
});

test("the hint leaves a local --logo out for a workspace read from a URL, and says why", () => {
    const [hint] = brandingNotices({
        flags: flags({ logo: "logo.svg", font: "Inter" }),
        workspace: workspaceWith(),
        source: "https://example.test/workspace.json",
        cwd: CWD,
    });
    assert.match(hint, /"renderizr\.font" "Inter"/);
    assert.ok(!hint.includes('"renderizr.logo"'));
    assert.match(hint, /keep --logo in the workspace: it names a local file/);
});

test("the hint prints a URL logo as given", () => {
    const [hint] = brandingNotices({
        flags: flags({ logo: "https://cdn.example/logo.svg" }),
        workspace: workspaceWith(),
        source: SOURCE,
        cwd: CWD,
    });
    assert.match(hint, /"renderizr\.logo" "https:\/\/cdn\.example\/logo\.svg"/);
});

/* --------------------------------------------------------- loadBranding */

test("loadBranding loads the workspace's logo beside the workspace file", async () => {
    await withTempDir(async (dir) => {
        const source = join(dir, "workspace.json");
        await writeFile(join(dir, "mark.png"), PNG);
        const branding = await loadBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({ "renderizr.logo": "mark.png" }),
            source,
        });
        assert.ok(branding.logo.src.startsWith("data:image/png;base64,"));
        assert.equal(branding.font, null);
        assert.deepEqual(branding.notices, []);
    });
});

test("a workspace logo that won't load fails, naming the property and the workspace", async () => {
    await withTempDir(async (dir) => {
        const source = join(dir, "workspace.json");
        await assert.rejects(
            loadBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith({
                    "renderizr.logo": fixture("logo-scripted.svg"),
                }),
                source,
            }),
            (error) => {
                assert.match(error.message, /^renderizr\.logo in /);
                assert.ok(error.message.includes(source));
                assert.match(error.message, /contains script/);
                return true;
            },
        );
    });
});

test("a workspace logo read from the workspace URL is fetched beside it", async () => {
    await withFetch(
        { "https://example.test/arch/logo.png": { body: PNG } },
        async () => {
            const { logo } = await loadBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith({ "renderizr.logo": "logo.png" }),
                source: "https://example.test/arch/workspace.json",
            });
            assert.equal(logo.width, 120);
        },
    );
});

/* ---------------------------------------------------- edit mode reloads */

test("brandingChanges names the properties that changed and no flag overrides", () => {
    const start = brandingProperties(workspaceWith(ALL_PROPERTIES));
    const reloaded = workspaceWith({
        ...ALL_PROPERTIES,
        "renderizr.font": "Lora",
        "renderizr.primaryColor": "#000",
    });
    assert.deepEqual(brandingChanges(start, reloaded, NO_BRANDING_FLAGS), [
        "renderizr.font",
        "renderizr.primaryColor",
    ]);
    assert.deepEqual(
        brandingChanges(start, reloaded, flags({ primaryColor: "#fff" })),
        ["renderizr.font"],
    );
    assert.deepEqual(
        brandingChanges(
            start,
            workspaceWith(ALL_PROPERTIES),
            NO_BRANDING_FLAGS,
        ),
        [],
    );
});

test("checkBranding refuses an invalid color or logo and passes a valid set", async () => {
    await checkBranding({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith({
            "renderizr.primaryColor": "#000",
            "renderizr.logo": fixture("logo.png"),
            "renderizr.font": "Not Fetched",
        }),
        source: SOURCE,
    });
    await assert.rejects(
        checkBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({ "renderizr.primaryColor": "nope!" }),
            source: SOURCE,
        }),
        /renderizr\.primaryColor/,
    );
    await assert.rejects(
        checkBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({
                "renderizr.logo": fixture("logo-scripted.svg"),
            }),
            source: SOURCE,
        }),
        /renderizr\.logo/,
    );
});

/* ----------------------------------------------------------------- a set */

const LANDSCAPE_SOURCE = "/work/landscape/workspace.json";
const MEMBER_SOURCE = "/work/teams/orders/workspace.json";

/** A software system scoped workspace of a set, as `chooseBranding` takes it. */
const memberOf = (properties, landscapeProperties, set = {}) => ({
    flags: flags(set),
    workspace: workspaceWith(properties),
    source: MEMBER_SOURCE,
    landscape: {
        workspace: workspaceWith(landscapeProperties),
        source: LANDSCAPE_SOURCE,
    },
    cwd: CWD,
});

test("in a set, each value comes from the flag, then the workspace, then the landscape scoped workspace, then the default", () => {
    const steps = [
        // [flag, own, landscape's, chosen, origin]
        ["#111", "#222", "#333", "#111", "flag"],
        [null, "#222", "#333", "#222", "workspace"],
        [null, null, "#333", "#333", "landscape"],
        [null, null, null, null, null],
    ];
    const property = (value) =>
        value ? { "renderizr.primaryColor": value } : {};
    for (const [flag, own, landscape, chosen, origin] of steps) {
        const branding = chooseBranding(
            memberOf(property(own), property(landscape), {
                primaryColor: flag,
            }),
        );
        assert.equal(branding.primaryColor, chosen, `${flag} ${own}`);
        assert.equal(branding.origin.primaryColor, origin);
    }
    const { font, logo } = chooseBranding(
        memberOf(
            { "renderizr.logoAlt": "Orders" },
            {
                "renderizr.font": "Inter",
                "renderizr.logo": "logo.svg",
                "renderizr.logoAlt": "Acme",
                "renderizr.logoHref": "https://acme.example",
            },
        ),
    );
    assert.equal(font.family, "Inter");
    assert.deepEqual(logo, {
        source: "/work/landscape/logo.svg",
        alt: "Orders",
        href: "https://acme.example",
    });
});

test("a flag brands every workspace of the set, whatever its properties", () => {
    const set = { font: "Lora", primaryColor: "#000" };
    const landscape = chooseBranding({
        flags: flags(set),
        workspace: workspaceWith(ALL_PROPERTIES),
        source: LANDSCAPE_SOURCE,
        cwd: CWD,
    });
    const member = chooseBranding(
        memberOf(ALL_PROPERTIES, ALL_PROPERTIES, set),
    );
    for (const branding of [landscape, member]) {
        assert.equal(branding.font.family, "Lora");
        assert.equal(branding.primaryColor, "#000");
    }
});

test("a relative renderizr.logo in a set resolves beside the workspace that sets it", () => {
    const cases = [
        [{ "renderizr.logo": "logo.svg" }, {}, "/work/teams/orders/logo.svg"],
        [{}, { "renderizr.logo": "logo.svg" }, "/work/landscape/logo.svg"],
    ];
    for (const [own, landscape, expected] of cases) {
        const { logo } = chooseBranding(memberOf(own, landscape));
        assert.equal(logo.source, expected);
    }
    const { logo } = chooseBranding({
        ...memberOf({}, {}),
        landscape: {
            workspace: workspaceWith({ "renderizr.logo": "logo.svg" }),
            source: "https://example.test/landscape/workspace.json",
        },
    });
    assert.equal(logo.source, "https://example.test/landscape/logo.svg");
});

test("in a set, an invalid value the build uses fails, naming the property and the file that sets it", () => {
    const wrong = { "renderizr.primaryColor": "not a color" };
    assert.throws(
        () => chooseBranding(memberOf(wrong, {})),
        /renderizr\.primaryColor in \/work\/teams\/orders\/workspace\.json takes a CSS color/,
    );
    assert.throws(
        () => chooseBranding(memberOf({}, wrong)),
        /renderizr\.primaryColor in \/work\/landscape\/workspace\.json takes a CSS color/,
    );
});

test("in a set, an invalid value the build doesn't use goes unchecked", () => {
    const wrong = { "renderizr.primaryColor": "not a color" };
    const cases = [
        // A flag overrides the workspace's own value.
        [memberOf(wrong, {}, { primaryColor: "#fff" }), "#fff"],
        // The workspace's own value hides the landscape's.
        [memberOf({ "renderizr.primaryColor": "#222" }, wrong), "#222"],
    ];
    for (const [input, expected] of cases) {
        assert.equal(chooseBranding(input).primaryColor, expected);
    }
});

test("a landscape logo that won't load fails a member, naming the property and the landscape's file", async () => {
    await withTempDir(async (dir) => {
        const landscapeSource = join(dir, "landscape-workspace.json");
        await assert.rejects(
            loadBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith(),
                source: join(dir, "orders-workspace.json"),
                landscape: {
                    workspace: workspaceWith({
                        "renderizr.logo": fixture("logo-scripted.svg"),
                    }),
                    source: landscapeSource,
                },
            }),
            (error) => {
                assert.ok(
                    error.message.startsWith(
                        `renderizr.logo in ${landscapeSource}: `,
                    ),
                    error.message,
                );
                return true;
            },
        );
    });
});

test("a set prints one properties block, for the landscape scoped workspace, and says it brands the whole set", () => {
    const set = flags({ primaryColor: "#000" });
    const [hint] = brandingNotices({
        flags: set,
        workspace: workspaceWith(),
        source: LANDSCAPE_SOURCE,
        cwd: CWD,
        brandsSet: true,
    });
    assert.match(hint, /"renderizr\.primaryColor" "#000"/);
    assert.match(hint, /landscape scoped workspace/);
    assert.match(hint, /every workspace of the set/);

    const [lone] = brandingNotices({
        flags: set,
        workspace: workspaceWith(),
        source: LANDSCAPE_SOURCE,
        cwd: CWD,
    });
    assert.ok(!lone.includes(" set"), "a lone workspace's hint names a set");

    const member = brandingNotices({ ...memberOf({}, {}), flags: set });
    assert.deepEqual(member, []);
});

test("loadSetBranding loads each workspace's branding and fetches a shared font once", async () => {
    const css = `/* latin */\n@font-face {\n  font-family: 'Inter';\n  src: url(https://fonts.gstatic.com/a.woff2) format('woff2');\n}`;
    await withTempDir(async (dir) => {
        const source = (name) => join(dir, `${name}-workspace.json`);
        await writeFile(join(dir, "mark.png"), PNG);
        const set = {
            landscape: {
                source: source("landscape"),
                workspace: workspaceWith({
                    "renderizr.font": "Inter",
                    "renderizr.primaryColor": "#111",
                }),
            },
            workspaces: [
                {
                    slug: "orders",
                    source: source("orders"),
                    workspace: workspaceWith({ "renderizr.logo": "mark.png" }),
                },
                {
                    slug: "payments",
                    source: source("payments"),
                    workspace: workspaceWith({
                        "renderizr.primaryColor": "#222",
                    }),
                },
            ],
        };
        await withFetch(
            {
                "https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=block":
                    { body: css },
                "https://fonts.gstatic.com/a.woff2": { body: "woff2" },
            },
            async (calls) => {
                const { landscape, workspaces } = await loadSetBranding({
                    flags: NO_BRANDING_FLAGS,
                    set,
                });
                assert.equal(landscape.font.family, "Inter");
                assert.equal(landscape.primaryColor, "#111");
                assert.deepEqual(
                    workspaces.map((branding) => [
                        branding.font.family,
                        branding.primaryColor,
                        Boolean(branding.logo),
                    ]),
                    [
                        ["Inter", "#111", true],
                        ["Inter", "#222", false],
                    ],
                );
                assert.equal(workspaces[0].font.css, landscape.font.css);
                assert.equal(calls.length, 2, "the font was fetched again");
            },
        );
    });
});
