import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
    EXPORT_FORMATS,
    EXPORT_OPTIONS,
    exportUsage,
    parseExportArgs,
} from "./cli.js";
import { loadWorkspace } from "./assets.js";
import {
    exportFont,
    exportJobs,
    runExport,
    STAND_IN_FAMILY,
} from "./export.js";
import { loadExportEngine } from "./export-engine.js";
import {
    evalInChild,
    fixture,
    REPO_ROOT,
    runCli,
    withFetch,
    withTempDir,
} from "./__fixtures__/helpers.js";
import { NO_BRANDING_FLAGS } from "./branding.js";

// No test here reads or writes the project's font cache.
process.env.RENDERIZR_CACHE_DIR = "";

const EXPORT_FIXTURE = join(REPO_ROOT, "test/__fixtures__/export.json");
const VIEW_TYPES = join(REPO_ROOT, "test/__fixtures__/view-types.json");
const PERSPECTIVES = join(REPO_ROOT, "test/__fixtures__/perspectives.json");
const FLOWCHART = join(REPO_ROOT, "test/__fixtures__/mermaid-flowchart.json");
const ENTERPRISE = join(REPO_ROOT, "test/__fixtures__/enterprise");
const MERMAID_STYLES = join(REPO_ROOT, "test/__fixtures__/mermaid-styles.json");

/* ------------------------------------------------------------ arguments */

/** `parseExportArgs(args)` in a child, since it exits on help and errors. */
const parseInChild = (args) =>
    evalInChild(`
        import { parseExportArgs } from "./scripts/cli.js";
        parseExportArgs(${JSON.stringify(args)});
        process.stdout.write("NOT REACHED");
    `);

const rejects = async (args, expected) => {
    await assert.rejects(
        parseInChild(args),
        (error) => {
            assert.equal(error.code, 1, `${args.join(" ")} did not exit 1`);
            assert.match(error.stderr, expected);
            assert.match(
                error.stderr,
                /renderizr export: write an SVG of every view/,
                "the export usage was not printed on the error path",
            );
            return true;
        },
        `${args.join(" ")} was accepted`,
    );
};

test("a bare workspace exports SVG and PNG into structurizr-output with no font", () => {
    assert.deepEqual(parseExportArgs(["workspace.json"]), {
        workspaces: ["workspace.json"],
        out: "structurizr-output",
        formats: ["svg", "png"],
        views: null,
        schemes: ["light"],
        perspectives: [],
        branding: NO_BRANDING_FLAGS,
    });
});

test("--view limits the run to its keys, each once", () => {
    assert.deepEqual(
        parseExportArgs(["w.json", "--view", "Containers, Context,Containers"])
            .views,
        ["Containers", "Context"],
    );
});

test("--dark-scheme adds the dark scheme after the light one", () => {
    assert.deepEqual(parseExportArgs(["w.json", "--dark-scheme"]).schemes, [
        "light",
        "dark",
    ]);
});

test("--perspective takes each perspective once, as written", () => {
    assert.deepEqual(
        parseExportArgs([
            "w.json",
            "--perspective",
            "Security, Data Flow,Security",
        ]).perspectives,
        ["Security", "Data Flow"],
    );
});

test("an empty --view or --perspective is a usage error", async () => {
    await rejects(["w.json", "--view", ","], /--view takes view keys/);
    await rejects(
        ["w.json", "--perspective", " "],
        /--perspective takes perspective names/,
    );
});

test("the logo flags and --primary-color pass as the build's", () => {
    const { branding } = parseExportArgs([
        "w.json",
        "--logo",
        "logo.svg",
        "--logo-alt",
        "Acme",
        "--logo-href",
        "https://acme.example",
        "--primary-color",
        "#e4572e",
    ]);
    assert.equal(branding.logo, "logo.svg");
    assert.equal(branding.logoAlt, "Acme");
    assert.equal(branding.logoHref, "https://acme.example");
    assert.equal(branding.primaryColor, "#e4572e");
});

test("a --primary-color that is no CSS color is a usage error", async () => {
    await rejects(
        ["w.json", "--primary-color", "red; color: blue"],
        /--primary-color takes a CSS color/,
    );
});

