import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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

/** What `plugin` loads for the page's workspace module, through its own hooks. */
const workspaceModuleSource = (plugin) =>
    plugin.load(plugin.resolveId("virtual:renderizr/workspace"));

test("the workspace is compiled in as the page's workspace module", () => {
    const config = createConfig({ workspace: WORKSPACE });
    const plugin = config.plugins.find(
        (candidate) => candidate.name === "renderizr:workspace",
    );

    const [workspace, version, error] =
        workspaceModuleSource(plugin).split("\n");
    assert.ok(workspace.startsWith("export default "));
    assert.deepEqual(
        JSON.parse(workspace.slice("export default ".length, -1)),
        WORKSPACE,
    );
    assert.equal(version, "export const version = null;");
    assert.equal(error, "export const error = null;");
    assert.ok(!("workspaceData" in config.define));
});

/* ---------------------------------------------------------------- edit mode */

/** A stand-in for edit mode's plugin; the config only places it. */
const EDIT_MODE = { name: "renderizr:edit-mode" };

test("builds and the dev server compile edit mode out", () => {
    for (const mode of ["build", "serve"]) {
        assert.equal(
            createConfig({ workspace: WORKSPACE, mode }).define
                .__RENDERIZR_EDIT_MODE__,
            "false",
            `${mode} compiles edit mode in`,
        );
    }
});

test("edit mode compiles its page code in and serves the workspace in place of the compiled-in one", () => {
    const config = createConfig({ editMode: EDIT_MODE, mode: "edit" });

    assert.equal(config.define.__RENDERIZR_EDIT_MODE__, "true");
    assert.deepEqual(pluginNames(config), [
        "renderizr:branding",
        "renderizr:edit-mode",
        "renderizr:set",
    ]);
    assert.equal(config.configFile, false, "edit mode re-reads vite.config.ts");
});

/** Stand-ins for the dev set's plugins; the config only places them. */
const DEV_SET = [
    { name: "renderizr:workspace" },
    { name: "renderizr:set" },
    { name: "renderizr:dev-set" },
];

test("the dev server's set plugins serve the set in place of the compiled-in one", () => {
    const config = createConfig({
        workspace: WORKSPACE,
        devSet: DEV_SET,
        mode: "serve",
    });
    assert.deepEqual(pluginNames(config), [
        "renderizr:branding",
        "renderizr:workspace",
        "renderizr:set",
        "renderizr:dev-set",
    ]);
    assert.ok(
        config.plugins.includes(DEV_SET[0]),
        "the compiled-in workspace module stayed",
    );
    assert.equal(config.define.__RENDERIZR_EDIT_MODE__, "false");
});

/* ------------------------------------------------------------------ Preact */

/** What the page imports React by, as React Flow and the island spell it. */
const REACT_SPECIFIERS = [
    "react",
    "react-dom",
    "react-dom/client",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
];

/** Where `config`'s aliases send `specifier`, or null when none matches. */
const aliasOf = (config, specifier) => {
    const alias = (config.resolve?.alias ?? []).find(({ find }) =>
        find instanceof RegExp ? find.test(specifier) : find === specifier,
    );
    return alias ? specifier.replace(alias.find, alias.replacement) : null;
};

test("the dev server, edit mode and every build send React to Preact", () => {
    const configs = {
        build: createConfig({ workspace: WORKSPACE }),
        "--single-file": createConfig({
            workspace: WORKSPACE,
            output: "single-file",
        }),
        "pnpm dev": createConfig({
            workspace: WORKSPACE,
            devSet: DEV_SET,
            mode: "serve",
        }),
        "edit mode": createConfig({ editMode: EDIT_MODE, mode: "edit" }),
    };
    for (const [name, config] of Object.entries(configs)) {
        for (const specifier of REACT_SPECIFIERS) {
            const target = aliasOf(config, specifier);
            assert.ok(target, `${name} leaves ${specifier} to React`);
            assert.match(
                target,
                /^preact\/compat(\/|$)/,
                `${name} sends ${specifier} to ${target}`,
            );
            assert.ok(
                existsSync(fileURLToPath(import.meta.resolve(target))),
                `${name}: ${target} resolves to no file`,
            );
        }
        // React Flow sits where pnpm gives it no `preact` of its own, so
        // Vite has to resolve the alias from the package root.
        assert.ok(
            config.resolve.dedupe.includes("preact"),
            `${name} resolves preact from wherever imports it`,
        );
    }
});

