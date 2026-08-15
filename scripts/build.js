#! /usr/bin/env node

import { resolve } from "node:path";
import { build } from "vite";
import { loadFont, loadLogo, loadWorkspace } from "./assets.js";
import { parseCliArgs } from "./cli.js";
import { createConfig } from "./config.js";

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
        : "Complete!\n",
);