test("several workspaces, a set among them, are accepted as the build's", () => {
    assert.deepEqual(
        parseExportArgs([
            "landscape.json",
            "teams/",
            "https://x.example/w.json",
        ]).workspaces,
        ["landscape.json", "teams/", "https://x.example/w.json"],
    );
});

test("--out and -o set the folder, and the font flags pass as the build's", () => {
    for (const flag of ["--out", "-o"]) {
        assert.equal(parseExportArgs(["w.json", flag, "images"]).out, "images");
    }
    const { branding } = parseExportArgs([
        "w.json",
        "--font",
        "Inter",
        "--font-weights",
        "400, 600",
        "--font-subsets",
        "latin,cyrillic",
        "--font-italic",
    ]);
    assert.equal(branding.font, "Inter");
    assert.deepEqual(branding.fontWeights, ["400", "600"]);
    assert.deepEqual(branding.fontSubsets, ["latin", "cyrillic"]);
    assert.equal(branding.fontItalic, true);
});

test("--format takes a list of formats, each counted once, in the order the run writes them", () => {
    const formats = (value) =>
        parseExportArgs(["w.json", "--format", value]).formats;
    assert.deepEqual(formats("svg, svg"), ["svg"]);
    assert.deepEqual(formats("png"), ["png"]);
    assert.deepEqual(formats("png,svg"), ["svg", "png"]);
});

test("an unknown format is a usage error", async () => {
    await rejects(
        ["w.json", "--format", "gif"],
        /--format takes svg, png; got "gif"/,
    );
    await rejects(["w.json", "--format", "svg,jpeg"], /got "svg,jpeg"/);
    await rejects(["w.json", "--format", ","], /--format takes svg, png/);
});

test("no workspace is a usage error", async () => {
    await rejects([], /Missing the workspace to export\./);
});

test("a build-only flag is a usage error", async () => {
    await rejects(["w.json", "--single-file"], /--single-file/);
});

test("--help prints the export usage, naming every option, and exits 0", async () => {
    for (const flag of ["--help", "-h"]) {
        const { stdout } = await parseInChild([flag]);
        assert.match(stdout, /renderizr export: write an SVG of every view/);
        assert.ok(!stdout.includes("NOT REACHED"), `${flag} kept going`);
        for (const name of Object.keys(EXPORT_OPTIONS)) {
            assert.ok(
                stdout.includes(`--${name}`),
                `the usage never mentions --${name}`,
            );
        }
        assert.ok(!stdout.includes("—"), "the usage has an em dash");
    }
});

test("the usage names every format", () => {
    let written = "";
    exportUsage({ write: (text) => (written += text) });
    for (const format of EXPORT_FORMATS) assert.ok(written.includes(format));
});

test("renderizr export --help reaches the export usage, and renderizr --help lists it", async () => {
    const help = await runCli(["export", "--help"]);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /renderizr export: write an SVG of every view/);
    const main = await runCli(["--help"]);
    assert.match(
        main.stdout,
        /renderizr export <workspace\|url\|folder>\.\.\./,
    );
});

/* ---------------------------------------------------------------- loading */

test("the build and edit mode load neither fontkit, resvg nor the export", async () => {
    for (const args of [["--help"], ["edit", "--help"]]) {
        const { stdout } = await evalInChild(`
            import { registerHooks } from "node:module";
            const seen = [];
            registerHooks({
                resolve(specifier, context, next) {
                    const resolved = next(specifier, context);
                    if (/fontkit|resvg|scripts\\/export/.test(resolved.url)) seen.push(resolved.url);
                    return resolved;
                },
            });
            process.on("exit", () => console.log("\\n" + JSON.stringify(seen)));
            process.argv = [process.argv[0], "scripts/build.js", ...${JSON.stringify(args)}];
            await import("./scripts/build.js");
        `);
        assert.deepEqual(JSON.parse(stdout.trim().split("\n").at(-1)), []);
    }
});

/* ------------------------------------------------------------------ fonts */

test("Arimo stands in, with the run's font options, when neither the run nor the workspace sets a font", () => {
    const chosen = exportFont({
        flags: { ...NO_BRANDING_FLAGS, fontSubsets: ["latin-ext"] },
        workspace: { name: "W" },
        source: "w.json",
        cwd: REPO_ROOT,
    });
    assert.deepEqual(chosen, {
        font: {
            family: STAND_IN_FAMILY,
            weights: ["400", "700"],
            subsets: ["latin-ext"],
            italic: false,
        },
        embed: false,
        primaryColor: null,
    });
});

