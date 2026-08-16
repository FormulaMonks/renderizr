import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
    assetReferences,
    fixture,
    htmlSkeleton,
    runCli,
    writeBrokenWorkspace,
} from "./__fixtures__/helpers.js";

/**
 * End-to-end: render the committed fixture workspace with the real CLI and
 * inspect what lands on disk.
 *
 * The fixture carries no themes and no remote icons, so a build makes no
 * network requests at all — these pass offline and produce the same bytes
 * every time.
 *
 * Each mode is built once and shared by the assertions below; a build takes a
 * couple of seconds.
 */

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-e2e-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

const WORKSPACE = fixture("workspace.json");
const LOGO = fixture("logo.svg");

const once = (body) => {
    let promise;
    return () => {
        promise ??= body();
        return promise;
    };
};

/**
 * Poison `fetch` inside the CLI's process so the fixture builds below prove
 * they need no network, rather than merely not happening to use one here.
 * `--import` landed in Node 20.6; on anything older the build just runs.
 */
const [major, minor] = process.versions.node.split(".").map(Number);
const OFFLINE =
    major > 20 || (major === 20 && minor >= 6)
        ? {
              NODE_OPTIONS: [
                  process.env.NODE_OPTIONS,
                  `--import ${pathToFileURL(fixture("no-network.js")).href}`,
              ]
                  .filter(Boolean)
                  .join(" "),
          }
        : {};

const build = async (name, args) => {
    const out = join(SCRATCH, name);
    const result = await runCli([WORKSPACE, "--out", out, ...args], {
        env: OFFLINE,
    });
    assert.equal(
        result.code,
        0,
        `build failed:\n${result.stdout}\n${result.stderr}`,
    );
    return { out, ...result };
};

/** Run `node <args>` and report the exit status rather than throwing. */
const runNode = (args) =>
    new Promise((resolve) => {
        execFile(process.execPath, args, (error, stdout, stderr) =>
            resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr }),
        );
    });

const multiFile = once(() => build("multi", []));
const singleFile = once(() =>
    build("single", [
        "--single-file",
        "--logo",
        LOGO,
        "--logo-alt",
        "Fixture Logo",
    ]),
);
const based = once(() => build("based", ["--base", "/docs/"]));

/* --------------------------------------------------------------- multi-file */

test("a multi-file build writes index.html and an assets directory", async () => {
    const { out, stdout } = await multiFile();

    assert.match(stdout, /Building Fixture Workspace to /);
    assert.match(stdout, /Complete\. Serve /);

    assert.ok(existsSync(join(out, "index.html")), "no index.html");
    assert.ok(existsSync(join(out, "assets")), "no assets directory");

    const assets = await readdir(join(out, "assets"));
    assert.ok(
        assets.some((file) => file.endsWith(".js")),
        `no JavaScript in assets: ${assets.join(", ")}`,
    );
    assert.ok(
        assets.some((file) => file.endsWith(".css")),
        `no stylesheet in assets: ${assets.join(", ")}`,
    );
});

test("the public directory is copied into a multi-file build", async () => {
    const { out } = await multiFile();
    assert.ok(
        existsSync(join(out, "favicon.png")),
        "favicon.png was not copied",
    );
});

test("index.html is titled after the workspace and links the built assets", async () => {
    const { out } = await multiFile();
    const html = await readFile(join(out, "index.html"), "utf-8");

    assert.match(html, /<title>Fixture Workspace \| Structurizr<\/title>/);
    assert.match(
        html,
        /<script type="module"[^>]*src="\.\/assets\/[^"]+\.js"><\/script>/,
    );
    assert.match(
        html,
        /<link rel="stylesheet"[^>]*href="\.\/assets\/[^"]+\.css">/,
    );
    assert.match(html, /<div id="app"><\/div>/);
});

/*
 * ------------------------------------------------------- embedding, not rendering
 *
 * The assertions in this section are substring searches against a minified
 * chunk. They establish one thing only: the data reached the bundle. They say
 * nothing about whether the application renders it, and they would still pass
 * against an SPA that threw on boot — so they are named for what they check.
 *
 * What the pages actually do with that data is covered by the unit tests in
 * `markdown-renderer.test.js`, `markdown-alerts.test.js` and
 * `asciidoc.test.js`, which import `src/` directly.
 */

/** The entry chunk, which is where the embedded workspace ends up. */
const entryChunk = async (out) => {
    const dir = join(out, "assets");
    const files = await readdir(dir);
    const name = files.find(
        (file) => file.startsWith("index-") && file.endsWith(".js"),
    );
    assert.ok(name, `no entry chunk in ${files.join(", ")}`);
    return readFile(join(dir, name), "utf-8");
};

test("the workspace name and description reach the entry chunk", async () => {
    const { out } = await multiFile();
    const code = await entryChunk(out);

    assert.ok(
        code.includes("Fixture Workspace"),
        "the workspace name is missing",
    );
    assert.ok(
        code.includes(
            "A tiny workspace the build pipeline tests render end to end.",
        ),
    );
    assert.ok(code.includes("Fixture System"));
    assert.ok(code.includes("Static Site"));
});

