import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
    isCssColor,
    OPTIONS,
    parseCliArgs,
    parseEditArgs,
    usage,
    withoutSeparator,
} from "./cli.js";
import {
    evalInChild,
    FIXTURES,
    fixture,
    REPO_ROOT,
    runCli,
    withTempDir,
} from "./__fixtures__/helpers.js";

/**
 * `parseCliArgs` exits the process on `--help` and on bad input, so those paths
 * are exercised in a child. Everything that returns is called directly.
 */
const parseInChild = (args) =>
    evalInChild(`
        import { parseCliArgs } from "./scripts/cli.js";
        parseCliArgs(${JSON.stringify(args)});
    `);

/* ----------------------------------------------------------------- defaults */

test("a bare workspace takes every default", () => {
    assert.deepEqual(parseCliArgs(["workspace.json"]), {
        workspace: "workspace.json",
        out: "structurizr-output",
        base: "",
        singleFile: false,
        logo: null,
        font: null,
        primaryColor: null,
    });
});

test("the defaults in OPTIONS are the ones the usage text promises", () => {
    assert.equal(OPTIONS.out.default, "structurizr-output");
    assert.equal(OPTIONS.out.short, "o");
    assert.equal(OPTIONS["font-weights"].default, "400,700");
    assert.equal(OPTIONS["font-subsets"].default, "latin");
    assert.equal(OPTIONS["font-italic"].default, false);
    assert.equal(OPTIONS["single-file"].default, false);
    assert.equal(OPTIONS.base.default, "");
    assert.equal(OPTIONS.help.short, "h");
});

test("a URL is accepted as the workspace", () => {
    const { workspace } = parseCliArgs(["https://example.test/workspace.json"]);
    assert.equal(workspace, "https://example.test/workspace.json");
});

/* -------------------------------------------------------------------- flags */

test("--out and -o both set the output directory", () => {
    assert.equal(parseCliArgs(["w.json", "--out", "dist"]).out, "dist");
    assert.equal(parseCliArgs(["w.json", "-o", "dist"]).out, "dist");
    assert.equal(parseCliArgs(["-o", "dist", "w.json"]).out, "dist");
    assert.equal(parseCliArgs(["w.json", "--out=dist"]).out, "dist");
});

test("--base sets the public path", () => {
    assert.equal(parseCliArgs(["w.json", "--base", "/docs/"]).base, "/docs/");
});

test("--single-file is a boolean flag", () => {
    assert.equal(parseCliArgs(["w.json"]).singleFile, false);
    assert.equal(parseCliArgs(["w.json", "--single-file"]).singleFile, true);
});

/* --------------------------------------------------------------------- logo */

test("--logo alone carries empty alt text and no link", () => {
    assert.deepEqual(parseCliArgs(["w.json", "--logo", "./logo.svg"]).logo, {
        source: "./logo.svg",
        alt: "",
        href: undefined,
    });
});

test("--logo-alt and --logo-href ride along with the logo", () => {
    const { logo } = parseCliArgs([
        "w.json",
        "--logo",
        "https://example.test/logo.png",
        "--logo-alt",
        "Acme",
        "--logo-href",
        "https://acme.test",
    ]);

    assert.deepEqual(logo, {
        source: "https://example.test/logo.png",
        alt: "Acme",
        href: "https://acme.test",
    });
});

test("logo options without --logo produce no logo at all", () => {
    const { logo } = parseCliArgs([
        "w.json",
        "--logo-alt",
        "Acme",
        "--logo-href",
        "https://acme.test",
    ]);
    assert.equal(logo, null);
});

/* --------------------------------------------------------------------- font */

test("--font takes the documented weight and subset defaults", () => {
    assert.deepEqual(parseCliArgs(["w.json", "--font", "Inter"]).font, {
        family: "Inter",
        weights: ["400", "700"],
        subsets: ["latin"],
        italic: false,
    });
});