test("a font the run or the workspace sets is embedded", () => {
    const fromFlag = exportFont({
        flags: { ...NO_BRANDING_FLAGS, font: "Inter" },
        workspace: { properties: { "renderizr.font": "Lato" } },
        source: "w.json",
        cwd: REPO_ROOT,
    });
    assert.equal(fromFlag.font.family, "Inter");
    assert.equal(fromFlag.embed, true);
    const fromWorkspace = exportFont({
        flags: NO_BRANDING_FLAGS,
        workspace: { properties: { "renderizr.font": "Lato" } },
        source: "w.json",
        cwd: REPO_ROOT,
    });
    assert.equal(fromWorkspace.font.family, "Lato");
    assert.equal(fromWorkspace.embed, true);
});

test("the primary color comes from the flag, the workspace, then the set's landscape scoped workspace", () => {
    const landscape = {
        workspace: { properties: { "renderizr.primaryColor": "#2e7d32" } },
        source: "landscape.json",
    };
    const color = (flags, properties) =>
        exportFont({
            flags: { ...NO_BRANDING_FLAGS, ...flags },
            workspace: { name: "Orders", properties },
            source: "orders.json",
            landscape,
            cwd: REPO_ROOT,
        }).primaryColor;
    assert.equal(color({}, {}), "#2e7d32");
    assert.equal(color({}, { "renderizr.primaryColor": "#b0306a" }), "#b0306a");
    assert.equal(
        color(
            { primaryColor: "#e4572e" },
            { "renderizr.primaryColor": "#b0306a" },
        ),
        "#e4572e",
    );
});

test("the jobs are each view's light export unless the run asks for more schemes", () => {
    const views = [{ key: "A" }, { key: "B" }];
    assert.deepEqual(exportJobs(views), [
        { key: "A", scheme: "light", perspective: null },
        { key: "B", scheme: "light", perspective: null },
    ]);
    assert.deepEqual(
        exportJobs(views, { schemes: ["light", "dark"] }).map(
            ({ key, scheme }) => `${key}-${scheme}`,
        ),
        ["A-light", "A-dark", "B-light", "B-dark"],
    );
});

test("--view keeps only the views it names, in the workspace's order", () => {
    const views = [{ key: "A" }, { key: "B" }, { key: "C" }];
    assert.deepEqual(
        exportJobs(views, { views: ["C", "A"] }).map(({ key }) => key),
        ["A", "C"],
    );
});

test("each perspective adds a job of every view after its plain export", () => {
    const views = [{ key: "A" }, { key: "B" }];
    assert.deepEqual(
        exportJobs(views, {
            schemes: ["light", "dark"],
            perspectives: ["Security"],
        }).map(
            ({ key, scheme, perspective }) =>
                `${key}-${perspective ?? "plain"}-${scheme}`,
        ),
        [
            "A-plain-light",
            "A-plain-dark",
            "A-Security-light",
            "A-Security-dark",
            "B-plain-light",
            "B-plain-dark",
            "B-Security-light",
            "B-Security-dark",
        ],
    );
});

/* -------------------------------------------------------------------- run */

// Arimo (Apache 2.0) cut down to a few glyphs, as Google Fonts serves it.
const WOFF2 = await readFile(fixture("fonts/arimo-variable.woff2"));
const FACE_URL = "https://fonts.gstatic.com/s/stub/arimo.woff2";

/**
 * Google Fonts as the export reaches it: one variable latin face for any
 * family, with the fixture's bytes. `families` collects each family asked.
 */
const googleFonts = (families) => ({
    [FACE_URL]: { body: WOFF2 },
    default: (url) => {
        const parsed = new URL(url);
        if (parsed.hostname !== "fonts.googleapis.com")
            return new Error(`unstubbed fetch: ${url}`);
        const family = parsed.searchParams.get("family").split(":")[0];
        families.push(family);
        return {
            body: `/* latin */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: 400 700;\n  font-display: block;\n  src: url(${FACE_URL}) format('woff2');\n}\n`,
        };
    },
});

