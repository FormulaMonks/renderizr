// Minified + gzipped size of each layout option as a browser ESM bundle (esbuild, bundle, minify).
// Usage: node docs/research/compound-layout/bundle-size.js   (needs esbuild and elkjs installed)
import { gzipSync, brotliCompressSync } from "node:zlib";
import { build } from "esbuild";

const entries = {
    "@dagrejs/dagre (incl. its graphlib)":
        'import * as d from "@dagrejs/dagre"; export default d;',
    "@joint/layout-directed-graph + dagre + graphlib (what the renderer uses today, without @joint/core)":
        'import * as d from "@dagrejs/dagre"; import * as g from "@dagrejs/graphlib"; export default { d, g };',
    "elkjs/lib/elk.bundled.js (API + engine, one chunk, no worker)":
        'import ELK from "elkjs/lib/elk.bundled.js"; export default ELK;',
    "elkjs/lib/elk-api.js (main thread, needs a worker)":
        'import ELK from "elkjs/lib/elk-api.js"; export default ELK;',
    "elkjs/lib/elk-worker.min.js (the worker, already minified)":
        'import * as w from "elkjs/lib/elk-worker.min.js"; export default w;',
    "elkjs/lib/elk-worker.js (unminified worker, re-minified by esbuild)":
        'import * as w from "elkjs/lib/elk-worker.js"; export default w;',
};

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log("| entry | minified | gzip | brotli |");
console.log("|---|---:|---:|---:|");
for (const [name, contents] of Object.entries(entries)) {
    const result = await build({
        stdin: { contents, resolveDir: process.cwd(), loader: "js" },
        bundle: true,
        minify: true,
        format: "esm",
        platform: "browser",
        write: false,
        logLevel: "silent",
        external: ["web-worker"],
    });
    const out = result.outputFiles[0].contents;
    console.log(
        `| ${name} | ${kb(out.byteLength)} | ${kb(gzipSync(out).byteLength)} | ${kb(brotliCompressSync(out).byteLength)} |`,
    );
}
