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
        branding: NO_BRANDING_FLAGS,
    });
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

test("no workspace, or more than one, is a usage error", async () => {
    await rejects([], /Missing the workspace to export\./);
    await rejects(["a.json", "b.json"], /Expected one workspace, got 2/);
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
    assert.match(main.stdout, /renderizr export <workspace>/);
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

/** `runExport` over `workspace` into `out`, offline, with `flags`. */
async function exportOffline(workspace, out, flags = {}, extra = {}) {
    const families = [];
    const stdout = sink();
    const stderr = sink();
    // `loadFont` says what it embeds on the process's own stdout.
    const announced = sink();
    const original = process.stdout.write;
    process.stdout.write = announced.write;
    try {
        const code = await withFetch(googleFonts(families), () =>
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