test("weight and subset lists are trimmed, and empty entries dropped", () => {
    const { font } = parseCliArgs([
        "w.json",
        "--font",
        "Source Sans 3",
        "--font-weights",
        " 300 , 600 ,,",
        "--font-subsets",
        "latin , latin-ext ,",
        "--font-italic",
    ]);

    assert.deepEqual(font, {
        family: "Source Sans 3",
        weights: ["300", "600"],
        subsets: ["latin", "latin-ext"],
        italic: true,
    });
});

test("a weight list of nothing but separators leaves no weights", () => {
    const { font } = parseCliArgs([
        "w.json",
        "--font",
        "Inter",
        "--font-weights",
        " , , ",
    ]);
    assert.deepEqual(font.weights, []);
});

test("font options without --font produce no font at all", () => {
    const { font } = parseCliArgs([
        "w.json",
        "--font-weights",
        "300",
        "--font-italic",
    ]);
    assert.equal(font, null);
});

/* -------------------------------------------------------------------- usage */

test("the usage text names every option", () => {
    const chunks = [];
    usage({
        write: (text) => {
            chunks.push(text);
        },
    });
    const written = chunks.join("");

    for (const name of Object.keys(OPTIONS)) {
        assert.ok(
            written.includes(`--${name}`),
            `usage text never mentions --${name}`,
        );
    }
    assert.ok(written.includes("-o, --out"));
    assert.ok(written.includes("-h, --help"));
    assert.ok(written.endsWith("\n"));
});

/* ------------------------------------------------------------ exiting paths */

test("--help prints the usage and exits 0", async () => {
    for (const flag of ["--help", "-h"]) {
        const { stdout } = await evalInChild(`
            import { parseCliArgs } from "./scripts/cli.js";
            parseCliArgs(${JSON.stringify([flag])});
            process.stdout.write("NOT REACHED");
        `);

        assert.ok(stdout.includes("Renderizr: render a Structurizr workspace"));
        assert.ok(stdout.includes("--single-file"));
        assert.ok(!stdout.includes("NOT REACHED"), `${flag} kept going`);
    }
});

test("--help lists the edit subcommand and its flags", async () => {
    const { stdout } = await evalInChild(`
        import { parseCliArgs } from "./scripts/cli.js";
        parseCliArgs(["--help"]);
    `);

    assert.match(stdout, /renderizr edit \[path\]/);
    for (const flag of ["--port <n>", "--open"]) {
        assert.ok(
            stdout.includes(flag),
            `the main usage never mentions edit's ${flag}`,
        );
    }
});

test("neither usage carries an em dash", async () => {
    const build = await runCli(["--help"]);
    const edit = await runCli(["edit", "--help"]);
    assert.ok(!build.stdout.includes("\u2014"), "the build usage has one");
    assert.ok(!edit.stdout.includes("\u2014"), "the edit usage has one");
});

test("--help wins even when the workspace is missing", async () => {
    const { stdout } = await evalInChild(`
        import { parseCliArgs } from "./scripts/cli.js";
        parseCliArgs(["--help"]);
    `);
    assert.ok(!stdout.includes("Missing the workspace"));
});

const rejects = async (args, expected) => {
    await assert.rejects(
        parseInChild(args),
        (error) => {
            assert.equal(error.code, 1, `${args.join(" ")} did not exit 1`);
            assert.match(error.stderr, expected);
            assert.match(
                error.stderr,
                /Renderizr: render a Structurizr workspace/,
                "the usage text was not printed on the error path",
            );
            return true;
        },
        `${args.join(" ")} was accepted`,
    );
};

test("no workspace is a usage error", async () => {
    await rejects([], /Missing the workspace to render\./);
});

test("more than one workspace is a usage error", async () => {
    await rejects(
        ["a.json", "b.json"],
        /Expected one workspace, got 2: a\.json, b\.json/,
    );
});

test("a leading -- that pnpm forwards is dropped, so the flags after it stay flags", () => {
    assert.deepEqual(withoutSeparator(["--", "w.json", "--single-file"]), [
        "w.json",
        "--single-file",
    ]);
    assert.deepEqual(withoutSeparator(["w.json", "--", "x"]), [
        "w.json",
        "--",
        "x",
    ]);
    assert.equal(
        parseCliArgs(withoutSeparator(["--", "w.json", "--logo=logo.svg"])).logo
            .source,
        "logo.svg",
    );
});

