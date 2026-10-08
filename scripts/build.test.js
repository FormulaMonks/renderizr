import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import { createConfig } from "./config.js";
import { findUnspellable } from "./escapes.js";
import {
    assetReferences,
    fixture,
    htmlSkeleton,
    REPO_ROOT,
    readJsonFixture,
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
/** `--single-file` and nothing else: the page as Renderizr ships it. */
const defaultSingleFile = once(() =>
    build("default-single", ["--single-file"]),
);

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

test("the React Flow engine reaches the entry chunk, and the vendored renderer does not", async () => {
    const { out } = await multiFile();
    const code = await entryChunk(out);

    assert.ok(code.includes("react-flow__"), "React Flow is not in the bundle");
    assert.ok(
        !code.includes("DEFAULT_AUTOLAYOUT_RANK_SEPARATION"),
        "the vendored renderer was bundled",
    );
    assert.ok(!code.includes("joint-element"), "JointJS was bundled");
    assert.ok(!code.includes("jQuery"), "jQuery was bundled");
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

/** Nothing in `html` can start a request: the self-containment property. */
const assertSelfContained = (html) => {
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
};

test("the single file is genuinely self-contained", async () => {
    const { out } = await singleFile();
    assertSelfContained(await readFile(join(out, "index.html"), "utf-8"));
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
    assert.ok(html.includes("react-flow__"), "React Flow is not in the file");
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

test("a filtered view whose base is filtered fails the build naming both views", async () => {
    const workspace = readJsonFixture("workspace.json");
    workspace.views.filteredViews = [
        {
            key: "NoPeople",
            baseViewKey: "FixtureContext",
            mode: "Exclude",
            tags: ["Person"],
        },
        {
            key: "NoPeopleTwice",
            baseViewKey: "NoPeople",
            mode: "Exclude",
            tags: ["Person"],
        },
    ];
    const source = join(SCRATCH, "filtered-twice.json");
    await writeFile(source, JSON.stringify(workspace));

    const { code, stderr } = await runCli([
        source,
        "--out",
        join(SCRATCH, "never-filtered"),
    ]);

    assert.notEqual(code, 0);
    assert.match(
        stderr,
        /Filtered view "NoPeopleTwice" has filtered view "NoPeople" as its base/,
    );
    assert.ok(
        !existsSync(join(SCRATCH, "never-filtered")),
        "an output directory was created anyway",
    );
});

test("a dynamic-view order that isn't an integer fails the build with the spec's message", async () => {
    const { code, stderr } = await runCli([
        join(REPO_ROOT, "test/__fixtures__/fractional-order.json"),
        "--out",
        join(SCRATCH, "never-fractional"),
    ]);

    assert.notEqual(code, 0);
    assert.match(
        stderr,
        /Dynamic view "SignIn": relationship "API → Database" has order "1\.1"; orders must be integers\./,
    );
    assert.ok(
        !existsSync(join(SCRATCH, "never-fractional")),
        "an output directory was created anyway",
    );
});

test("the binary prints its usage and exits 0 for --help", async () => {
    const { code, stdout } = await runCli(["--help"]);

    assert.equal(code, 0);
    assert.match(stdout, /Renderizr: render a Structurizr workspace/);
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

test("artifact.html passes the escaping and fragment checks", async () => {
    const { out } = await singleFile();
    const artifact = await readFile(join(out, "artifact.html"), "utf-8");
    const skeleton = htmlSkeleton(artifact);

    assert.deepEqual(findUnspellable(artifact), []);
    assertSelfContained(artifact);
    assert.ok(skeleton.includes('<div id="app"></div>'));
    assert.ok(!/https?:\/\//i.test(skeleton), "the fragment names a URL");
});

/* ------------------------------------------------------ the engine report */

test("a build writes no engine report unless asked to", async () => {
    // The report is for the acceptance harness only (spec 15.1); a reader's
    // build carries neither the writer nor the element id.
    const { out } = await multiFile();
    assert.ok(
        !(await entryChunk(out)).includes("engine-report"),
        "a reader's build carries the report writer",
    );
});

test("RENDERIZR_ENGINE_REPORT=1 builds the engine report into the page", async () => {
    const out = join(SCRATCH, "report");
    const result = await runCli([WORKSPACE, "--out", out], {
        env: { ...OFFLINE, RENDERIZR_ENGINE_REPORT: "1" },
    });
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    assert.ok(
        (await entryChunk(out)).includes("engine-report"),
        "the report writer is missing from the bundle",
    );
});

/* ---------------------------------------------------- no edit-mode code */

/**
 * Strings only edit mode's page code carries: the session token's storage
 * key, the pencil's reason on an automatic-layout view, the classes of Done
 * and of the link to a base view's editing route, the save endpoint and its
 * token header, the save status, the leave dialog, the
 * alignment guides, the align buttons and the "Keyboard shortcuts" dialog.
 */
const EDIT_MODE_MARKERS = [
    "renderizr:session-token",
    "This view uses automatic layout",
    "done-editing",
    "edit-base-view",
    "/__renderizr/save",
    "X-Renderizr-Token",
    "Unsaved changes",
    "Discard and continue",
    "data-alignment-guides",
    "align-selection",
    "close-shortcuts",
];

/** Every JavaScript and HTML file a build wrote under `out`, as one string. */
const builtOutput = async (out) => {
    const files = await readdir(out, { recursive: true });
    const texts = await Promise.all(
        files
            .filter((file) => /\.(js|html)$/.test(file))
            .map((file) => readFile(join(out, file), "utf-8")),
    );
    return texts.join("\n");
};

test("no edit-mode code reaches a build's output", async () => {
    for (const { out } of [await multiFile(), await singleFile()]) {
        const output = await builtOutput(out);
        for (const marker of EDIT_MODE_MARKERS) {
            assert.ok(
                !output.includes(marker),
                `${out} carries edit-mode code: ${marker}`,
            );
        }
    }
});

test("the edit-mode markers are in the page when edit mode is compiled in", async () => {
    // The control for the test above: compiled with the flag on, the same
    // page carries every marker, so their absence there means something.
    const config = createConfig({
        workspace: readJsonFixture("workspace.json"),
        out: join(SCRATCH, "edit-mode-control"),
    });
    const result = await viteBuild({
        ...config,
        logLevel: "silent",
        define: { ...config.define, __RENDERIZR_EDIT_MODE__: "true" },
        build: { ...config.build, write: false },
    });
    const code = [result]
        .flat()
        .flatMap((bundle) => bundle.output)
        .filter((output) => output.type === "chunk")
        .map((chunk) => chunk.code)
        .join("\n");
    for (const marker of EDIT_MODE_MARKERS) {
        assert.ok(code.includes(marker), `the page never carries ${marker}`);
    }
});

/* --------------------------------------------------- the single-file budget */

/**
 * The single file as the fixture workspace renders it with the default flags,
 * in bytes: `index.html` with every asset inlined, the larger of the two files
 * `--single-file` writes, measured with the React Flow engine as the only
 * engine. The budget covers only what Renderizr ships, so it leaves out the
 * logo, fonts and imagery a user may add. The page's code makes up nearly all
 * of it; the fixture workspace adds a few kilobytes.
 */
const SINGLE_FILE_BYTES = 838_191;

/**
 * The most a Claude artifact page may weigh, read as decimal megabytes, the
 * stricter reading of 16 MB. People upload `artifact.html` there.
 */
const ARTIFACT_LIMIT_BYTES = 16_000_000;

/**
 * The single file's measured size plus 10%: past it, the page grows more
 * than planned.
 */
const SINGLE_FILE_BUDGET_BYTES = Math.floor(SINGLE_FILE_BYTES * 1.1);

test("each file a default --single-file build writes stays within index.html's measured size plus 10%, and within a tenth of a Claude artifact's limit", async () => {
    const { out } = await defaultSingleFile();

    for (const name of ["index.html", "artifact.html"]) {
        const { length } = await readFile(join(out, name));
        assert.ok(
            length <= SINGLE_FILE_BUDGET_BYTES,
            `${name} is ${length} bytes, over the ${SINGLE_FILE_BUDGET_BYTES}-byte budget`,
        );
        // The rest of the limit belongs to the workspace: its documentation,
        // decisions and any imagery they embed.
        assert.ok(
            length * 10 <= ARTIFACT_LIMIT_BYTES,
            `${name} is ${length} bytes, more than a tenth of the ${ARTIFACT_LIMIT_BYTES}-byte artifact limit`,
        );
    }
});
