import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
    RENDERER_FILES,
    branding,
    singleFile,
    structurizrRenderer,
} from "./plugins.js";

const VENDOR = fileURLToPath(
    new URL("../vendor/structurizr/js/", import.meta.url),
);
const RESOLVED_ID = "\0virtual:structurizr-renderer";

/**
 * A stand-in for the Rollup plugin context: `generateBundle` only ever calls
 * `emitFile` and `error` on it.
 */
function pluginContext() {
    const emitted = [];
    const errors = [];

    return {
        emitted,
        errors,
        emitFile(file) {
            emitted.push(file);
        },
        error(message) {
            errors.push(message);
            throw new Error(message);
        },
    };
}

/** The shape Vite hands `generateBundle` for a build of this app. */
const makeBundle = ({
    code = 'console.log("app");',
    css = "body{color:red}",
    html,
} = {}) => ({
    "assets/index-Abc123.js": {
        type: "chunk",
        fileName: "assets/index-Abc123.js",
        code,
    },
    "assets/style-Def456.css": {
        type: "asset",
        fileName: "assets/style-Def456.css",
        source: css,
    },
    "index.html": {
        type: "asset",
        fileName: "index.html",
        source:
            html ??
            `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.png" />
    <title>Fixture | Structurizr</title>
    <script>document.documentElement.dataset.theme = "light";</script>
    <link rel="modulepreload" crossorigin href="/assets/chunk-Ghi789.js" />
    <script type="module" crossorigin src="/assets/index-Abc123.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/style-Def456.css" />
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`,
    },
});

const runSingleFile = (bundle) => {
    const context = pluginContext();
    singleFile().generateBundle.call(context, {}, bundle);
    return context;
};

const artifactOf = (context) =>
    String(
        context.emitted.find((file) => file.fileName === "artifact.html")
            .source,
    );

/* -------------------------------------------------------- renderer plugin */

test("every renderer file the plugin concatenates is vendored", () => {
    for (const file of RENDERER_FILES) {
        assert.ok(
            existsSync(resolve(VENDOR, file)),
            `vendor is missing ${file}`,
        );
    }
});

test("the renderer files are listed in load order", () => {
    // Each file extends the namespace the one before it creates, so
    // structurizr.js must come first and the diagram last.
    assert.equal(RENDERER_FILES[0], "structurizr.js");
    assert.equal(RENDERER_FILES.at(-1), "structurizr-diagram.js");
    assert.equal(new Set(RENDERER_FILES).size, RENDERER_FILES.length);
});

test("only the virtual renderer id is resolved", () => {
    const plugin = structurizrRenderer();

    assert.equal(plugin.name, "renderizr:structurizr-renderer");
    assert.equal(plugin.resolveId("virtual:structurizr-renderer"), RESOLVED_ID);
    assert.equal(plugin.resolveId("./main.ts"), null);
    assert.equal(plugin.resolveId(RESOLVED_ID), null);
});

test("the renderer loads as one minified string, not as modules", async () => {
    const plugin = structurizrRenderer();

    assert.equal(await plugin.load("./main.ts"), null);

    const loaded = await plugin.load(RESOLVED_ID);
    assert.match(loaded, /^export default "[\s\S]*";$/);

    const source = JSON.parse(loaded.slice("export default ".length, -1));
    assert.equal(typeof source, "string");

    // It is the whole renderer, and still a classic script: it must stay
    // parseable as sloppy-mode source rather than as an ES module.
    assert.ok(source.includes("structurizr"));
    assert.ok(
        source.length > 50_000,
        `renderer is only ${source.length} bytes`,
    );
    assert.doesNotThrow(
        () => new Function(source),
        "the renderer does not parse",
    );

    // Minified: smaller than the files it was built from, and free of the
    // licence banners and doc comments those files open with.
    const raw = (
        await Promise.all(
            RENDERER_FILES.map((file) =>
                readFile(resolve(VENDOR, file), "utf-8"),
            ),
        )
    ).join("");
    assert.ok(source.length < raw.length, "the renderer was not minified");
    assert.ok(!source.includes("/**"), "doc comments survived minification");
});

/* -------------------------------------------------------- branding plugin */

test("branding injects nothing when no font was embedded", () => {
    const plugin = branding({ font: null });

    assert.equal(plugin.name, "renderizr:branding");
    assert.equal(plugin.transformIndexHtml.order, "pre");

    const result = plugin.transformIndexHtml.handler("<html></html>");
    assert.equal(result.html, "<html></html>");
    assert.deepEqual(result.tags, []);
});

test("branding injects the font faces into the head before first paint", () => {
    const css =
        "@font-face{font-family:'Inter';src:url(data:font/woff2;base64,AA)}";
    const { tags } = branding({
        font: { family: "Inter", css },
    }).transformIndexHtml.handler("<html></html>");

    assert.deepEqual(tags, [{ tag: "style", children: css, injectTo: "head" }]);
});

/* ----------------------------------------------------- single-file plugin */

test("the single-file plugin runs after everything else", () => {
    const plugin = singleFile();
    assert.equal(plugin.name, "renderizr:single-file");
    assert.equal(plugin.enforce, "post");
});