test("pnpm render -- <workspace> --flag reaches the CLI as one workspace and its flags", async () => {
    const { code, stderr } = await runCli(["--", "--help"]);
    assert.equal(code, 0, stderr);
    const edit = await runCli(["--", "edit", "--help"]);
    assert.equal(edit.code, 0, edit.stderr);
    assert.match(edit.stdout, /renderizr edit/);
});

test("--primary-color takes a CSS color, in the build and in edit mode", () => {
    assert.equal(
        parseCliArgs(["w.json", "--primary-color", "#e4572e"]).primaryColor,
        "#e4572e",
    );
    assert.equal(
        parseEditArgs([fixture("workspace.json"), "--primary-color", "teal"], {
            cwd: REPO_ROOT,
        }).primaryColor,
        "teal",
    );
    for (const color of [
        "#abc",
        "#aabbccdd",
        "rgb(228 87 46)",
        "rgba(228, 87, 46, 0.5)",
        "hsl(12deg 77% 54%)",
        "oklch(0.65 0.19 35 / none)",
        "oklch(0.65 0.19 35)",
        "rebeccapurple",
    ])
        assert.equal(isCssColor(color), true, color);
    for (const color of [
        "#ab",
        "red; } body { display: none",
        "url(x)",
        "rgb(1 2 3) }",
        "rgb(var(--x))",
        "",
    ])
        assert.equal(isCssColor(color), false, color);
});

test("a --primary-color that isn't a CSS color is a usage error", async () => {
    await rejects(
        ["w.json", "--primary-color", "red;}"],
        /--primary-color takes a CSS color, such as "#e4572e"/,
    );
});

test("an unknown flag is a usage error", async () => {
    await rejects(["w.json", "--nope"], /Unknown option '--nope'/);
});

test("a string option with no value is a usage error", async () => {
    await rejects(["w.json", "--out"], /argument missing/i);
});

test("a value handed to a boolean flag is a usage error", async () => {
    await rejects(
        ["w.json", "--single-file=yes"],
        /does not take an argument/i,
    );
});

test("--engine is gone with the vendored renderer (2.0) and is a usage error", async () => {
    assert.ok(!Object.hasOwn(OPTIONS, "engine"));
    await rejects(
        ["w.json", "--engine", "react-flow"],
        /Unknown option '--engine'/,
    );
});

/* -------------------------------------------------------------------- edit */

test("the usage text lists the edit subcommand", () => {
    const chunks = [];
    usage({ write: (text) => chunks.push(text) });
    assert.match(chunks.join(""), /renderizr edit \[path\]/);
});

test("renderizr edit opens the current folder on port 7341 and leaves the browser alone", () => {
    const options = parseEditArgs([], { cwd: FIXTURES });
    assert.deepEqual(options, {
        session: {
            kind: "json",
            json: fixture("workspace.json"),
            dsl: null,
        },
        port: 7341,
        open: false,
        logo: null,
        font: null,
        primaryColor: null,
    });
});

test("renderizr edit takes a path, --port and --open", () => {
    const options = parseEditArgs(
        [fixture("workspace.json"), "--port", "8123", "--open"],
        { cwd: REPO_ROOT },
    );
    assert.equal(options.session.json, fixture("workspace.json"));
    assert.equal(options.port, 8123);
    assert.equal(options.open, true);
});

test("renderizr edit takes the branding flags the build takes", () => {
    const { logo, font } = parseEditArgs(
        [
            "--logo",
            "./logo.svg",
            "--logo-alt",
            "Acme",
            "--logo-href",
            "https://example.test",
            "--font",
            "Inter",
            "--font-weights",
            "300,600",
            "--font-subsets",
            "latin-ext",
            "--font-italic",
        ],
        { cwd: FIXTURES },
    );
    assert.deepEqual(logo, {
        source: "./logo.svg",
        alt: "Acme",
        href: "https://example.test",
    });
    assert.deepEqual(font, {
        family: "Inter",
        weights: ["300", "600"],
        subsets: ["latin-ext"],
        italic: true,
    });
});

