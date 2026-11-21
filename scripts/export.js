/**
 * `renderizr export`: an export of every view of a workspace, written in
 * Node with no browser (ADR 32). `scripts/main.js` imports this module only
 * for the subcommand, so the build and edit mode load none of it, nor
 * fontkit or esbuild behind it.
 *
 * A run goes through four steps for each workspace of the set:
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
import { rasterize } from "./export-raster.js";
import { exportText, glyphCoverage } from "./export-text.js";
import {
    drawnText,
    familyWarning,
    glyphWarning,
    offlineError,
    prose,
    unloadableFamilies,
} from "./export-warnings.js";
import { exportUsage } from "./cli.js";
import { setMemberOf } from "./plugins.js";
import { loadSet, writeSetMessages } from "./workspace-set.js";

/* -------------------------------------------------------------------- font */

/**
 * The family that measures the text when neither the run nor the
 * workspace sets a font. Arimo shares Arial's widths, and Arial shares
 * Helvetica's, so it measures the page's fallback stack the same way on
 * every machine.
 */
export const STAND_IN_FAMILY = "Arimo";

/**
 * The font the run measures in, as `loadFont` takes it, whether Arimo
 * stands in for the fallback stack, and the primary color that fills
 * unstyled Mermaid nodes (null for the page's own). Each comes from the
 * flag, then the workspace's property, then, for a workspace of a set, the
 * `landscape` scoped workspace's, as the build brands it. A font from
 * `--font` or `renderizr.font` is embedded; without one, Arimo stands in
 * (`standIn`), with the run's weights, subsets and italic, and the SVG
 * names the fallback stack and embeds nothing, as the toolbar's does. The
 * logo plays no part.
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
    if (chosen.font) return { font: chosen.font, standIn: false, primaryColor };
    return {
        font: {
            family: STAND_IN_FAMILY,
            weights: flags.fontWeights,
            subsets: flags.fontSubsets,
            italic: flags.fontItalic,
        },
        standIn: true,
        primaryColor,
    };
}

/**
 * `font` loaded and set up to set text in, once per run however many
 * workspaces take it (`fonts` keeps each): the `loaded` font, the `text`
 * `exportView` takes, and `missingGlyphsIn(text)`, the characters of a
 * text no face has. A font the run cannot fetch rejects with the offline
 * message when that is why.
 */
function typesetFor(fonts, { font, standIn }, cwd) {
    const key = JSON.stringify({ font, standIn });
    if (!fonts.has(key)) {
        fonts.set(
            key,
            loadFont(font, { cwd, announce: !standIn }).then(
                async (loaded) => ({
                    loaded,
                    text: await exportText(loaded, { standIn }),
                    missingGlyphsIn: await glyphCoverage(loaded.faces),
                }),
                (error) => {
                    throw offlineError(font, error, { standIn }) ?? error;
                },
            ),
        );
    }
    return fonts.get(key);
}

/* -------------------------------------------------------------------- jobs */

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

/** The keys of `keys` that name no view of any of `members`. */
function unknownViews(engine, members, keys) {
    const known = new Set(
        members.flatMap(({ model }) =>
            engine.exportableViews(model).map(({ key }) => key),
        ),
    );
    return (keys ?? []).filter((key) => !known.has(key));
}

/* ----------------------------------------------------------------- writers */

/**
 * Each format the export writes, as the file's contents. A writer takes
 * one object: `exported`, the serializer's `{ svg, width, height }`;
 * `loaded`, the run's font, whose static `faces` a raster draws with;
 * `engine`, the bundled engine; and `missingGlyphs`, whether the text holds
 * characters those faces lack.
 *
 * The PNG is the toolbar's size, twice the export's under its pixel cap
 * (`pngSize`), drawn by resvg from the same SVG in the same faces, and the
 * missing glyphs from the system fonts.
 */
export const WRITERS = {
    svg: ({ exported }) => exported.svg,
    png: ({
        exported: { svg, width, height },
        loaded,
        engine,
        missingGlyphs,
    }) =>
        rasterize(svg, engine.pngSize(width, height), {
            family: loaded.family,
            files: loaded.faces.map((face) => face.file),
            systemFonts: missingGlyphs,
        }),
};

/* --------------------------------------------------------------------- run */

/**
 * Write `result`, the export of `job`, in each of the run's formats, and
 * print each file written.
 */
