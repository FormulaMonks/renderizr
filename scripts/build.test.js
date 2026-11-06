import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
    cp,
    mkdtemp,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
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
 */
const OFFLINE = {
    NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import ${pathToFileURL(fixture("no-network.js")).href}`,
    ]
        .filter(Boolean)
        .join(" "),
};

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
            resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }),
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

/**
 * `code` with each string the build broke across lines to keep them short
 * joined again, as it reads once evaluated: the minifier ends a line inside
 * a string with a backslash, and `scripts/short-lines.js` writes a literal
 * as `"one"+⏎"two"`.
 */
const unbroken = (code) => code.replace(/\\\n|"\+\n"/g, "");

/** The entry chunk, which is where the embedded workspace ends up. */
const entryChunk = async (out) => {
    const dir = join(out, "assets");
    const files = await readdir(dir);
    const name = files.find(
        (file) => file.startsWith("index-") && file.endsWith(".js"),
    );
    assert.ok(name, `no entry chunk in ${files.join(", ")}`);
    return unbroken(await readFile(join(dir, name), "utf-8"));
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

test("a single-file build writes index.html and nothing else", async () => {
    const { out, stdout } = await singleFile();

    assert.match(stdout, /Complete\. Open /);
    assert.match(stdout, /--artifact .*Claude artifact/);
    assert.doesNotMatch(stdout, /artifact\.html/);

    assert.deepEqual(await readdir(out), ["index.html"]);
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

/* -------------------------------------------------------------------- a set */

const ENTERPRISE = join(REPO_ROOT, "test/__fixtures__/enterprise");

/** Build the enterprise fixture, a set, into `name` with `args`. */
const buildSet = async (name, args) => {
    const out = join(SCRATCH, name);
    const result = await runCli([ENTERPRISE, "--out", out, ...args], {
        env: OFFLINE,
    });
    assert.equal(
        result.code,
        0,
        `build failed:\n${result.stdout}\n${result.stderr}`,
    );
    return { out, ...result };
};
const multiFileSet = once(() => buildSet("set-multi", []));
const singleFileSet = once(() => buildSet("set-single", ["--single-file"]));

/** The workspace files of the enterprise fixture besides the landscape's. */
const SET_FILES = ["orders.json", "payments.json", "storefront.json"];

test("a set's build writes one JSON file per software system scoped workspace, named after its slug", async () => {
    const { out } = await multiFileSet();
    const written = (await readdir(out)).filter((file) =>
        file.endsWith(".json"),
    );
    assert.deepEqual(written.sort(), SET_FILES);

    const payments = JSON.parse(
        await readFile(join(out, "payments.json"), "utf-8"),
    );
    assert.equal(payments.workspace.name, "Payments");
    assert.equal(payments.branding.primaryColor, "#b0306a");
    assert.equal(payments.branding.logo.alt, "Payments");
    assert.ok(
        payments.branding.logo.src.startsWith("data:image/svg+xml"),
        "the logo is not embedded in the workspace's file",
    );
    // A workspace that sets no color of its own takes the landscape's.
    const orders = JSON.parse(
        await readFile(join(out, "orders.json"), "utf-8"),
    );
    assert.equal(orders.branding.primaryColor, "#2e7d32");
});

test("a set's build copies no logo file into --out", async () => {
    const { out } = await multiFileSet();
    const files = await readdir(out);
    assert.ok(
        !files.some((file) => file.endsWith(".svg")),
        `a logo file reached --out: ${files.join(", ")}`,
    );
});

test("the page holds the landscape scoped workspace and none of the others", async () => {
    const { out } = await multiFileSet();
    const html = await readFile(join(out, "index.html"), "utf-8");
    assert.match(html, /<title>Acme \| Structurizr<\/title>/);
    const code = await entryChunk(out);
    assert.ok(code.includes("The software systems of Acme"));
    assert.ok(
        !code.includes("Payment API"),
        "the page holds the Payments workspace",
    );
});

test("--single-file inlines every workspace of a set into the one file", async () => {
    const { out } = await singleFileSet();
    assert.deepEqual(await readdir(out), ["index.html"]);
    const html = await readFile(join(out, "index.html"), "utf-8");
    assertSelfContained(html);
    for (const description of ["The software systems of Acme", "Payment API"])
        assert.ok(
            unbroken(html).includes(description),
            `${description} is missing`,
        );
});

/* ---------------------------------------------------------------- --artifact */

/** Render `workspace` with `--artifact` into `name`, offline. */
const buildArtifact = async (name, workspace, args = []) => {
    const out = join(SCRATCH, name);
    const result = await runCli(
        [workspace, "--out", out, "--artifact", ...args],
        { env: OFFLINE },
    );
    assert.equal(
        result.code,
        0,
        `build failed:\n${result.stdout}\n${result.stderr}`,
    );
    return { out, ...result };
};
const EMPTY = join(REPO_ROOT, "test/__fixtures__/empty.json");
const BIG_BANK = join(REPO_ROOT, "test/__fixtures__/big-bank-plc.json");
const emptyArtifact = once(() => buildArtifact("artifact-empty", EMPTY));
const bigBankArtifact = once(() =>
    buildArtifact("artifact-big-bank", BIG_BANK),
);

/** The manifest an `--artifact` build wrote into `out`. */
const manifestOf = async (out) =>
    JSON.parse(await readFile(join(out, "manifest.json"), "utf-8"));

/** The runtime files a manifest lists. */
const runtimeOf = (manifest) =>
    manifest.files.filter((file) => file.layer === "runtime");

test("--artifact writes exactly the files its manifest lists, with their sizes and hashes", async () => {
    const { out, stdout } = await emptyArtifact();
    const manifest = await manifestOf(out);

    assert.match(stdout, /Complete\. Publish .* as a Claude artifact/);
    assert.deepEqual(
        manifest.files.map((file) => file.path).sort(),
        (await readdir(out, { recursive: true })).sort(),
        "the manifest and the folder disagree",
    );
    for (const { path, bytes, sha256 } of manifest.files) {
        const body = await readFile(join(out, path));
        assert.equal(body.length, bytes, `${path} is not ${bytes} bytes`);
        if (path === "manifest.json") continue;
        assert.equal(
            createHash("sha256").update(body).digest("hex"),
            sha256,
            `${path} does not match its hash`,
        );
    }
});

test("--artifact's manifest names the Renderizr version and lists itself last, with no hash", async () => {
    const { out } = await emptyArtifact();
    const manifest = await manifestOf(out);
    const { version } = JSON.parse(
        await readFile(join(REPO_ROOT, "package.json"), "utf-8"),
    );

    assert.equal(manifest.renderizr, version);
    const last = manifest.files.at(-1);
    assert.equal(last.path, "manifest.json");
    assert.equal(last.sha256, undefined, "the manifest hashes itself");
    assert.deepEqual(
        Object.fromEntries(
            manifest.files.map(({ path, layer }) => [path, layer]),
        ),
        {
            "index.html": "shell",
            "renderizr.js": "runtime",
            "renderizr-vendor.js": "runtime",
            "renderizr.css": "runtime",
            "workspace.json": "workspace",
            "manifest.json": "shell",
        },
    );
});

test("two --artifact renders of different workspaces write byte-identical runtime files", async () => {
    const [empty, bigBank] = await Promise.all([
        emptyArtifact(),
        bigBankArtifact(),
    ]);
    const runtime = runtimeOf(await manifestOf(empty.out));

    assert.ok(runtime.length > 0, "the manifest lists no runtime");
    for (const { path } of runtime) {
        assert.ok(
            (await readFile(join(empty.out, path))).equals(
                await readFile(join(bigBank.out, path)),
            ),
            `${path} differs between the two workspaces`,
        );
    }
    assert.deepEqual(
        runtimeOf(await manifestOf(bigBank.out)),
        runtime,
        "the manifests list different runtimes",
    );
});

test("--artifact's workspace.json holds the workspace, the manifest the build date, and the runtime neither", async () => {
    const { out } = await bigBankArtifact();
    const payload = JSON.parse(
        await readFile(join(out, "workspace.json"), "utf-8"),
    );
    const { buildDate } = await manifestOf(out);

    assert.equal(payload.workspace.name, "Big Bank plc");
    // The manifest goes out on every publish anyway; in a payload, the date
    // would change its hash on every render.
    assert.equal(payload.buildDate, undefined, "the payload holds the date");
    assert.ok(!Number.isNaN(Date.parse(buildDate)), `${buildDate} is no date`);
    for (const name of ["renderizr.js", "renderizr-vendor.js"]) {
        const code = await readFile(join(out, name), "utf-8");
        assert.ok(
            !code.includes("Big Bank plc"),
            `${name} holds the workspace`,
        );
        assert.ok(!code.includes(buildDate), `${name} holds the build date`);
    }
});

test("--artifact's index.html is a fragment with the workspace's name in a <title> in its first 8 KB", async () => {
    const { out } = await bigBankArtifact();
    const shell = await readFile(join(out, "index.html"), "utf-8");
    const skeleton = htmlSkeleton(shell).toLowerCase();

    assert.match(
        shell.slice(0, 8192),
        /<title>Big Bank plc[^<]*<\/title>/,
        "no <title> naming the workspace in the first 8 KB",
    );
    for (const tag of ["<!doctype", "<html", "<head", "<body"]) {
        assert.ok(!skeleton.includes(tag), `the shell carries ${tag}`);
    }
    assert.ok(skeleton.includes('<div id="app"></div>'), "no mount point");
    assert.ok(shell.includes("prefers-color-scheme"), "no theme script");
    assert.match(skeleton, /<link rel="stylesheet" href="\.\/renderizr\.css">/);
    assert.match(
        skeleton,
        /<script type="module" src="\.\/renderizr\.js"><\/script>/,
    );
});

test("no file of an --artifact build references a network asset", async () => {
    const { out } = await bigBankArtifact();
    const { files } = await manifestOf(out);
    const written = new Set(files.map((file) => file.path));

    for (const { path } of files) {
        const text = await readFile(join(out, path), "utf-8");
        assert.deepEqual(findUnspellable(text), [], `${path} has escapes`);
        assert.ok(
            !/url\(\s*["']?https?:/i.test(text),
            `${path} fetches a remote asset from a stylesheet`,
        );
        assert.ok(
            !/@import\s+(url\()?["']?https?:/i.test(text),
            `${path} @imports a URL`,
        );
    }
    const skeleton = htmlSkeleton(
        await readFile(join(out, "index.html"), "utf-8"),
    );
    assert.ok(!/https?:\/\//i.test(skeleton), "the shell names a URL");
    for (const { attribute, value } of assetReferences(skeleton)) {
        assert.ok(
            value.startsWith("#") ||
                value.startsWith("data:") ||
                written.has(value.replace(/^\.\//, "")),
            `${attribute}="${value}" names no file of the artifact`,
        );
    }
});

/* ------------------------------------------------------- --artifact branding */

/**
 * Like `OFFLINE`, with Google Fonts stubbed: the branding fixture names a
 * font, and this embeds one without going out to the network.
 */
const STUBBED_FONTS = {
    NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import ${pathToFileURL(fixture("stub-fonts.js")).href}`,
    ]
        .filter(Boolean)
        .join(" "),
};