/** Run `parseEditArgs(args)` in a child rooted at `cwd`, which may exit. */
const parseEditInChild = (args, cwd = FIXTURES) =>
    evalInChild(`
        import { parseEditArgs } from "./scripts/cli.js";
        parseEditArgs(${JSON.stringify(args)}, { cwd: ${JSON.stringify(cwd)} });
        process.stdout.write("NOT REACHED");
    `);

const editRejects = async (args, expected, cwd) => {
    await assert.rejects(
        parseEditInChild(args, cwd),
        (error) => {
            assert.equal(
                error.code,
                1,
                `edit ${args.join(" ")} did not exit 1`,
            );
            assert.match(error.stderr, expected);
            assert.match(
                error.stderr,
                /renderizr edit \[path\]/,
                "the edit usage was not printed on the error path",
            );
            return true;
        },
        `edit ${args.join(" ")} was accepted`,
    );
};

test("renderizr edit on a DSL without tools or workspace.json stops with the tools message alone", async () => {
    await withTempDir(async (dir) => {
        await writeFile(join(dir, "workspace.dsl"), "workspace {}");
        await assert.rejects(
            evalInChild(`
                import { parseEditArgs } from "./scripts/cli.js";
                process.env.STRUCTURIZR_CLI = "renderizr-no-such-structurizr";
                parseEditArgs([], { cwd: ${JSON.stringify(dir)} });
                process.stdout.write("NOT REACHED");
            `),
            (error) => {
                assert.equal(error.code, 1);
                assert.match(error.stderr, /renderizr-no-such-structurizr/);
                assert.match(error.stderr, /Java 21 to 25/);
                assert.doesNotMatch(
                    error.stderr,
                    /renderizr edit \[path\]/,
                    "the tools message came with the usage",
                );
                return true;
            },
        );
    });
});

test("renderizr edit refuses the flags of a build with a usage error", async () => {
    const REFUSED = [
        [["--out", "dist"], /--out.*writes no output/],
        [["-o", "dist"], /--out.*writes no output/],
        [["--out=dist"], /--out.*writes no output/],
        [["--single-file"], /--single-file.*writes no output/],
        [["--base", "/docs/"], /--base.*writes no output/],
        [["--engine", "react-flow"], /--engine.*React Flow engine/],
    ];
    for (const [args, expected] of REFUSED) await editRejects(args, expected);
});

test("renderizr edit refuses a port that isn't one", async () => {
    for (const port of ["abc", "0", "65536", "80.5"]) {
        await editRejects(["--port", port], /--port takes a port number/);
    }
});

test("renderizr edit refuses more than one path", async () => {
    await editRejects(["a.json", "b.json"], /Expected one path, got 2/);
});

test("renderizr edit on a folder holding neither file is a usage error naming both", async () => {
    await editRejects(
        [join(REPO_ROOT, "src")],
        /neither workspace\.dsl nor workspace\.json/,
        REPO_ROOT,
    );
});

test("renderizr edit --help prints the edit usage and exits 0", async () => {
    const { stdout } = await parseEditInChild(["--help"]);
    assert.match(stdout, /renderizr edit \[path\]/);
    for (const flag of ["--port", "--open", "--logo", "--font"]) {
        assert.ok(
            stdout.includes(flag),
            `the edit usage never mentions ${flag}`,
        );
    }
    assert.ok(!stdout.includes("NOT REACHED"));
});

test("the binary dispatches edit to edit mode and keeps a bare workspace a build", async () => {
    const edit = await runCli(["edit", "--help"]);
    assert.equal(edit.code, 0);
    assert.match(edit.stdout, /^renderizr edit: /);
    assert.match(edit.stdout, /--open/);

    const build = await runCli(["--help"]);
    assert.equal(build.code, 0);
    assert.match(build.stdout, /renderizr <workspace\.json\|url>/);
});