/** A stream that keeps what is written to it. */
const sink = () => {
    const stream = { text: "", write: (chunk) => (stream.text += chunk) };
    return stream;
};

/**
 * `runExport` over `workspace` into `out`, offline, with `flags`, answering
 * fetches from `routes(families)` (Google Fonts by default).
 */
async function exportOffline(
    workspace,
    out,
    flags = {},
    extra = {},
    routes = googleFonts,
) {
    const families = [];
    const stdout = sink();
    const stderr = sink();
    // `loadFont` says what it embeds on the process's own stdout.
    const announced = sink();
    const original = process.stdout.write;
    process.stdout.write = announced.write;
    try {
        const code = await withFetch(routes(families), () =>
            runExport(
                {
                    workspaces: [workspace],
                    out,
                    formats: ["svg"],
                    branding: { ...NO_BRANDING_FLAGS, ...flags },
                    ...extra,
                },
                { cwd: REPO_ROOT, stdout, stderr, now: new Date("2026-11-21") },
            ),
        );
        return {
            code,
            families,
            stdout: stdout.text + announced.text,
            stderr: stderr.text,
        };
    } finally {
        process.stdout.write = original;
    }
}

test("every view's SVG is written as <workspace>-<view key>.svg, and other files stay", async () => {
    await withTempDir(async (out) => {
        await writeFile(join(out, "notes.txt"), "mine");
        const run = await exportOffline(EXPORT_FIXTURE, out);
        assert.equal(run.code, 0, run.stderr);
        assert.deepEqual((await readdir(out)).sort(), [
            "export-workspace-auto-frame.svg",
            "export-workspace-containers.svg",
            "export-workspace-request.svg",
            "notes.txt",
        ]);
        assert.equal(await readFile(join(out, "notes.txt"), "utf8"), "mine");
    });
});

/** A PNG's width and height, from its header. */
const pngHeader = (png) => {
    assert.equal(
        png.subarray(1, 4).toString("latin1"),
        "PNG",
        "the file is no PNG",
    );
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

/** An SVG's own `width` and `height`. */
const svgSize = (svg) => {
    const [, width, height] =
        /^<svg [^>]*?width="([\d.]+)" height="([\d.]+)"/.exec(svg);
    return { width: Number(width), height: Number(height) };
};

test("each view's PNG is written beside its SVG, at the toolbar's PNG size", async () => {
    const engine = await loadExportEngine();
    await withTempDir(async (out) => {
        const run = await exportOffline(
            EXPORT_FIXTURE,
            out,
            {},
            { formats: ["svg", "png"] },
        );
        assert.equal(run.code, 0, run.stderr);
        const names = [
            "export-workspace-auto-frame",
            "export-workspace-containers",
            "export-workspace-request",
        ];
        assert.deepEqual(
            (await readdir(out)).sort(),
            names.flatMap((name) => [`${name}.png`, `${name}.svg`]),
        );
        for (const name of names) {
            const svg = await readFile(join(out, `${name}.svg`), "utf8");
            const { width, height } = svgSize(svg);
            assert.deepEqual(
                pngHeader(await readFile(join(out, `${name}.png`))),
                engine.pngSize(width, height),
                name,
            );
            assert.match(
                run.stdout,
                new RegExp(`^Wrote .*${name}\\.png$`, "m"),
            );
        }
    });
});

test("--format png writes only the PNGs", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(
            EXPORT_FIXTURE,
            out,
            {},
            { formats: ["png"] },
        );
        assert.equal(run.code, 0, run.stderr);
        assert.deepEqual((await readdir(out)).sort(), [
            "export-workspace-auto-frame.png",
            "export-workspace-containers.png",
            "export-workspace-request.png",
        ]);
    });
});

test("two runs write the same bytes, SVG and PNG", async () => {
    await withTempDir(async (dir) => {
        for (const run of ["first", "second"]) {
            await exportOffline(
                EXPORT_FIXTURE,
                join(dir, run),
                { font: "Arimo" },
                { formats: ["svg", "png"] },
            );
        }
        const names = (await readdir(join(dir, "first"))).sort();
        assert.equal(names.length, 6);
        assert.deepEqual((await readdir(join(dir, "second"))).sort(), names);
        for (const name of names) {
            assert.ok(
                (await readFile(join(dir, "first", name))).equals(
                    await readFile(join(dir, "second", name)),
                ),
                `${name} differs between the runs`,
            );
        }
    });
});