test("every view key reaches the entry chunk", async () => {
    const { out } = await multiFile();
    const code = await entryChunk(out);

    for (const key of ["FixtureContext", "FixtureContainers"]) {
        assert.ok(code.includes(key), `view ${key} is missing from the bundle`);
    }
});

test("every ADR title and body reaches the entry chunk", async () => {
    const { out } = await multiFile();
    const code = await entryChunk(out);

    for (const title of [
        "Render diagrams in the browser",
        "Inline every asset for single-file output",
    ]) {
        assert.ok(code.includes(title), `decision "${title}" is missing`);
    }
    assert.ok(
        code.includes(
            "A self-contained document cannot make network requests.",
        ),
    );
});

test("every documentation section filename reaches the entry chunk", async () => {
    const { out } = await multiFile();
    const code = await entryChunk(out);

    assert.ok(code.includes("01-overview.md"));
    assert.ok(code.includes("02-deployment.md"));
});

test("the ADR and documentation pages are shipped as their own chunks", async () => {
    const { out } = await multiFile();
    const assets = await readdir(join(out, "assets"));

    assert.ok(
        assets.some((file) => /^adrs-.*\.js$/.test(file)),
        `no ADR page chunk in ${assets.join(", ")}`,
    );
    assert.ok(
        assets.some((file) => /^docs-.*\.js$/.test(file)),
        `no documentation page chunk in ${assets.join(", ")}`,
    );
});

test("the vendored Structurizr renderer reaches the entry chunk", async () => {
    const { out } = await multiFile();
    const code = await entryChunk(out);

    // The renderer is injected as a classic script built from vendor/.
    assert.ok(code.includes("structurizr"));
    assert.ok(
        code.includes("DEFAULT_AUTOLAYOUT_RANK_SEPARATION"),
        "the vendored renderer is not in the bundle",
    );
});

test("the entry chunk is a syntactically valid ES module", async () => {
    // A grep for an embedded string passes against a bundle that is broken
    // JavaScript. Parsing it does not: `node --check` runs the real parser
    // over the whole chunk, minifier output and all.
    const code = await entryChunk(await multiFile().then(({ out }) => out));
    const path = join(SCRATCH, "entry-chunk.mjs");
    await writeFile(path, code);

    const { code: status, stderr } = await runNode(["--check", path]);
    assert.equal(status, 0, `the entry chunk does not parse:\n${stderr}`);
});

test("the single file's inline module is syntactically valid too", async () => {
    const { out } = await singleFile();
    const html = await readFile(join(out, "index.html"), "utf-8");

    const module = html.match(
        /<script type="module"[^>]*>([\s\S]*?)<\/script>/,
    );
    assert.ok(module, "the single file has no inline module script");
    assert.ok(module[1].length > 400_000, "the inline module looks truncated");

    const path = join(SCRATCH, "single-file-inline.mjs");
    await writeFile(path, module[1]);

    const { code, stderr } = await runNode(["--check", path]);
    assert.equal(code, 0, `the inlined module does not parse:\n${stderr}`);
});

test("--base prefixes every asset reference", async () => {
    const { out } = await based();
    const html = await readFile(join(out, "index.html"), "utf-8");

    assert.match(html, /src="\/docs\/assets\/[^"]+\.js"/);
    assert.match(html, /href="\/docs\/assets\/[^"]+\.css"/);
    assert.match(html, /href="\/docs\/favicon\.png"/);
});

/* -------------------------------------------------------------- single-file */

test("a single-file build writes index.html and artifact.html and nothing else", async () => {
    const { out, stdout } = await singleFile();

    assert.match(stdout, /Complete\. Open /);
    assert.match(stdout, /upload .*artifact\.html as a Claude artifact/);

    assert.deepEqual((await readdir(out)).sort(), [
        "artifact.html",
        "index.html",
    ]);
});