async function writeFiles(run, member, job, result, missingGlyphs) {
    for (const format of run.options.formats) {
        const name = exportFileName({
            workspace: member.workspace.name ?? "",
            view: job.key,
            perspective: result.perspective,
            step: null,
            scheme: job.scheme,
            format,
        });
        const contents = await WRITERS[format]({
            exported: result.exported,
            loaded: member.typeset.loaded,
            engine: run.engine,
            missingGlyphs,
        });
        await writeFile(join(run.outDir, name), contents);
        run.stdout.write(`Wrote ${join(run.options.out, name)}\n`);
    }
}

/**
 * Export view `key` of `member` in each of its `jobs`, then warn once
 * about the characters its faces lack and the families it cannot load,
 * whatever the number of jobs. A view without an export says so once.
 * Resolve with the number of jobs that failed.
 */
async function exportViewJobs(run, member, key, jobs) {
    const { workspace, model, standIn } = member;
    const { loaded, text, missingGlyphsIn } = member.typeset;
    const label = run.inSet ? `${key} (${workspace.name})` : key;
    const missing = new Set();
    const families = new Set();
    let failed = 0;
    for (const job of jobs) {
        try {
            const result = run.engine.exportView(model, workspace, key, {
                scheme: job.scheme,
                perspective: job.perspective,
                text,
                built: run.now.toISOString(),
                version,
            });
            if (result.kind !== "svg") {
                run.stderr.write(
                    `Skipped ${label}: ${result.kind === "image" ? "an image view has no export" : result.message}\n`,
                );
                break;
            }
            // The view carries none of the perspective: the plain export
            // already shows it.
            if (job.perspective !== null && result.perspective === null)
                continue;
            const { svg } = result.exported;
            const missingInJob = missingGlyphsIn(drawnText(svg));
            for (const character of missingInJob) missing.add(character);
            const unloadable = unloadableFamilies(svg, {
                family: loaded.family,
                standIn,
            });
            for (const name of unloadable) families.add(name);
            await writeFiles(run, member, job, result, missingInJob.length > 0);
        } catch (error) {
            failed++;
            run.stderr.write(`Failed ${label}: ${error.message}\n`);
        }
    }
    const warned = {
        view: key,
        workspace: workspace.name,
        family: loaded.family,
    };
    if (families.size)
        run.stderr.write(
            `${familyWarning({ ...warned, families: [...families] })}\n`,
        );
    if (missing.size)
        run.stderr.write(
            `${glyphWarning({ ...warned, missing: [...missing], ranges: loaded.ranges ?? {}, subsets: member.font.subsets })}\n`,
        );
    return failed;
}

/**
 * Export every view of each workspace `options.workspaces` names (a set
 * included) into `options.out`, in each of `options.formats` and
 * `options.schemes` (light alone when left out), under no perspective and
 * each of `options.perspectives`, limited to the keys in `options.views`
 * when set. Resolve with the exit status: 1 when any view failed or a key
 * in `options.views` names no view of any workspace (then nothing is
 * written), else 0. Each view that cannot be exported prints one line, a
 * failure on `stderr` with its view key. A view whose text holds characters
 * the font lacks, or names a family the run cannot load, warns once on
 * `stderr` and still writes its files. A font the run cannot fetch
 * (offline with a cold cache) rejects with a message that names it. A file
 * the run writes replaces the one of the same name; nothing else in the
 * folder changes. `now` is the date the title block falls back to.
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

    const unknown = unknownViews(engine, members, options.views);
    if (unknown.length) {
        stderr.write(
            `No workspace has the view${unknown.length > 1 ? "s" : ""} ${prose(unknown)}.\n\n`,
        );
        exportUsage(stderr);
        return 1;
    }

    const outDir = resolve(cwd, options.out);
    await mkdir(outDir, { recursive: true });
    const run = {
        engine,
        options,
        outDir,
        now,
        stdout,
        stderr,
        // In a set, a view key may repeat: its messages name the workspace
        // too.
        inSet: members.length > 1,
    };
    const fonts = new Map();

    let failed = 0;
    for (const member of members) {
        const { font, standIn, primaryColor } = exportFont({
            flags: options.branding,
            workspace: member.workspace,
            source: member.source,
            landscape: member.landscape,
            cwd,
        });
        const typeset = await typesetFor(fonts, { font, standIn }, cwd);
        engine.setMermaidPrimaryColor(primaryColor);
        const jobs = Map.groupBy(
            exportJobs(engine.exportableViews(member.model), options),
            (job) => job.key,
        );
        for (const [key, viewJobs] of jobs)
            failed += await exportViewJobs(
                run,
                { ...member, font, standIn, typeset },
                key,
                viewJobs,
            );
    }
    return failed ? 1 : 0;
}