test("Arimo measures the text, and the SVG names the fallback stack and embeds no font", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(EXPORT_FIXTURE, out);
        assert.deepEqual([...new Set(run.families)], ["Arimo"]);
        assert.ok(!run.stdout.includes("Embedded"), run.stdout);
        const svg = await readFile(
            join(out, "export-workspace-containers.svg"),
            "utf8",
        );
        assert.match(
            svg,
            /^<svg [^>]*font-family="Helvetica, Arial, sans-serif"/,
        );
        assert.ok(!svg.includes("<style>"), "the SVG embeds a font");
        assert.ok(!svg.includes("Arimo"), "the SVG names Arimo");
    });
});

test("the stand-in sets the text exactly as --font Arimo does", async () => {
    await withTempDir(async (dir) => {
        await exportOffline(EXPORT_FIXTURE, join(dir, "stand-in"));
        await exportOffline(EXPORT_FIXTURE, join(dir, "arimo"), {
            font: "Arimo",
        });
        const name = "export-workspace-containers.svg";
        const standIn = await readFile(join(dir, "stand-in", name), "utf8");
        const arimo = await readFile(join(dir, "arimo", name), "utf8");
        assert.equal(
            arimo
                .replace(/<style>[\s\S]*?<\/style>/, "")
                .replace(
                    'font-family="&quot;Arimo&quot;, Helvetica, Arial, sans-serif"',
                    'font-family="Helvetica, Arial, sans-serif"',
                ),
            standIn,
        );
    });
});

test("--font embeds that family's faces and names it first", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(EXPORT_FIXTURE, out, {
            font: "Inter",
        });
        assert.deepEqual([...new Set(run.families)], ["Inter"]);
        assert.match(run.stdout, /Embedded Inter/);
        const svg = await readFile(
            join(out, "export-workspace-containers.svg"),
            "utf8",
        );
        assert.match(
            svg,
            /^<svg [^>]*font-family="&quot;Inter&quot;, Helvetica, Arial, sans-serif"/,
        );
        assert.match(
            svg,
            /<style>@font-face \{[^}]*font-family: 'Inter';[^}]*url\(data:font\/woff2;base64,/,
        );
        assert.ok(
            !svg.includes("--renderizr-font"),
            "the page variable leaked",
        );
    });
});

test("the SVG shows every description and technology and a title block dated by the run", async () => {
    await withTempDir(async (out) => {
        await exportOffline(VIEW_TYPES, out);
        const svg = await readFile(
            join(out, "view-types-warehouse.svg"),
            "utf8",
        );
        // View types holds no lastModifiedDate: the run's date stands in.
        assert.ok(
            svg.includes(
                `Last updated: ${new Date("2026-11-21").toLocaleDateString()}<`,
            ),
            "the title block does not carry the run's date",
        );
        assert.match(svg, />\[Hardware\]</);
        assert.match(svg, />Reads parcel labels</);
    });
});

test("an ERD's entities draw expanded", async () => {
    const engine = await loadExportEngine();
    assert.deepEqual(engine.EXPORT_LABELS, {
        descriptions: true,
        technologies: true,
        entitiesCollapsed: false,
    });
    const workspace = await withFetch({}, () =>
        loadWorkspace(join(REPO_ROOT, "test/__fixtures__/mermaid-erd.json")),
    );
    const model = new engine.WorkspaceModel(workspace);
    const lines = (labels) => {
        const result = engine.exportView(
            model,
            workspace,
            "shop",
            {
                scheme: "light",
                text: {
                    measure: (text, size) => text.length * size * 0.5,
                    ascent: 0.9,
                    descent: 0.2,
                    font: null,
                    fontFaces: "",
                },
                built: null,
                version: null,
            },
            labels,
        );
        return result.exported.svg.match(/<text/g).length;
    };
    assert.ok(
        lines(engine.EXPORT_LABELS) >
            lines({ ...engine.EXPORT_LABELS, entitiesCollapsed: true }),
        "the export draws the entities collapsed",
    );
});

