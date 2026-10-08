import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { branding, singleFile, workspaceModule } from "./plugins.js";

const root = fileURLToPath(new URL("..", import.meta.url));

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
 * The one place the Vite config is described, shared by `scripts/build.js`,
 * the dev server and edit mode so the three cannot drift.
 *
 * `editMode` is edit mode's Vite plugin (`scripts/edit-plugin.js`). It
 * serves the workspace from disk in place of the compiled-in one and
 * compiles edit mode's page code in; every other caller leaves it out, so no
 * edit-mode code reaches built output (ADR 15).
 */
export function createConfig({
    workspace,
    logo = null,
    font = null,
    primaryColor = null,
    singleFile: asSingleFile = false,
    out = "structurizr-output",
    base = "",
    engineReport = false,
    mode = "build",
    editMode = null,
}) {
    const outDir = resolve(process.cwd(), out);

    return {
        root,
        base,
        // scripts/build.js and edit mode already hold the complete
        // configuration; letting Vite also load vite.config.ts would re-parse
        // argv in dev-server mode.
        ...(mode === "build" || editMode ? { configFile: false } : {}),
        publicDir: asSingleFile ? false : resolve(root, "public"),
        plugins: [
            branding({ font, primaryColor }),
            editMode ?? workspaceModule(workspace),
            ...(asSingleFile ? [singleFile()] : []),
        ],
        build: {
            target: "esnext",
            outDir,
            cssCodeSplit: false,
            emptyOutDir: true,
            modulePreload: false,
            chunkSizeWarningLimit: 2048,
            assetsInlineLimit: asSingleFile
                ? Number.MAX_SAFE_INTEGER
                : undefined,
            rollupOptions: {
                output: asSingleFile ? { inlineDynamicImports: true } : {},
            },
        },
        // The React Flow island is the one place JSX is written.
        esbuild: { jsx: "automatic" },
        // esbuild injects the JSX runtime, so Vite's scan never sees it and
        // finds it only on first request. Vite skips that late discovery for
        // an importer under node_modules, which is where `src` sits when
        // `npx` installs the package, and would serve React's CommonJS file
        // as is. Naming it here pre-bundles it wherever the package lives.
        optimizeDeps: { include: ["react/jsx-dev-runtime"] },
        define: {
            __RENDERIZR_LOGO__: JSON.stringify(logo),
            __RENDERIZR_FONT__: JSON.stringify(font ? font.family : null),
            __RENDERIZR_VERSION__: JSON.stringify(version),
            // The engine's geometry report, for the acceptance harness only
            // (spec 15.1); `false` compiles the writer out of the bundle.
            __RENDERIZR_ENGINE_REPORT__: JSON.stringify(engineReport),
            // `false` compiles edit mode's page code out of the bundle.
            __RENDERIZR_EDIT_MODE__: JSON.stringify(Boolean(editMode)),
        },
        ...(mode === "serve" ? { server: { open: false } } : {}),
    };
}