test("an import that only starts like React's keeps its own package", () => {
    const config = createConfig({ workspace: WORKSPACE });
    for (const specifier of ["react-flow", "@xyflow/react", "reactive"]) {
        assert.equal(aliasOf(config, specifier), null, specifier);
    }
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

test("the build stamps its date, which the export's title block falls back to", () => {
    const before = Date.now();
    const { define } = createConfig({ workspace: WORKSPACE });
    const built = Date.parse(JSON.parse(define.__RENDERIZR_BUILD_DATE__));

    assert.ok(built >= before && built <= Date.now(), "the date of the build");
});

test("the primary color reaches the page as a literal, null when none is chosen", () => {
    const chosen = createConfig({
        workspace: WORKSPACE,
        branding: { logo: null, font: null, primaryColor: "#e4572e" },
    });
    const none = createConfig({ workspace: WORKSPACE });

    assert.equal(
        JSON.parse(chosen.define.__RENDERIZR_PRIMARY_COLOR__),
        "#e4572e",
    );
    assert.equal(JSON.parse(none.define.__RENDERIZR_PRIMARY_COLOR__), null);
});

test("a logo is embedded whole, but only the font's family name is", () => {
    const logo = { src: "data:image/png;base64,AAAA", alt: "Acme", href: null };
    const { define } = createConfig({
        workspace: WORKSPACE,
        branding: {
            logo,
            font: { family: "Inter", css: "@font-face{}" },
            primaryColor: null,
        },
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
        "renderizr:short-lines",
        "renderizr:branding",
        "renderizr:workspace",
        "renderizr:set",
    ]);
});

test("--artifact names the runtime files, inlines assets and loads the workspace in place of the compiled-in one", () => {
    const config = createConfig({
        workspace: WORKSPACE,
        output: "artifact",
        base: "/docs/",
    });
    const { output } = config.build.rollupOptions;

    assert.equal(config.publicDir, false);
    assert.equal(config.base, "", "--base reached the artifact");
    assert.equal(config.build.assetsInlineLimit, Number.MAX_SAFE_INTEGER);
    assert.equal(output.entryFileNames, "renderizr.js");
    assert.equal(output.assetFileNames, "renderizr[extname]");
    assert.deepEqual(pluginNames(config), [
        "renderizr:short-lines",
        "renderizr:branding",
        "renderizr:artifact-modules",
        "renderizr:artifact",
    ]);
});

test("--artifact compiles in no value that changes from one workspace or build to the next", () => {
    const { define } = createConfig({
        workspace: WORKSPACE,
        output: "artifact",
        branding: {
            logo: { src: "data:image/svg+xml,x", alt: "Acme" },
            font: { family: "Inter", css: null },
            primaryColor: "#e4572e",
        },
    });

    for (const name of [
        "__RENDERIZR_LOGO__",
        "__RENDERIZR_FONT__",
        "__RENDERIZR_PRIMARY_COLOR__",
        "__RENDERIZR_BUILD_DATE__",
    ])
        assert.equal(define[name], "null", `${name} is compiled in`);
});

test("the single-file build inlines everything and drops the public directory", () => {
    const config = createConfig({
        workspace: WORKSPACE,
        output: "single-file",
    });

    assert.equal(config.publicDir, false);
    assert.equal(config.build.assetsInlineLimit, Number.MAX_SAFE_INTEGER);
    assert.equal(config.build.rollupOptions.output.inlineDynamicImports, true);
    assert.ok(
        pluginNames(config).includes("renderizr:single-file"),
        "the single-file plugin was not added",
    );
});

test("the build keeps one stylesheet and preloads no modules", () => {
    for (const output of ["site", "single-file"]) {
        const config = createConfig({ workspace: WORKSPACE, output });
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

test("the React Flow island's JSX is built by esbuild", () => {
    assert.equal(
        createConfig({ workspace: WORKSPACE }).esbuild.jsx,
        "automatic",
    );
});

test("the engine report is compiled out unless asked for", () => {
    assert.equal(
        createConfig({ workspace: WORKSPACE }).define
            .__RENDERIZR_ENGINE_REPORT__,
        "false",
        "the report writer is compiled in by default",
    );
    assert.equal(
        createConfig({ workspace: WORKSPACE, engineReport: true }).define
            .__RENDERIZR_ENGINE_REPORT__,
        "true",
        "asking for the report does not compile the writer in",
    );
});
