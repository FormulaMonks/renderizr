#! /usr/bin/env node

import { resolve } from "node:path";
import { build } from "vite";
import { loadFont, loadLogo, loadWorkspace } from "./assets.js";
import { parseCliArgs, parseEditArgs } from "./cli.js";
import { createConfig } from "./config.js";
import { sessionNotices, startEditServer } from "./edit.js";

// `npx` runs against whatever Node is on the PATH, which is often not the one
// the shell reports. Older versions fail deep inside the build instead — no
// global `fetch`, and `parseArgs` silently dropping every default — so the
// error names a missing path rather than the actual cause.
const MINIMUM_NODE = 20;
if (Number.parseInt(process.versions.node, 10) < MINIMUM_NODE) {
    process.stderr.write(
        `Renderizr needs Node ${MINIMUM_NODE} or newer; this is ${process.version}.\n`,
    );
    process.exit(1);
}

/** `renderizr <workspace>`: the build, which writes the static site. */
async function buildSite() {
    const options = parseCliArgs();

    const font = await loadFont(options.font);
    const [workspace, logo] = await Promise.all([
        loadWorkspace(options.workspace, { font }),
        loadLogo(options.logo),
    ]);

    process.env.VITE_WORKSPACE_NAME = workspace.name ?? "Workspace";

    const outDir = resolve(process.cwd(), options.out);
    process.stdout.write(`Building ${workspace.name} to ${outDir}...\n`);

    await build(
        createConfig({
            workspace,
            logo,
            font,
            singleFile: options.singleFile,
            out: options.out,
            base: options.base,
            // Not a CLI flag: only the acceptance harness asks for the engine's
            // geometry report (spec 15.1), and readers never need it.
            engineReport: process.env.RENDERIZR_ENGINE_REPORT === "1",
        }),
    );

    process.stdout.write(
        options.singleFile
            ? `Complete. Open ${outDir}/index.html directly, or upload ${outDir}/artifact.html as a Claude artifact.\n`
            : `Complete. Serve ${outDir} with any static server; add --single-file for one self-contained document instead.\n`,
    );
}

/**
 * `renderizr edit [path]`: edit mode's local server (spec 4, ADR 15). It runs
 * until the author stops it with Ctrl+C.
 */
async function startEditMode(args) {
    const options = parseEditArgs(args);
    for (const notice of sessionNotices(options.session)) {
        process.stdout.write(`${notice}\n`);
    }

    const [font, logo] = await Promise.all([
        loadFont(options.font),
        loadLogo(options.logo),
    ]);
    const { session } = options;
    const { url, pipeline } = await startEditServer({
        session,
        logo,
        font,
        port: options.port,
        open: options.open,
    });

    // A DSL session saves workspace.json beside the DSL (spec 4.2).
    const opened =
        session.kind === "dsl"
            ? `${session.dsl}, saving the layout into ${session.json}`
            : session.json;
    // A DSL error keeps the server up; the page shows it until a run
    // succeeds (spec 5.3).
    const failed = pipeline?.error
        ? `Structurizr's tools couldn't read ${session.dsl}; the page shows why until you fix it.\n`
        : "";
    process.stdout.write(
        `Edit mode opened ${opened}\n${failed}Open ${url}\nTo come back to edit mode later, use this URL. Press Ctrl+C to stop.\n`,
    );
}

// `edit` is the one subcommand; any other first argument is a workspace.
const [command, ...rest] = process.argv.slice(2);
if (command === "edit") await startEditMode(rest);
else await buildSite();
