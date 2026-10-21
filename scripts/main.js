/**
 * The CLI behind the bin: the build, or edit mode. `./build.js` imports it only
 * once the running Node meets the floor, so nothing here loads on an older one.
 */

import { resolve } from "node:path";
import { build } from "vite";
import { loadWorkspace } from "./assets.js";
import { loadBranding } from "./branding.js";
import { parseCliArgs, parseEditArgs, withoutSeparator } from "./cli.js";
import { createConfig } from "./config.js";
import { sessionNotices, startEditServer } from "./edit.js";
import { styles } from "./terminal.js";

/** `renderizr <workspace>`: the build, which writes the static site. */
async function buildSite() {
    const options = parseCliArgs();

    const workspace = await loadWorkspace(options.workspace);
    const { logo, font, primaryColor, notices } = await loadBranding({
        flags: options.branding,
        workspace,
        source: options.workspace,
    });
    for (const notice of notices) process.stderr.write(`${notice}\n`);

    process.env.VITE_WORKSPACE_NAME = workspace.name ?? "Workspace";

    const outDir = resolve(process.cwd(), options.out);
    process.stdout.write(`Building ${workspace.name} to ${outDir}...\n`);

    await build(
        createConfig({
            workspace,
            logo,
            font,
            primaryColor,
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
    const style = styles();
    for (const notice of sessionNotices(options.session)) {
        process.stdout.write(`${style.yellow(notice)}\n`);
    }

    const { session } = options;
    const { url, pipeline, notices } = await startEditServer({
        session,
        branding: options.branding,
        port: options.port,
        open: options.open,
    });
    for (const notice of notices)
        process.stderr.write(`${styles(process.stderr).yellow(notice)}\n`);

    // What edit mode opened, and, in a DSL session, the workspace.json it
    // saves beside the DSL (spec 4.2).
    const lines = [
        "",
        `  ${style.green("✔")} ${style.bold("Edit mode is running")}`,
        "",
        `    ${style.dim("Opened ")}  ${session.kind === "dsl" ? session.dsl : session.json}`,
    ];
    if (session.kind === "dsl")
        lines.push(`    ${style.dim("Saves to")}  ${session.json}`);
    // A DSL error keeps the server up; the page shows it until a run
    // succeeds (spec 5.3).
    if (pipeline?.error)
        lines.push(
            "",
            `  ${style.red("✖")} ${style.red(`Structurizr's tools couldn't read ${session.dsl}; the page shows why until you fix it.`)}`,
        );
    lines.push(
        "",
        `  ${style.cyan("➜")}  ${style.bold("Open")} ${style.cyan(style.underline(url))}`,
        "",
        `  ${style.dim("Use this URL to come back to edit mode later. Press Ctrl+C to stop.")}`,
        "",
    );
    process.stdout.write(lines.join("\n"));
}

// `edit` is the one subcommand; any other first argument is a workspace.
const [command, ...rest] = withoutSeparator(process.argv.slice(2));
if (command === "edit") await startEditMode(rest);
else await buildSite();