test("image views are skipped with one line each", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(VIEW_TYPES, out);
        assert.equal(run.code, 0, run.stderr);
        const skipped = run.stderr
            .split("\n")
            .filter((line) => line.startsWith("Skipped "));
        assert.deepEqual(skipped.sort(), [
            "Skipped NoPicture: an image view has no export",
            "Skipped Picture: an image view has no export",
            "Skipped SizelessPicture: an image view has no export",
        ]);
        const written = await readdir(out);
        assert.ok(!written.some((name) => /picture/i.test(name)), written);
        assert.ok(written.includes("view-types-warehouse.svg"), written);
    });
});

test("a view that fails is reported with its key, the others are written, and the run exits 1", async () => {
    await withTempDir(async (out) => {
        // A folder where the Containers export goes makes its write fail.
        await mkdir(join(out, "export-workspace-containers.svg"));
        const run = await exportOffline(EXPORT_FIXTURE, out);
        assert.equal(run.code, 1);
        assert.match(run.stderr, /^Failed Containers: /m);
        const written = await readdir(out);
        assert.ok(written.includes("export-workspace-auto-frame.svg"));
        assert.ok(written.includes("export-workspace-request.svg"));
    });
});

test("the CLI exits 1 when a view fails", async () => {
    await withTempDir(async (out) => {
        await mkdir(join(out, "export-workspace-request.svg"));
        const run = await runCli(
            ["export", EXPORT_FIXTURE, "--out", out, "--font", "Arimo"],
            {
                env: {
                    NODE_OPTIONS: `--import ${new URL("./__fixtures__/stub-fonts.js", import.meta.url).href}`,
                },
            },
        );
        assert.equal(run.code, 1, run.stderr);
        assert.match(run.stderr, /^Failed Request: /m);
        assert.ok(
            (await readdir(out)).includes("export-workspace-containers.svg"),
        );
    });
});

test("--view writes only the views it names", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(
            EXPORT_FIXTURE,
            out,
            {},
            {
                views: ["Request"],
            },
        );
        assert.equal(run.code, 0, run.stderr);
        assert.deepEqual(await readdir(out), ["export-workspace-request.svg"]);
    });
});

test("a --view key no workspace has is a usage error, and nothing is written", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(
            EXPORT_FIXTURE,
            out,
            {},
            {
                views: ["Request", "Nowhere", "Gone"],
            },
        );
        assert.equal(run.code, 1);
        assert.match(
            run.stderr,
            /No workspace has the views Nowhere and Gone\./,
        );
        assert.match(
            run.stderr,
            /renderizr export: write an SVG of every view/,
        );
        assert.deepEqual(await readdir(out), []);
    });
});

test("--dark-scheme and --perspective write the plain, -dark, perspective and perspective -dark files, and none for a view without it", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(
            PERSPECTIVES,
            out,
            {},
            {
                schemes: ["light", "dark"],
                perspectives: ["Security"],
            },
        );
        assert.equal(run.code, 0, run.stderr);
        const written = (await readdir(out)).sort();
        assert.deepEqual(written, [
            "perspectives-containers-dark.svg",
            "perspectives-containers-security-dark.svg",
            "perspectives-containers-security.svg",
            "perspectives-containers.svg",
            "perspectives-context-dark.svg",
            "perspectives-context-security-dark.svg",
            "perspectives-context-security.svg",
            "perspectives-context.svg",
            "perspectives-live-dark.svg",
            "perspectives-live-security-dark.svg",
            "perspectives-live-security.svg",
            "perspectives-live.svg",
            "perspectives-mailing-dark.svg",
            "perspectives-mailing.svg",
        ]);
        // A view without the perspective is no failure and prints nothing
        // (the cut-down Arimo only warns about the glyphs it lacks).
        assert.deepEqual(
            run.stderr
                .split("\n")
                .filter((line) => line && !line.startsWith("warning: ")),
            [],
        );
    });
});

test("a perspective export names the perspective in its title block, and the plain one does not", async () => {
    await withTempDir(async (out) => {
        await exportOffline(
            PERSPECTIVES,
            out,
            {},
            {
                views: ["Containers"],
                perspectives: ["Security"],
            },
        );
        const plain = await readFile(
            join(out, "perspectives-containers.svg"),
            "utf8",
        );
        const security = await readFile(
            join(out, "perspectives-containers-security.svg"),
            "utf8",
        );
        assert.match(security, />Perspective: Security</);
        assert.ok(
            !plain.includes("Perspective:"),
            "the plain export names one",
        );
    });
});