test("every chunk and stylesheet is folded into the document and removed", () => {
    const bundle = makeBundle();
    runSingleFile(bundle);

    assert.deepEqual(Object.keys(bundle).sort(), ["index.html"]);

    const html = String(bundle["index.html"].source);
    assert.ok(html.includes("<style>body{color:red}</style>"));
    assert.ok(
        html.includes('<script type="module">console.log("app");</script>'),
    );
    assert.ok(!/<script[^>]*\ssrc=/.test(html), "an external script survived");
    assert.ok(
        !/<link[^>]*\sstylesheet/.test(html),
        "an external stylesheet survived",
    );
});

test("the modulepreload and favicon links are dropped", () => {
    const bundle = makeBundle();
    runSingleFile(bundle);

    const html = String(bundle["index.html"].source);
    assert.ok(!html.includes("modulepreload"));
    assert.ok(!html.includes('rel="icon"'));
    assert.ok(!html.includes("favicon.png"));
});

test("Vite's preload marker is neutralised rather than left dangling", () => {
    const bundle = makeBundle({
        code: "const m = __VITE_PRELOAD__; export default __VITE_PRELOAD__;",
    });
    runSingleFile(bundle);

    const html = String(bundle["index.html"].source);
    assert.ok(!html.includes("__VITE_PRELOAD__"));
    assert.equal((html.match(/void 0/g) ?? []).length, 2);
});

test("$& and friends in minified vendor code are not read as substitutions", () => {
    // A literal `$&` in a replacement string splices the whole match back in;
    // getting this wrong produces a plausible-looking file with the bundle
    // spliced into itself.
    const code = 'const patterns = ["$&", "$\'", "$`", "$1", "$$"];';
    const bundle = makeBundle({ code, css: 'a::after{content:"$&"}' });
    runSingleFile(bundle);

    const html = String(bundle["index.html"].source);
    assert.ok(html.includes(code), "the chunk code was rewritten");
    assert.ok(html.includes('a::after{content:"$&"}'));
});

test("a reference the bundle does not contain is left alone", () => {
    const bundle = makeBundle({
        html: `<html><head>
<script type="module" crossorigin src="https://cdn.example.test/other.js"></script>
<link rel="stylesheet" href="/assets/style-Def456.css" />
</head><body><div id="app"></div></body></html>`,
    });
    runSingleFile(bundle);

    const html = String(bundle["index.html"].source);
    assert.ok(html.includes('src="https://cdn.example.test/other.js"'));
    assert.ok(html.includes("<style>body{color:red}</style>"));
});

/* ------------------------------------------------------------ artifact.html */

test("artifact.html is a fragment: styles, then the mount point, then the code", () => {
    const context = runSingleFile(makeBundle());
    const artifact = artifactOf(context);

    assert.ok(
        !artifact.includes("<head"),
        "the fragment carries a document head",
    );
    assert.ok(!artifact.includes("<body"), "the fragment carries a body tag");
    assert.ok(
        !artifact.includes("<!doctype"),
        "the fragment carries a doctype",
    );

    const styleAt = artifact.indexOf("<style>");
    const mountAt = artifact.indexOf('<div id="app">');
    const codeAt = artifact.indexOf('<script type="module">');

    assert.ok(
        styleAt >= 0 && mountAt > styleAt && codeAt > mountAt,
        artifact.slice(0, 200),
    );
});

test("only module scripts reach the fragment; the head's inline script does not", () => {
    const artifact = artifactOf(runSingleFile(makeBundle()));

    assert.equal((artifact.match(/<script/g) ?? []).length, 1);
    assert.ok(!artifact.includes("documentElement.dataset.theme"));
});

test("markup-shaped strings inside the bundle are not scraped into the fragment", () => {
    // Structurizr's SVG export builds this string at runtime. Lifting it out of
    // the code and into the document turns an unevaluated concatenation into
    // two live stylesheet requests.
    const code =
        "const svg = '<style>@import url(\"' + font.url + '\");</style>'; export default svg;";
    const context = runSingleFile(makeBundle({ code }));
    const artifact = artifactOf(context);

    assert.ok(artifact.includes(code), "the code did not survive intact");

    // Outside the module script the fragment carries exactly one stylesheet:
    // the bundle's own. The `@import` stays where it was, inert, inside a
    // string in the code.
    const outsideCode = artifact.replace(/<script\b[\s\S]*?<\/script>/g, "");
    assert.equal(
        (outsideCode.match(/<style>/g) ?? []).length,
        1,
        "a stylesheet was scraped out of the bundled code",
    );
    assert.ok(!outsideCode.includes("@import"));
});

test("anything an artifact upload would reject stops the build", () => {
    const bundle = makeBundle({
        // Not routed through the code path, so `makeArtifactSafe` never sees it.
        css: `a::after{content:"�"}`,
    });

    assert.throws(
        () => runSingleFile(bundle),
        /artifact\.html still spells out 1 sequence\(s\) a Claude artifact upload rejects/,
    );
});

test("a clean bundle raises no artifact-upload error", () => {
    const context = runSingleFile(makeBundle());
    assert.deepEqual(context.errors, []);
});

test("html files in the bundle are never inlined into themselves", () => {
    const bundle = makeBundle();
    bundle["nested/other.html"] = {
        type: "asset",
        fileName: "nested/other.html",
        source: "<html><body>other</body></html>",
    };

    const context = runSingleFile(bundle);

    assert.ok("nested/other.html" in bundle, "a second html file was deleted");
    assert.equal(
        context.emitted.filter((file) => file.fileName === "artifact.html")
            .length,
        2,
    );
});
