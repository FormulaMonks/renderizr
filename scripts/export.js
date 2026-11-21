/**
 * `renderizr export`: an export of every view of a workspace, written in
 * Node with no browser (ADR 32). `scripts/main.js` imports this module only
 * for the subcommand, so the build and edit mode load none of it, nor
 * fontkit or esbuild behind it.
 *
 * A run goes through four steps for each workspace of the set, each a
 * seam a later option extends:
 *
 * 1. `exportFont` chooses the font and the primary color: the run's or the
 *    workspace's, else Arimo standing in for the fallback stack.
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
import { exportText } from "./export-text.js";
import { exportUsage } from "./cli.js";
import { setMemberOf } from "./plugins.js";
import { loadSet, writeSetMessages } from "./workspace-set.js";

/**
 * The family that measures the text when neither the run nor the
 * workspace sets a font. Arimo shares Arial's widths, and Arial shares
 * Helvetica's, so it measures the page's fallback stack the same way on
 * every machine.
 */
export const STAND_IN_FAMILY = "Arimo";

/**
 * The font the run measures in, as `loadFont` takes it, whether the SVG
 * names and embeds it, and the primary color that fills unstyled Mermaid
 * nodes (null for the page's own). Each comes from the flag, then the
 * workspace's property, then, for a workspace of a set, the `landscape`
 * scoped workspace's, as the build brands it. A font from `--font` or
 * `renderizr.font` is embedded; without one, Arimo stands in, with the
 * run's weights, subsets and italic, and the SVG names the fallback stack
 * and embeds nothing, as the toolbar's does. The logo plays no part.
 */
export function exportFont({
    flags,
    workspace,
    source,
    landscape = null,
    cwd,
}) {
    const chosen = chooseBranding({ flags, workspace, source, landscape, cwd });
    const { primaryColor } = chosen;
    if (chosen.font) return { font: chosen.font, embed: true, primaryColor };
    return {
        font: {
            family: STAND_IN_FAMILY,
            weights: flags.fontWeights,
            subsets: flags.fontSubsets,
            italic: flags.fontItalic,
        },
        embed: false,
        primaryColor,
    };
}

/**
 * Each format the export writes, as the file's contents from the
 * serializer's export (`{ svg, width, height }`). The second argument
 * carries the run's loaded font, whose static `faces` a raster draws with.
 */
export const WRITERS = {
    svg: ({ svg }) => svg,
};

/**
 * What the run exports from `views`, in order: for each view `keys` names
 * (every view when null), its export in each of `schemes` under no
 * perspective, then under each of `perspectives`. A view that carries none
 * of a perspective draws as under none; `runExport` skips that job.
 */
export const exportJobs = (
    views,
    { schemes = ["light"], views: keys = null, perspectives = [] } = {},
) =>
    views
        .filter((view) => !keys || keys.includes(view.key))
        .flatMap((view) =>
            [null, ...perspectives].flatMap((perspective) =>
                schemes.map((scheme) => ({
                    key: view.key,
                    scheme,
                    perspective,
                })),
            ),
        );

/** `items` joined as prose: `A`, `A and B`, `A, B and C`. */
const prose = (items) =>
    items.length < 2
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/**
 * Each workspace of `set` as the run exports it: the landscape scoped
 * workspace (or the lone one) first, then the others, each with the set
 * links its model draws its workspace indicators from, as the page gives
 * them, and the landscape it takes branding from.
 */
function setMembers(set) {
    const workspaces = set.workspaces.map((member) =>
        setMemberOf({ ...member, payload: { workspace: member.workspace } }),
    );
    const links = (member) => ({
        workspaces,
        crossings: member.crossings ?? [],
    });
    return [
        { ...set.landscape, links: links(set.landscape), landscape: null },
        ...set.workspaces.map((member) => ({
            ...member,
            links: links(member),
            landscape: set.landscape,
        })),
    ];
}

/**
 * Export every view of each workspace `options.workspaces` names (a set
 * included) into `options.out`, in each of `options.formats` and
 * `options.schemes` (light alone when left out), under no perspective and
 * each of `options.perspectives`, limited to the keys in `options.views`
 * when set. Resolve with the exit status: 1 when any view failed or a key
 * in `options.views` names no view of any workspace (then nothing is
 * written), else 0. Each view that cannot be exported prints one line, a
 * failure on `stderr` with its view key. A file the run writes replaces the
 * one of the same name; nothing else in the folder changes. `now` is the
 * date the title block falls back to.
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

    const engine = await loadExportEngine();
    const members = setMembers(set).map((member) => ({
        ...member,
        model: new engine.WorkspaceModel(member.workspace, member.links),
    }));

    const known = new Set(
        members.flatMap(({ model }) =>
            engine.exportableViews(model).map(({ key }) => key),
        ),
    );
    const unknown = (options.views ?? []).filter((key) => !known.has(key));
    if (unknown.length) {
        stderr.write(
            `No workspace has the view${unknown.length > 1 ? "s" : ""} ${prose(unknown)}.\n\n`,
        );
        exportUsage(stderr);
        return 1;
    }

    const outDir = resolve(cwd, options.out);
    await mkdir(outDir, { recursive: true });
    // A font loads once per run however many workspaces take it.
    const fonts = new Map();
    // In a set, a view key may repeat: its messages name the workspace too.
    const inSet = members.length > 1;

    let failed = 0;
    for (const { workspace, source, landscape, model } of members) {
        const { font, embed, primaryColor } = exportFont({
            flags: options.branding,
            workspace,
            source,
            landscape,
            cwd,
        });
        const fontKey = JSON.stringify({ font, embed });
        if (!fonts.has(fontKey)) {
            fonts.set(
                fontKey,
                loadFont(font, { cwd, announce: embed }).then(
                    async (loaded) => ({
                        loaded,
                        text: await exportText(loaded, { embed }),
                    }),
                ),
            );
        }
        const { loaded, text } = await fonts.get(fontKey);
        engine.setMermaidPrimaryColor(primaryColor);

        // Each view without an export says so once, whatever its jobs.
        const skipped = new Set();
        for (const job of exportJobs(engine.exportableViews(model), options)) {
            const label = inSet ? `${job.key} (${workspace.name})` : job.key;
            try {
                const result = engine.exportView(model, workspace, job.key, {
                    scheme: job.scheme,
                    perspective: job.perspective,
                    text,
                    built: now.toISOString(),
                    version,
                });
                if (result.kind !== "svg") {
                    if (!skipped.has(job.key)) {
                        skipped.add(job.key);
                        stderr.write(
                            `Skipped ${label}: ${result.kind === "image" ? "an image view has no export" : result.message}\n`,
                        );
                    }
                    continue;
                }
                // The view carries none of the perspective: the plain
                // export already shows it.
                if (job.perspective !== null && result.perspective === null)
                    continue;
                for (const format of options.formats) {
                    const name = exportFileName({
                        workspace: workspace.name ?? "",
                        view: job.key,
                        perspective: result.perspective,
                        step: null,
                        scheme: job.scheme,
                        format,
                    });
                    const contents = await WRITERS[format](
                        result.exported,
                        loaded,
                    );
                    await writeFile(join(outDir, name), contents);
                    stdout.write(`Wrote ${join(options.out, name)}\n`);
                }
            } catch (error) {
                failed++;
                stderr.write(`Failed ${label}: ${error.message}\n`);
            }
        }
    }
    return failed ? 1 : 0;
}