test("a set's workspaces each export every view, named by their own workspace", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(ENTERPRISE, out);
        assert.equal(run.code, 0, run.stderr);
        assert.deepEqual((await readdir(out)).sort(), [
            "acme-landscape.svg",
            "orders-containers.svg",
            "orders-system-context.svg",
            "payments-containers.svg",
            "payments-system-context.svg",
            "storefront-containers.svg",
            "storefront-system-context.svg",
        ]);
    });
});

test("--view reaches the views of every workspace of a set", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(
            ENTERPRISE,
            out,
            {},
            {
                views: ["Landscape", "Containers"],
            },
        );
        assert.equal(run.code, 0, run.stderr);
        assert.deepEqual((await readdir(out)).sort(), [
            "acme-landscape.svg",
            "orders-containers.svg",
            "payments-containers.svg",
            "storefront-containers.svg",
        ]);
    });
});

test("--primary-color fills the Mermaid nodes that set no style", async () => {
    await withTempDir(async (dir) => {
        const name = "mermaid-flowcharts-plain.svg";
        await exportOffline(
            FLOWCHART,
            join(dir, "plain"),
            {},
            {
                views: ["plain"],
            },
        );
        await exportOffline(
            FLOWCHART,
            join(dir, "branded"),
            { primaryColor: "#e4572e" },
            { views: ["plain"] },
        );
        const plain = await readFile(join(dir, "plain", name), "utf8");
        const branded = await readFile(join(dir, "branded", name), "utf8");
        assert.match(plain, /#145b9e/i);
        assert.ok(!plain.includes("#e4572e"));
        assert.match(branded, /#e4572e/i);
        assert.ok(!/#145b9e/i.test(branded), "the page's color stayed");
    });
});

test("the logo flags change nothing in the export", async () => {
    await withTempDir(async (dir) => {
        await exportOffline(EXPORT_FIXTURE, join(dir, "plain"));
        const run = await exportOffline(EXPORT_FIXTURE, join(dir, "logo"), {
            logo: join(dir, "no-such-logo.svg"),
            logoAlt: "Acme",
            logoHref: "https://acme.example",
        });
        assert.equal(run.code, 0, run.stderr);
        const names = (await readdir(join(dir, "plain"))).sort();
        assert.deepEqual((await readdir(join(dir, "logo"))).sort(), names);
        for (const name of names) {
            assert.equal(
                await readFile(join(dir, "logo", name), "utf8"),
                await readFile(join(dir, "plain", name), "utf8"),
                `${name} changed with the logo flags`,
            );
        }
    });
});

/* --------------------------------------------------------------- warnings */

/** The lines of `text` that are warnings. */
const warnings = (text) =>
    text.split("\n").filter((line) => line.startsWith("warning: "));

test("a view whose text the font lacks glyphs for warns once, writes its SVG and PNG, and exits 0", async () => {
    await withTempDir(async (out) => {
        // The cut-down Arimo has "AHg " and nothing else.
        const run = await exportOffline(
            EXPORT_FIXTURE,
            out,
            {},
            {
                views: ["Containers"],
                formats: ["svg", "png"],
                schemes: ["light", "dark"],
            },
        );
        assert.equal(run.code, 0, run.stderr);
        const lines = warnings(run.stderr);
        assert.equal(lines.length, 1, run.stderr);
        assert.match(
            lines[0],
            /^warning: view Containers of Export Workspace: Arimo has no glyph for (\S+ )+\S+, which draw in a system font\. Choose a family that has them with --font <family>\.$/,
        );
        assert.ok(!/glyph for [^,]*[AHg]/.test(lines[0]), lines[0]);
        assert.deepEqual((await readdir(out)).sort(), [
            "export-workspace-containers-dark.png",
            "export-workspace-containers-dark.svg",
            "export-workspace-containers.png",
            "export-workspace-containers.svg",
        ]);
    });
});

test("the missing-glyph warning suggests the subset of the family that holds the characters", async () => {
    await withTempDir(async (out) => {
        // Google serves the family in a second subset whose range holds
        // Latin letters too.
        const withExtended = (families) => {
            const routes = googleFonts(families);
            const answer = routes.default;
            return {
                ...routes,
                default: (url) => {
                    const value = answer(url);
                    if (value instanceof Error) return value;
                    // The stub serves one face: close it with a range.
                    const end = value.body.indexOf("}");
                    return {
                        body: `${value.body.slice(0, end)}  unicode-range: U+0000-0040;\n${value.body.slice(end)}/* latin-ext */\n@font-face {\n  font-family: 'Arimo';\n  font-style: normal;\n  font-weight: 400 700;\n  src: url(https://fonts.gstatic.com/s/stub/ext.woff2) format('woff2');\n  unicode-range: U+0000-024F;\n}\n`,
                    };
                },
            };
        };
        const run = await exportOffline(
            EXPORT_FIXTURE,
            out,
            {},
            { views: ["Containers"] },
            withExtended,
        );
        assert.equal(run.code, 0, run.stderr);
        assert.match(
            warnings(run.stderr)[0],
            / Add --font-subsets latin,latin-ext to fetch them\.$/,
        );
    });
});

test("a family a Mermaid source names falls back to the run's font and warns once per view", async () => {
    await withTempDir(async (out) => {
        const run = await exportOffline(
            MERMAID_STYLES,
            out,
            {},
            { views: ["fonts", "silent"], schemes: ["light", "dark"] },
        );
        assert.equal(run.code, 0, run.stderr);
        const fonts = warnings(run.stderr).filter((line) =>
            line.includes("cannot load"),
        );
        assert.equal(fonts.length, 1, run.stderr);
        assert.match(
            fonts[0],
            /^warning: view fonts of Mermaid styles: the export cannot load .+, so the text measures and draws in Arimo\.$/,
        );
    });
});

test("a run offline with a cold cache fails with a message naming the font and Google Fonts", async () => {
    const offline = () => ({
        default: () =>
            new TypeError("fetch failed", {
                cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), {
                    code: "ENOTFOUND",
                }),
            }),
    });
    await withTempDir(async (out) => {
        await assert.rejects(
            exportOffline(EXPORT_FIXTURE, out, {}, {}, offline),
            /^Error: renderizr export measures the text in Arimo when no font is set, and fetches it from Google Fonts, and could not reach it \(ENOTFOUND\)\./,
        );
        await assert.rejects(
            exportOffline(EXPORT_FIXTURE, out, { font: "Inter" }, {}, offline),
            /^Error: renderizr export fetches the font Inter from Google Fonts, and could not reach it/,
        );
        assert.deepEqual(await readdir(out), []);
    });
});

test("an icon whose download failed keeps its URL, warns once and fails no view", async () => {
    await withTempDir(async (dir) => {
        const ICON = "https://icons.example/system.png";
        const workspace = JSON.parse(await readFile(EXPORT_FIXTURE, "utf8"));
        for (const style of workspace.views.configuration.styles.elements) {
            if (style.icon) style.icon = ICON;
        }
        const source = join(dir, "export.json");
        await writeFile(source, JSON.stringify(workspace));
        const out = join(dir, "out");
        // The build's warning goes to the process's own stderr.
        const warned = sink();
        const original = process.stderr.write;
        process.stderr.write = warned.write;
        let run;
        try {
            run = await exportOffline(
                source,
                out,
                {},
                { views: ["Containers"], formats: ["svg", "png"] },
                (families) => ({
                    ...googleFonts(families),
                    [ICON]: { ok: false },
                }),
            );
        } finally {
            process.stderr.write = original;
        }
        assert.equal(run.code, 0, run.stderr);
        assert.equal(
            warned.text.match(/could not inline/g)?.length,
            1,
            warned.text,
        );
        assert.ok(warned.text.includes(`could not inline ${ICON}`));
        const svg = await readFile(
            join(out, "export-workspace-containers.svg"),
            "utf8",
        );
        assert.ok(svg.includes(`href="${ICON}"`), "the icon lost its URL");
        assert.deepEqual((await readdir(out)).sort(), [
            "export-workspace-containers.png",
            "export-workspace-containers.svg",
        ]);
    });
});
