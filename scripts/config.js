import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
    branding,
    singleFile,
    structurizrGlobals,
    trimJointCss,
} from "./plugins.js";

const root = fileURLToPath(new URL("..", import.meta.url));

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
            structurizrGlobals(),
            trimJointCss(),
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
        },
        ...(mode === "serve" ? { server: { open: false } } : {}),
    };
}
