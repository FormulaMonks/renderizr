/**
 * `renderizr export`: an export of every view of a workspace, written in
 * Node with no browser (ADR 32). `scripts/main.js` imports this module only
 * for the subcommand, so the build and edit mode load none of it, nor
 * fontkit or esbuild behind it.
 *
 * A run goes through four steps, each a seam a later option extends:
 *
 * 1. `exportFont` chooses the font: the run's or the workspace's, else
 *    Arimo standing in for the fallback stack.
 * 2. `exportText` (`./export-text.js`) sets the text in it: fontkit
 *    measures, `hhea` gives the ascent and descent.
 * 3. `exportJobs` lists what to export: each view, in a scheme, under a
 *    perspective or none.
 * 4. `exportView` (`src/engine/react-flow/export-view.ts`, bundled by
 *    `./export-engine.js`) draws each job, and each format in `WRITERS`
 *    turns the export into a file's contents.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exportFileName } from "../src/components/export-name.js";
import { loadFont } from "./assets.js";
import { chooseBranding } from "./branding.js";
import { version } from "./config.js";
import { loadExportEngine } from "./export-engine.js";
import { rasterize } from "./export-raster.js";
import { exportText } from "./export-text.js";
import { loadSet, writeSetMessages } from "./workspace-set.js";

/**
 * The family that measures the text when neither the run nor the
 * workspace sets a font. Arimo shares Arial's widths, and Arial shares
 * Helvetica's, so it measures the page's fallback stack the same way on
 * every machine.
 */
export const STAND_IN_FAMILY = "Arimo";

/**
 * The font the run measures in, as `loadFont` takes it, and whether the
 * SVG names and embeds it. A font from `--font` or `renderizr.font` does;
 * without one, Arimo stands in, with the run's weights, subsets and
 * italic, and the SVG names the fallback stack and embeds nothing, as the
 * toolbar's does.
 */
export function exportFont({ flags, workspace, source, cwd }) {
    const chosen = chooseBranding({ flags, workspace, source, cwd });
    if (chosen.font) return { font: chosen.font, embed: true };
    return {
        font: {
            family: STAND_IN_FAMILY,
            weights: flags.fontWeights,
            subsets: flags.fontSubsets,
            italic: flags.fontItalic,
        },
        embed: false,
    };
}

/**
 * Each format the export writes, as the file's contents from the
 * serializer's export (`{ svg, width, height }`). The second argument
 * carries the run's loaded font, whose static `faces` a raster draws with,
 * and the third the bundled engine.
 *
 * The PNG is the toolbar's size, twice the export's under its pixel cap
 * (`pngSize`), drawn by resvg from the same SVG in the same faces.
 */
export const WRITERS = {
    svg: ({ svg }) => svg,
    png: ({ svg, width, height }, loaded, engine) =>
        rasterize(svg, engine.pngSize(width, height), {
            family: loaded.family,
            files: loaded.faces.map((face) => face.file),
        }),
};

/**
 * What the run exports from `views`, in order: each view's export of the
 * full view in each of `schemes`, under no perspective.
 */
export const exportJobs = (views, { schemes = ["light"] } = {}) =>
    views.flatMap((view) =>
        schemes.map((scheme) => ({
            key: view.key,
            scheme,
            perspective: null,
        })),
    );

/**
 * Export every view of the workspace `options` names into `options.out`,
 * in each of `options.formats` and `options.schemes` (light alone when
 * left out; no flag sets it yet), and resolve with the exit status: 1 when
 * any view failed, else 0. Each view that cannot be exported prints one
 * line, a failure on `stderr` with its view key. A file the run writes
 * replaces the one of the same name; nothing else in the folder changes.
 * `now` is the date the title block falls back to.
 */
export async function runExport(
    options,
    {
        cwd = process.cwd(),
        stdout = process.stdout,
        stderr = process.stderr,
        now = new Date(),
    } = {},
) {
    const set = await loadSet(options.workspaces, { cwd, output: stderr });
    writeSetMessages(set, stderr);
    const { workspace, source } = set.landscape;

    const { font, embed } = exportFont({
        flags: options.branding,
        workspace,
        source,
        cwd,
    });
    const loaded = await loadFont(font, { cwd, announce: embed });
    const text = await exportText(loaded, { embed });

    const engine = await loadExportEngine();
    const model = new engine.WorkspaceModel(workspace);
    const outDir = resolve(cwd, options.out);
    await mkdir(outDir, { recursive: true });

    let failed = 0;
    for (const job of exportJobs(engine.exportableViews(model), options)) {
        try {
            const result = engine.exportView(model, workspace, job.key, {
                scheme: job.scheme,
                perspective: job.perspective,
                text,
                built: now.toISOString(),
                version,
            });
            if (result.kind !== "svg") {
                stderr.write(
                    `Skipped ${job.key}: ${result.kind === "image" ? "an image view has no export" : result.message}\n`,
                );
                continue;
            }
            for (const format of options.formats) {
                const name = exportFileName({
                    workspace: workspace.name ?? "",
                    view: job.key,
                    perspective: job.perspective,
                    step: null,
                    scheme: job.scheme,
                    format,
                });
                const contents = await WRITERS[format](
                    result.exported,
                    loaded,
                    engine,
                );
                await writeFile(join(outDir, name), contents);
                stdout.write(`Wrote ${join(options.out, name)}\n`);
            }
        } catch (error) {
            failed++;
            stderr.write(`Failed ${job.key}: ${error.message}\n`);
        }
    }
    return failed ? 1 : 0;
}
