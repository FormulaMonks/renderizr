import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { branding, singleFile, structurizrRenderer } from "./plugins.js";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * The version stamped into the rendered site's footer.
 *
 * Read from package.json rather than hard-coded, so the release that bumps the
 * manifest also bumps what the output says about itself. Read once at module
 * load: every build in a process renders the same version, and a missing or
 * unreadable manifest is a footer without a version, never a failed build.
 */
const version = (() => {
    try {
        const manifest = readFileSync(resolve(root, "package.json"), "utf8");
        return JSON.parse(manifest).version ?? null;
    } catch {
        return null;
    }
})();

/**
 * The one place the Vite config is described, shared by `scripts/build.js` and
 * the dev server so the two cannot drift.
 */
export function createConfig({
    workspace,
    logo = null,
    font = null,
    singleFile: asSingleFile = false,
    out = "structurizr-output",
    base = "",
    mode = "build",
}) {
    const outDir = resolve(process.cwd(), out);

    return {
        root,
        base,
        // scripts/build.js already holds the complete configuration; letting
        // Vite also load vite.config.ts would re-parse argv in dev-server mode.
        ...(mode === "build" ? { configFile: false } : {}),
        publicDir: asSingleFile ? false : resolve(root, "public"),
        plugins: [
            structurizrRenderer(),
            branding({ font }),
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
                output: {
                    // Structurizr's engine reads jquery, lodash, backbone and
                    // jointjs off `window`; splitting them into chunks reorders
                    // initialisation and throws before the app boots.
                    manualChunks: undefined,
                    ...(asSingleFile ? { inlineDynamicImports: true } : {}),
                },
            },
        },
        define: {
            workspaceData: JSON.stringify(workspace),
            __RENDERIZR_LOGO__: JSON.stringify(logo),
            __RENDERIZR_FONT__: JSON.stringify(font ? font.family : null),
            __RENDERIZR_VERSION__: JSON.stringify(version),
        },
        ...(mode === "serve" ? { server: { open: false } } : {}),
    };
}
