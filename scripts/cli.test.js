import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS, parseCliArgs, usage } from "./cli.js";
import { evalInChild } from "./__fixtures__/helpers.js";

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

        assert.ok(
            stdout.includes("Renderizr — render a Structurizr workspace"),
        );
        assert.ok(stdout.includes("--single-file"));
        assert.ok(!stdout.includes("NOT REACHED"), `${flag} kept going`);
    }
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
                /Renderizr — render a Structurizr workspace/,
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
