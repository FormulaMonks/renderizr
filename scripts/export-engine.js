/**
 * The page's own export code, loaded into Node for `renderizr export`
 * (ADR 32). `src/engine/react-flow/export-view.ts` is TypeScript with
 * extensionless imports, which Node runs neither of, so esbuild bundles it
 * into one module in a temporary folder the process removes on exit, and
 * the CLI imports that. The bundle compiles edit mode and the engine report
 * out, as a build does.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENTRY = fileURLToPath(
    new URL("../src/engine/react-flow/export-view.ts", import.meta.url),
);

/** The defines a build sets that the export code reads. */
const DEFINES = {
    __RENDERIZR_EDIT_MODE__: "false",
    __RENDERIZR_ENGINE_REPORT__: "false",
};

let loading = null;

/**
 * The export module (`export-view.ts`), bundled once per process: its
 * `exportView`, `exportableViews`, `WorkspaceModel` and
 * `setMermaidPrimaryColor`.
 */
export function loadExportEngine() {
    loading ??= bundle();
    return loading;
}

async function bundle() {
    const { build } = await import("esbuild");
    const result = await build({
        entryPoints: [ENTRY],
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node22",
        write: false,
        logLevel: "silent",
        define: DEFINES,
    });
    const dir = mkdtempSync(join(tmpdir(), "renderizr-export-"));
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
    const file = join(dir, "export-view.mjs");
    await writeFile(file, result.outputFiles[0].contents);
    return import(pathToFileURL(file).href);
}