/** Render `workspace` with `--artifact` into `name`, with fonts stubbed. */
const buildBrandedArtifact = async (name, workspace, args = []) => {
    const out = join(SCRATCH, name);
    const result = await runCli(
        [workspace, "--out", out, "--artifact", ...args],
        { env: STUBBED_FONTS },
    );
    assert.equal(
        result.code,
        0,
        `build failed:\n${result.stdout}\n${result.stderr}`,
    );
    return { out, ...result };
};
const BRANDING = join(REPO_ROOT, "test/__fixtures__/branding.json");
const brandedArtifact = once(() =>
    buildBrandedArtifact("artifact-branded", BRANDING),
);

/** The `workspace.json` an `--artifact` build wrote into `out`. */
const payloadOf = async (out) =>
    JSON.parse(await readFile(join(out, "workspace.json"), "utf-8"));

test("--artifact puts the workspace's branding in workspace.json and its font faces in branding.css", async () => {
    const { out } = await brandedArtifact();
    const { branding } = await payloadOf(out);
    const css = await readFile(join(out, "branding.css"), "utf-8");

    assert.equal(branding.logo.alt, "Acme");
    assert.equal(branding.logo.href, "https://acme.example");
    assert.ok(
        branding.logo.src.startsWith("data:image/svg+xml"),
        "the logo is not a data URI",
    );
    assert.equal(branding.primaryColor, "#e4572e");
    assert.deepEqual(
        branding.font,
        { family: "Inter", css: null },
        "the payload holds the faces that branding.css holds",
    );
    assert.match(css, /@font-face\s*\{[^}]*font-family:\s*'Inter'/);
    assert.match(css, /url\(data:font\/woff2;base64,/);
    assert.match(css, /--renderizr-font:'Inter'/);
});

test("--artifact links branding.css from the shell and lists it under the branding layer", async () => {
    const { out } = await brandedArtifact();
    const manifest = await manifestOf(out);
    const shell = await readFile(join(out, "index.html"), "utf-8");

    assert.deepEqual(
        manifest.files
            .filter((file) => file.layer === "branding")
            .map((file) => file.path),
        ["branding.css"],
    );
    assert.match(shell, /<link rel="stylesheet" href="\.\/branding\.css">/);
    assert.ok(
        !shell.includes("@font-face"),
        "the shell holds the font faces as well",
    );
    assert.match(
        shell,
        /--color-primary: #e4572e/,
        "the shell does not paint the primary color before the page starts",
    );
});

test("--artifact writes no branding.css when the render embeds no font", async () => {
    const { out } = await emptyArtifact();
    const shell = await readFile(join(out, "index.html"), "utf-8");

    assert.ok(!existsSync(join(out, "branding.css")), "branding.css written");
    assert.ok(!shell.includes("branding.css"), "the shell links branding.css");
});

test("the runtime of a branded and an unbranded --artifact render is byte-identical", async () => {
    const [branded, empty] = await Promise.all([
        brandedArtifact(),
        emptyArtifact(),
    ]);
    const runtime = runtimeOf(await manifestOf(empty.out));

    assert.deepEqual(
        runtimeOf(await manifestOf(branded.out)),
        runtime,
        "the manifests list different runtimes",
    );
    for (const { path } of runtime) {
        const code = await readFile(join(branded.out, path), "utf-8");
        for (const value of ["#e4572e", "acme.example", "'Inter'"])
            assert.ok(!code.includes(value), `${path} holds ${value}`);
    }
});

test("branding flags override the workspace's properties under --artifact", async () => {
    const { out } = await buildBrandedArtifact(
        "artifact-branding-flags",
        BRANDING,
        [
            "--primary-color",
            "#123456",
            "--logo-alt",
            "Acme Corp",
            "--logo-href",
            "https://corp.example",
            "--font",
            "Lora",
        ],
    );
    const { branding } = await payloadOf(out);

    assert.equal(branding.primaryColor, "#123456");
    assert.equal(branding.logo.alt, "Acme Corp");
    assert.equal(branding.logo.href, "https://corp.example");
    assert.equal(branding.font.family, "Lora");
    assert.match(
        await readFile(join(out, "branding.css"), "utf-8"),
        /font-family:\s*'Lora'/,
    );
});

test("a branding flag brands a workspace with no branding under --artifact", async () => {
    const { out } = await buildBrandedArtifact(
        "artifact-branding-flag-only",
        EMPTY,
        ["--primary-color", "#123456", "--logo", LOGO],
    );
    const { branding } = await payloadOf(out);

    assert.equal(branding.primaryColor, "#123456");
    assert.ok(branding.logo.src.startsWith("data:image/svg+xml"));
    assert.equal(branding.font, null);
    assert.ok(!existsSync(join(out, "branding.css")), "branding.css written");
});

test("--artifact with --single-file fails with the usage", async () => {
    const out = join(SCRATCH, "artifact-and-single");
    const { code, stderr } = await runCli([
        EMPTY,
        "--out",
        out,
        "--artifact",
        "--single-file",
    ]);

    assert.equal(code, 1);
    assert.match(stderr, /--artifact and --single-file/);
    assert.match(stderr, /Renderizr: render a Structurizr workspace/);
    assert.ok(!existsSync(out), "an output directory was created anyway");
});

test("--help describes --artifact", async () => {
    const { stdout } = await runCli(["--help"]);
    assert.match(stdout, /--artifact\s+\S/);
    assert.doesNotMatch(stdout, /artifact\.html/);
});

/* ------------------------------------------------------- --artifact, a set */

/** Render the set in `from` with `--artifact` into `name`, offline. */
const buildArtifactSet = (name, from = ENTERPRISE) => buildArtifact(name, from);
const artifactSet = once(() => buildArtifactSet("artifact-set"));

/** Each file the manifest in `out` lists, by path, with its hash. */
const hashesOf = async (out) =>
    Object.fromEntries(
        (await manifestOf(out)).files.map(({ path, sha256 }) => [path, sha256]),
    );

test("--artifact renders a set as workspace.json for the landscape scoped workspace and one <slug>.json for each other, all listed as workspaces", async () => {
    const { out } = await artifactSet();
    const { files } = await manifestOf(out);
    const workspaces = files
        .filter((file) => file.layer === "workspace")
        .map((file) => file.path);

    assert.deepEqual(workspaces.sort(), [...SET_FILES, "workspace.json"]);
    const landscape = JSON.parse(
        await readFile(join(out, "workspace.json"), "utf-8"),
    );
    assert.equal(landscape.workspace.name, "Acme");
    assert.deepEqual(landscape.workspaces.map(({ slug }) => slug).sort(), [
        "orders",
        "payments",
        "storefront",
    ]);
    assert.ok(landscape.crossings.length > 0, "the landscape crosses nowhere");

    // Each payload carries its own workspace and branding.
    const payments = JSON.parse(
        await readFile(join(out, "payments.json"), "utf-8"),
    );
    assert.equal(payments.workspace.name, "Payments");
    assert.ok(payments.branding, "payments.json carries no branding");
    for (const name of ["renderizr.js", "renderizr-vendor.js"]) {
        const code = await readFile(join(out, name), "utf-8");
        for (const text of ["Acme", "Payment API"])
            assert.ok(!code.includes(text), `${name} holds ${text}`);
    }
});

test("--artifact writes a set's runtime byte for byte the same as a lone workspace's", async () => {
    const [set, lone] = await Promise.all([artifactSet(), emptyArtifact()]);
    const runtime = runtimeOf(await manifestOf(lone.out));

    assert.deepEqual(runtimeOf(await manifestOf(set.out)), runtime);
    for (const { path } of runtime)
        assert.ok(
            (await readFile(join(set.out, path))).equals(
                await readFile(join(lone.out, path)),
            ),
            `${path} differs between the set and the lone workspace`,
        );
});

test("changing one software system scoped workspace of a set changes only its payload's hash", async () => {
    const from = join(SCRATCH, "enterprise-changed");
    await cp(ENTERPRISE, from, { recursive: true });
    const before = await hashesOf(
        (await buildArtifactSet("artifact-set-before", from)).out,
    );

    const file = join(from, "payments-workspace.json");
    const payments = JSON.parse(await readFile(file, "utf-8"));
    payments.description = "Takes the money, now with a changed description";
    await writeFile(file, JSON.stringify(payments));
    const after = await hashesOf(
        (await buildArtifactSet("artifact-set-after", from)).out,
    );

    const changed = Object.keys(after).filter(
        (path) => after[path] !== before[path],
    );
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    assert.deepEqual(changed, ["payments.json"]);
});

/* -------------------------------- --artifact, the documentation runtime */

const ARCHITECTURE = join(REPO_ROOT, "architecture/workspace.json");
/** Renderizr's own workspace: documentation, decisions and the Inter font. */
const architectureArtifact = once(() =>
    buildBrandedArtifact("artifact-architecture", ARCHITECTURE),
);
/** The fixture workspace, with documentation and decisions of its own. */
const fixtureArtifact = once(() =>
    buildArtifact("artifact-fixture", WORKSPACE),
);

/** The documentation runtime's file. */
const DOCS_RUNTIME = "renderizr-docs.js";

/**
 * Text only the documentation stack holds: markdown-it's link validator,
 * highlight.js's class prefix and the decision graph's dot marks.
 */
const DOCS_MARKERS = ["markdown-it", "hljs-", 'data-mark="dot"'];

test("--artifact writes no renderizr-docs.js for a workspace with no documentation or decisions, and the manifest lists none", async () => {
    const { out } = await bigBankArtifact();
    const { files } = await manifestOf(out);

    assert.ok(!existsSync(join(out, DOCS_RUNTIME)), `${DOCS_RUNTIME} written`);
    assert.deepEqual(
        files.filter((file) => file.layer === "docs-runtime"),
        [],
        "the manifest lists a documentation runtime",
    );
});

test("--artifact puts the documentation stack in renderizr-docs.js, under the docs-runtime layer, and nowhere else", async () => {
    const { out } = await architectureArtifact();
    const { files } = await manifestOf(out);

    assert.deepEqual(
        files
            .filter((file) => file.layer === "docs-runtime")
            .map((file) => file.path),
        [DOCS_RUNTIME],
    );
    const docs = await readFile(join(out, DOCS_RUNTIME), "utf-8");
    for (const marker of DOCS_MARKERS) {
        assert.ok(docs.includes(marker), `${DOCS_RUNTIME} lacks ${marker}`);
        for (const name of ["renderizr.js", "renderizr-vendor.js"])
            assert.ok(
                !(await readFile(join(out, name), "utf-8")).includes(marker),
                `${name} holds ${marker}`,
            );
    }
});

test("two --artifact renders of different workspaces with documentation write a byte-identical renderizr-docs.js", async () => {
    const [architecture, fixtureWorkspace] = await Promise.all([
        architectureArtifact(),
        fixtureArtifact(),
    ]);

    assert.ok(
        (await readFile(join(architecture.out, DOCS_RUNTIME))).equals(
            await readFile(join(fixtureWorkspace.out, DOCS_RUNTIME)),
        ),
        `${DOCS_RUNTIME} differs between the two workspaces`,
    );
});

test("--artifact writes the same runtime for a workspace with documentation as for one with none", async () => {
    const [architecture, empty] = await Promise.all([
        architectureArtifact(),
        emptyArtifact(),
    ]);
    const runtime = runtimeOf(await manifestOf(empty.out));

    assert.deepEqual(runtimeOf(await manifestOf(architecture.out)), runtime);
});

/* --------------------------------------------------------------- short lines */

/**
 * The longest line any file may hold outside a data URI: twice the 400
 * characters the minifier aims for, since it breaks a line at the first
 * place it can once the line passes them.
 */
const LONGEST_LINE = 800;

/**
 * The lines of `text` longer than `LONGEST_LINE` once data URIs are gone,
 * and in a JSON file `json`, once its strings are empty: JSON cannot break
 * a string across lines, and the workspace's own strings, such as
 * Structurizr's `structurizr.dsl` property, can be any length.
 */
const longLines = (text, { json = false } = {}) =>
    text
        .split("\n")
        .map((line) => line.replace(/data:[^"'`)\s]+/g, "data:"))
        .map((line) => (json ? line.replace(/"(?:[^"\\]|\\.)*"/g, '""') : line))
        .filter((line) => line.length > LONGEST_LINE);

test("no file of any build holds a line longer than the limit outside a data URI or a JSON string", async () => {
    for (const { out } of [
        await multiFile(),
        await multiFileSet(),
        await defaultSingleFile(),
        await emptyArtifact(),
        await bigBankArtifact(),
        await architectureArtifact(),
    ]) {
        for (const path of await readdir(out, { recursive: true })) {
            if (!/\.(html|js|css|json)$/.test(path)) continue;
            const long = longLines(await readFile(join(out, path), "utf-8"), {
                json: path.endsWith(".json"),
            });
            assert.deepEqual(
                long.map((line) => `${line.length}: ${line.slice(0, 80)}`),
                [],
                `${join(out, path)} holds ${long.length} long line(s)`,
            );
        }
    }
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

test("the single file passes the escaping check", async () => {
    const { out } = await singleFile();
    const html = await readFile(join(out, "index.html"), "utf-8");

    assert.deepEqual(findUnspellable(html), []);
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
    for (const { out } of [
        await multiFile(),
        await singleFile(),
        await bigBankArtifact(),
    ]) {
        const output = await builtOutput(out);
        for (const marker of EDIT_MODE_MARKERS) {
            assert.ok(
                !output.includes(marker),
                `${out} carries edit-mode code: ${marker}`,
            );
        }
    }
});

/**
 * Strings only `pnpm dev`'s page code carries: the set error's event and
 * what the page says about it (spec 264).
 */
const DEV_SET_MARKERS = [
    "renderizr:set-error",
    "The page keeps the last set that did",
];

test("no pnpm dev code reaches a build's output", async () => {
    for (const { out } of [
        await multiFile(),
        await singleFile(),
        await bigBankArtifact(),
    ]) {
        const output = await builtOutput(out);
        for (const marker of DEV_SET_MARKERS) {
            assert.ok(
                !output.includes(marker),
                `${out} carries pnpm dev code: ${marker}`,
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

/**
 * Strings only the generated Mermaid parser carries: Jison's error text, a
 * flowchart lexer token and js-yaml's license line. Minifying keeps string
 * literals, so a page that bundled the parser would carry them.
 */
const MERMAID_PARSER_MARKERS = [
    "Parse error on line",
    "DOUBLECIRCLEEND",
    "nodeca/js-yaml",
];

test("the Mermaid parser runs in the build and never reaches the page (ADR 24)", async () => {
    const parser = await readFile(
        join(REPO_ROOT, "scripts/mermaid/parser.js"),
        "utf-8",
    );
    for (const marker of MERMAID_PARSER_MARKERS) {
        assert.ok(
            parser.includes(marker),
            `the parser never carries ${marker}`,
        );
    }
    for (const { out } of [
        await multiFile(),
        await singleFile(),
        await bigBankArtifact(),
    ]) {
        const output = await builtOutput(out);
        for (const marker of MERMAID_PARSER_MARKERS) {
            assert.ok(
                !output.includes(marker),
                `${out} carries the Mermaid parser: ${marker}`,
            );
        }
    }
});

/* ------------------------------------------------------------------ Preact */

/**
 * Strings only React DOM's production build carries: the link its minified
 * errors point to and the name of its internals. Preact carries neither.
 */
const REACT_MARKERS = [
    "react.dev/errors",
    "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",
];

test("every build runs the page on Preact and ships no React", async () => {
    for (const { out } of [await multiFile(), await singleFile()]) {
        const output = await builtOutput(out);
        for (const marker of REACT_MARKERS) {
            assert.ok(
                !output.includes(marker),
                `${out} carries React: ${marker}`,
            );
        }
    }
});

test("package.json depends on Preact in place of React", async () => {
    const { dependencies } = JSON.parse(
        await readFile(join(REPO_ROOT, "package.json"), "utf-8"),
    );
    assert.ok(dependencies.preact, "preact is no dependency");
    assert.equal(dependencies.react, undefined, "react is still a dependency");
    assert.equal(
        dependencies["react-dom"],
        undefined,
        "react-dom is still a dependency",
    );
});

/* --------------------------------------------------- the single-file budget */

/**
 * The single file as the fixture workspace renders it with the default flags,
 * in bytes: `index.html` with every asset inlined, the one file
 * `--single-file` writes, measured once the page ran on Preact in place of
 * React (ADR 28), which took about a fifth off it. The budget covers only
 * what Renderizr ships, so it leaves out the logo, fonts and imagery a user
 * may add. The page's code makes up nearly all of it; the fixture workspace
 * adds a few kilobytes.
 */
const SINGLE_FILE_BYTES = 758_408;

/**
 * The single file's measured size plus 10%: past it, the page grows more
 * than planned.
 */
const SINGLE_FILE_BUDGET_BYTES = Math.floor(SINGLE_FILE_BYTES * 1.1);

test("a default --single-file build stays within its measured size plus 10%", async () => {
    const { out } = await defaultSingleFile();
    const { length } = await readFile(join(out, "index.html"));

    assert.ok(
        length <= SINGLE_FILE_BUDGET_BYTES,
        `index.html is ${length} bytes, over the ${SINGLE_FILE_BUDGET_BYTES}-byte budget`,
    );
});

/* ---------------------------------------------------- the --artifact budget */

/**
 * The runtime `--artifact` writes, in bytes: `renderizr.js`,
 * `renderizr-vendor.js` and `renderizr.css` together, measured once the page
 * ran on Preact (ADR 28) and the documentation stack moved to
 * `renderizr-docs.js`. It is the same for every workspace at a version, so
 * any fixture measures it.
 */
const RUNTIME_BYTES = 536_716;

/**
 * `renderizr-docs.js`, in bytes: markdown-it, highlight.js, the
 * documentation and decision pages and the decision graph.
 */
const DOCS_RUNTIME_BYTES = 219_953;

/** Each part of the `--artifact` runtime, with its measured size. */
const ARTIFACT_BUDGETS = [
    {
        name: "the runtime",
        files: ["renderizr.js", "renderizr-vendor.js", "renderizr.css"],
        bytes: RUNTIME_BYTES,
    },
    {
        name: "the documentation runtime",
        files: [DOCS_RUNTIME],
        bytes: DOCS_RUNTIME_BYTES,
    },
];

test("the --artifact runtime and documentation runtime each stay within their measured size plus 10%", async () => {
    const { out } = await fixtureArtifact();

    for (const { name, files, bytes } of ARTIFACT_BUDGETS) {
        let length = 0;
        for (const file of files)
            length += (await readFile(join(out, file))).length;
        const budget = Math.floor(bytes * 1.1);
        assert.ok(
            length <= budget,
            `${name} (${files.join(", ")}) is ${length} bytes, over the ${budget}-byte budget`,
        );
    }
});