test("the single file is genuinely self-contained", async () => {
    const { out } = await singleFile();
    const html = await readFile(join(out, "index.html"), "utf-8");

    // Bundled JavaScript is full of strings that look like markup, so the
    // question is only answerable of the document with its code emptied out.
    const skeleton = htmlSkeleton(html);

    assert.ok(
        !/<script[^>]*\ssrc=/i.test(skeleton),
        "an external <script src> survived",
    );
    assert.ok(!/<link\b/i.test(skeleton), "a <link> survived");
    assert.ok(
        !/https?:\/\//i.test(skeleton),
        "the document skeleton names a URL",
    );
    assert.ok(!/<img[^>]*src=["']?https?:/i.test(skeleton));

    // And nothing anywhere in the file can start a request on its own.
    assert.ok(
        !/url\(\s*["']?https?:/i.test(html),
        "a stylesheet fetches a remote asset",
    );
    assert.ok(
        !/@import\s+(url\()?["']?https?:/i.test(html),
        "a stylesheet @imports a URL",
    );

    // The property, not a tag census: nothing left in the document may name
    // something to go and get. Counting elements would make this test fail
    // the day an inline theme script is added, for a reason that has nothing
    // to do with self-containment.
    for (const { attribute, value } of assetReferences(skeleton)) {
        assert.ok(
            value.startsWith("#") || value.startsWith("data:"),
            `${attribute}="${value}" would start a request`,
        );
    }
});

test("the self-containment check can actually fail", () => {
    // `assetReferences` is asked a question the real output answers with
    // silence — there are no references left to inspect. This is the control:
    // the same machinery, over a document that is not self-contained, has to
    // find every one of them, and the skeleton has to keep the attributes that
    // carry the evidence.
    const bad = htmlSkeleton(
        "<html><head>" +
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css">' +
            '<script src="https://cdn.example/app.js">' +
            '/* <link rel="decoy" href="decoy.css"> */' +
            "</script>" +
            '</head><body><img src="https://example.test/i.png">' +
            '<a href="#top">top</a><img src="data:image/gif;base64,AA">' +
            "</body></html>",
    );

    assert.ok(
        bad.includes('<script src="https://cdn.example/app.js"></script>'),
        "emptying the script body destroyed the evidence in its opening tag",
    );
    assert.ok(!bad.includes("decoy"), "the script body survived emptying");

    assert.deepEqual(
        assetReferences(bad).map(({ value }) => value),
        [
            "https://fonts.googleapis.com/css",
            "https://cdn.example/app.js",
            "https://example.test/i.png",
            "#top",
            "data:image/gif;base64,AA",
        ],
    );

    const external = assetReferences(bad).filter(
        ({ value }) => !value.startsWith("#") && !value.startsWith("data:"),
    );
    assert.equal(external.length, 3);
});

test("the single file still carries the whole application", async () => {
    const { out } = await singleFile();
    const html = await readFile(join(out, "index.html"), "utf-8");

    assert.ok(html.length > 500_000, `only ${html.length} bytes were written`);
    assert.match(html, /<title>Fixture Workspace \| Structurizr<\/title>/);
    assert.ok(html.includes("Fixture Workspace"));
    assert.ok(html.includes("FixtureContext"));
    assert.ok(html.includes("Render diagrams in the browser"));
    assert.ok(html.includes("DEFAULT_AUTOLAYOUT_RANK_SEPARATION"));
    assert.ok(
        !html.includes("__VITE_PRELOAD__"),
        "an unresolved preload marker survived",
    );
});

test("the logo is inlined into the single file as a data URI", async () => {
    const { out } = await singleFile();
    const html = await readFile(join(out, "index.html"), "utf-8");

    assert.ok(html.includes("Fixture Logo"), "the logo alt text is missing");
    assert.ok(html.includes("data:image/svg+xml"), "the logo was not inlined");
    assert.ok(
        !html.includes("logo.svg"),
        "the logo is still referenced by path",
    );
});

test("artifact.html is a fragment with no document scaffolding", async () => {
    const { out } = await singleFile();
    const artifact = await readFile(join(out, "artifact.html"), "utf-8");
    const skeleton = htmlSkeleton(artifact);

    for (const tag of ["<!doctype", "<html", "<head", "<body", "<title"]) {
        assert.ok(
            !skeleton.toLowerCase().includes(tag),
            `the fragment carries ${tag}`,
        );
    }

    assert.ok(skeleton.includes('<div id="app"></div>'));
    for (const { attribute, value } of assetReferences(skeleton)) {
        assert.ok(
            value.startsWith("#") || value.startsWith("data:"),
            `${attribute}="${value}" would start a request`,
        );
    }
    assert.ok(!/https?:\/\//i.test(skeleton), "the fragment names a URL");
    assert.ok(artifact.includes("Fixture Workspace"));
});

/* ------------------------------------------------------------ failure modes */

test("a workspace that is not there fails loudly", async () => {
    const { code, stderr } = await runCli([
        join(SCRATCH, "nope.json"),
        "--out",
        join(SCRATCH, "never"),
    ]);

    assert.notEqual(code, 0);
    assert.match(stderr, /ENOENT|no such file/i);
    assert.ok(
        !existsSync(join(SCRATCH, "never")),
        "an output directory was created anyway",
    );
});

test("a workspace that is not JSON names the file", async () => {
    const { code, stderr } = await runCli([
        await writeBrokenWorkspace(SCRATCH),
        "--out",
        join(SCRATCH, "never-either"),
    ]);

    assert.notEqual(code, 0);
    assert.match(stderr, /broken\.json is not valid JSON/);
});

test("the binary prints its usage and exits 0 for --help", async () => {
    const { code, stdout } = await runCli(["--help"]);

    assert.equal(code, 0);
    assert.match(stdout, /Renderizr — render a Structurizr workspace/);
    // The usage line has to name the binary package.json actually installs —
    // `bin` declares only `renderizr`, so `build` would send the reader to a
    // command that is not on their PATH.
    assert.match(stdout, /renderizr <workspace\.json\|url> \[options\]/);
    assert.doesNotMatch(stdout, /^\s{2}build </m);
});

test("the binary refuses to run without a workspace", async () => {
    const { code, stderr } = await runCli([]);

    assert.equal(code, 1);
    assert.match(stderr, /Missing the workspace to render\./);
});
