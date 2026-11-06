import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARTIFACT_OUTPUT, artifact as artifactPlugins } from "./artifact.js";
import {
    branding as brandingPlugin,
    NO_BRANDING,
    setModule,
    singleFile,
    workspaceModule,
} from "./plugins.js";
import { LINE_LIMIT, shortLines } from "./short-lines.js";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Every way the page and React Flow import React, sent to Preact's
 * compatibility layer (ADR 28). One list for the dev server, edit mode, the
 * multi-file build and `--single-file`, so all four run the same library.
 * Anchored, so `@xyflow/react` and `react-flow` keep their own packages.
 */
const PREACT_ALIASES = [
    { find: /^react$/, replacement: "preact/compat" },
    { find: /^react-dom$/, replacement: "preact/compat" },
    { find: /^react-dom\/client$/, replacement: "preact/compat/client" },
    { find: /^react\/jsx-runtime$/, replacement: "preact/compat/jsx-runtime" },
    {
        find: /^react\/jsx-dev-runtime$/,
        replacement: "preact/compat/jsx-dev-runtime",
    },
];

/**
 * The version stamped into the rendered site's footer.
 *
 * Read from package.json rather than hard-coded, so the release that bumps the
 * manifest also bumps what the output says about itself. Read once at module
 * load: every build in a process renders the same version, and a missing or
 * unreadable manifest is a footer without a version, never a failed build.
 */
export const version = (() => {
    try {
        const manifest = readFileSync(resolve(root, "package.json"), "utf8");
        return JSON.parse(manifest).version ?? null;
    } catch {
        return null;
    }
})();

/**
 * The one place the Vite config is described, shared by `scripts/main.js`,
 * the dev server and edit mode so the three cannot drift.
 *
 * `editMode` is edit mode's Vite plugin (`scripts/edit-plugin.js`). It
 * serves the workspace from disk in place of the compiled-in one and
 * compiles edit mode's page code in; every other caller leaves it out, so no
 * edit-mode code reaches built output (ADR 15).
 *
 * `workspace` and `branding`, a `Branding` (`scripts/plugins.js`), are the
 * landscape scoped workspace's, or a lone workspace's, compiled into the
 * page as they always were; `set` is
 * the rest of a set, as `pageSet` in `scripts/plugins.js` gives it (ADR 26).
 * Edit mode renders one workspace and passes none.
 *
 * `devSet` is the dev server's plugins (`scripts/dev-set.js`). They serve
 * the workspace and the set from the last set that loaded, in place of the
 * compiled-in ones, and reload them on every change (spec 264).
 *
 * `artifact` writes the page as a folder for a Claude artifact
 * (`scripts/artifact.js`): the page loads its workspace from
 * `workspace.json`, so nothing specific to one workspace is compiled into
 * the runtime, and `base` has no meaning.
 */
export function createConfig({
    workspace,
    branding = NO_BRANDING,
    set = null,
    singleFile: asSingleFile = false,
    artifact = false,
    out = "structurizr-output",
    base = "",
    engineReport = false,
    mode = "build",
    editMode = null,
    devSet = null,
}) {
    const outDir = resolve(process.cwd(), out);
    const { logo, font, primaryColor } = branding;
    const buildDate = new Date().toISOString();
    /** `value` as a define; under `--artifact`, only the payload holds it. */
    const compiled = (value) => JSON.stringify(artifact ? null : value);

    return {
        root,
        base: artifact ? "" : base,
        // scripts/main.js and edit mode already hold the complete
        // configuration; letting Vite also load vite.config.ts would re-parse
        // argv in dev-server mode.
        ...(mode === "build" || editMode ? { configFile: false } : {}),
        publicDir: asSingleFile || artifact ? false : resolve(root, "public"),
        plugins: [
            // First, before the plugins that fold the output into the page
            // or the artifact's folder: Vite runs `post` plugins in order.
            ...(mode === "build" ? [shortLines()] : []),
            // Under `--artifact`, the shell links the font faces in
            // `branding.css` rather than holding them.
            brandingPlugin({ font: artifact ? null : font, primaryColor }),
            ...(devSet ??
                (artifact
                    ? artifactPlugins({
                          workspace,
                          branding,
                          set,
                          version,
                          buildDate,
                      })
                    : [
                          editMode ?? workspaceModule(workspace),
                          setModule({ ...set, inline: asSingleFile }),
                      ])),
            ...(asSingleFile ? [singleFile()] : []),
        ],
        build: {
            target: "esnext",
            outDir,
            cssCodeSplit: false,
            emptyOutDir: true,
            modulePreload: false,
            chunkSizeWarningLimit: 2048,
            assetsInlineLimit:
                asSingleFile || artifact ? Number.MAX_SAFE_INTEGER : undefined,
            rollupOptions: {
                output: asSingleFile
                    ? { inlineDynamicImports: true }
                    : artifact
                      ? ARTIFACT_OUTPUT
                      : {},
            },
        },
        resolve: {
            alias: PREACT_ALIASES,
            // pnpm gives React Flow no `preact` of its own to resolve the
            // aliases against, so Vite resolves it from the package root,
            // which also keeps the page to one copy of Preact.
            dedupe: ["preact"],
        },
        // The React Flow island is the one place JSX is written. Vite hands
        // `lineLimit` to the minifier too, which keeps every script's lines
        // short (spec 296).
        esbuild: { jsx: "automatic", lineLimit: LINE_LIMIT },
        // esbuild injects the JSX runtime, so Vite's scan never sees it and
        // finds it only on first request. Vite skips that late discovery for
        // an importer under node_modules, which is where `src` sits when
        // `npx` installs the package, and would serve the file as is, a
        // second copy of Preact beside the pre-bundled one React Flow uses.
        // Naming it here pre-bundles it wherever the package lives.
        optimizeDeps: { include: ["preact/compat/jsx-dev-runtime"] },
        define: {
            __RENDERIZR_LOGO__: compiled(logo),
            __RENDERIZR_FONT__: compiled(font ? font.family : null),
            __RENDERIZR_VERSION__: JSON.stringify(version),
            // The export's title block gives it when the workspace holds no
            // `lastModifiedDate`.
            __RENDERIZR_BUILD_DATE__: compiled(buildDate),
            // A silent Mermaid source fills its nodes with it, and export
            // needs it as a literal rather than the stylesheet's variable.
            __RENDERIZR_PRIMARY_COLOR__: compiled(primaryColor),
            // The engine's geometry report, for the acceptance harness only
            // (spec 15.1); `false` compiles the writer out of the bundle.
            __RENDERIZR_ENGINE_REPORT__: JSON.stringify(engineReport),
            // `false` compiles edit mode's page code out of the bundle.
            __RENDERIZR_EDIT_MODE__: JSON.stringify(Boolean(editMode)),
        },
        ...(mode === "serve" ? { server: { open: false } } : {}),
    };
}
