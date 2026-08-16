import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { createConfig } from "./config.js";
import { REPO_ROOT } from "./__fixtures__/helpers.js";

const WORKSPACE = { name: "Fixture", views: { systemContextViews: [] } };

const pluginNames = (config) =>
    config.plugins.flat().map((plugin) => plugin.name);

test("the config roots itself at the package, not the caller's directory", () => {
    const config = createConfig({ workspace: WORKSPACE });

    assert.equal(resolve(config.root), resolve(REPO_ROOT));
    assert.ok(
        existsSync(resolve(config.root, "index.html")),
        "the root has no index.html for Vite to build",
    );
});

test("the output directory is resolved against the working directory", () => {
    assert.equal(
        createConfig({ workspace: WORKSPACE, out: "site" }).build.outDir,
        resolve(process.cwd(), "site"),
    );
    assert.equal(
        createConfig({ workspace: WORKSPACE }).build.outDir,
        resolve(process.cwd(), "structurizr-output"),
    );
    // Spelled with the platform's own separator: `resolve(cwd, "/tmp/x")` is
    // `/tmp/x` on POSIX but `C:\\tmp\\x` on Windows, so a literal here would
    // quietly make the suite unrunnable on a Windows matrix leg.
    const absolute = resolve(tmpdir(), "renderizr-abs");
    assert.equal(
        createConfig({ workspace: WORKSPACE, out: absolute }).build.outDir,
        absolute,
    );
});

test("the workspace is embedded as a compile-time constant", () => {
    const config = createConfig({ workspace: WORKSPACE });

    assert.equal(typeof config.define.workspaceData, "string");
    assert.deepEqual(JSON.parse(config.define.workspaceData), WORKSPACE);
});

test("no logo and no font are embedded as nulls, not as undefined", () => {
    const { define } = createConfig({ workspace: WORKSPACE });

    assert.equal(define.__RENDERIZR_LOGO__, "null");
    assert.equal(define.__RENDERIZR_FONT__, "null");
});

test("the footer's version comes from package.json, not from a literal", () => {
    const { define } = createConfig({ workspace: WORKSPACE });
    const manifest = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    assert.equal(JSON.parse(define.__RENDERIZR_VERSION__), manifest.version);
    // A release bumps package.json and nothing else; if this ever passes
    // against a hard-coded string the footer will keep claiming an old version.
    assert.notEqual(manifest.version, undefined);
});

test("a logo is embedded whole, but only the font's family name is", () => {
    const logo = { src: "data:image/png;base64,AAAA", alt: "Acme", href: null };
    const { define } = createConfig({
        workspace: WORKSPACE,
        logo,
        font: { family: "Inter", css: "@font-face{}" },
    });

    assert.deepEqual(JSON.parse(define.__RENDERIZR_LOGO__), logo);
    assert.equal(JSON.parse(define.__RENDERIZR_FONT__), "Inter");
});

test("the multi-file build serves the public directory and splits assets", () => {
    const config = createConfig({ workspace: WORKSPACE });

    assert.equal(config.publicDir, resolve(REPO_ROOT, "public"));
    assert.equal(config.build.assetsInlineLimit, undefined);
    assert.equal(
        config.build.rollupOptions.output.inlineDynamicImports,
        undefined,
    );
    assert.deepEqual(pluginNames(config), [
        "renderizr:structurizr-renderer",
        "renderizr:branding",
    ]);
});

test("the single-file build inlines everything and drops the public directory", () => {
    const config = createConfig({ workspace: WORKSPACE, singleFile: true });

    assert.equal(config.publicDir, false);
    assert.equal(config.build.assetsInlineLimit, Number.MAX_SAFE_INTEGER);
    assert.equal(config.build.rollupOptions.output.inlineDynamicImports, true);
    assert.ok(
        pluginNames(config).includes("renderizr:single-file"),
        "the single-file plugin was not added",
    );
});

test("vendor globals are never split into chunks", () => {
    for (const singleFile of [false, true]) {
        const config = createConfig({ workspace: WORKSPACE, singleFile });
        assert.equal(config.build.rollupOptions.output.manualChunks, undefined);
        assert.equal(config.build.cssCodeSplit, false);
        assert.equal(config.build.modulePreload, false);
    }
});

test("the build empties its output directory and targets modern browsers", () => {
    const { build } = createConfig({ workspace: WORKSPACE });

    assert.equal(build.emptyOutDir, true);
    assert.equal(build.target, "esnext");
});

test("base defaults to empty and is passed through", () => {
    assert.equal(createConfig({ workspace: WORKSPACE }).base, "");
    assert.equal(
        createConfig({ workspace: WORKSPACE, base: "/docs/" }).base,
        "/docs/",
    );
});

test("build mode refuses to re-read vite.config.ts; serve mode loads it", () => {
    assert.equal(createConfig({ workspace: WORKSPACE }).configFile, false);
    assert.equal(
        createConfig({ workspace: WORKSPACE, mode: "build" }).configFile,
        false,
    );

    const serve = createConfig({ workspace: WORKSPACE, mode: "serve" });
    assert.ok(!("configFile" in serve), "serve mode disabled the config file");
    assert.deepEqual(serve.server, { open: false });
});

test("build mode adds no dev server settings", () => {
    assert.ok(!("server" in createConfig({ workspace: WORKSPACE })));
});
