#! /usr/bin/env node

import { resolve } from "node:path";
import { build } from "vite";
import { loadFont, loadLogo, loadWorkspace } from "./assets.js";
import { parseCliArgs } from "./cli.js";
import { createConfig } from "./config.js";

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
    }),
);

process.stdout.write(
    options.singleFile
        ? `Complete. Open ${outDir}/index.html directly, or upload ${outDir}/artifact.html as a Claude artifact.\n`
        : `Complete. Serve ${outDir} with any static server; add --single-file for one self-contained document instead.\n`,
);
