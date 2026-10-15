// Bundles an entry with esbuild the way a browser build would (ESM, minified) and reports minified and gzipped
// sizes, plus the bytes each package contributes to the output.
// Usage: node measure.mjs <entry> [--split] [--alias pkg=path ...] [--plugin jison]
import { gzipSync } from "node:zlib";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";

const args = process.argv.slice(2);
const entry = resolve(args[0]);
const split = args.includes("--split");
const alias = {};
for (let i = 0; i < args.length; i++)
    if (args[i] === "--alias") {
        const [k, v] = args[i + 1].split("=");
        alias[k] = resolve(v);
    }
const plugins = [];
if (args.includes("--plugin"))
    plugins.push(
        (await import(resolve(args[args.indexOf("--plugin") + 1]))).default,
    );

const outdir = mkdtempSync(join(tmpdir(), "m177-"));
const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    splitting: split,
    outdir,
    metafile: true,
    alias,
    plugins,
    logLevel: "error",
    define: { "process.env.NODE_ENV": '"production"' },
});

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
let min = 0;
let gz = 0;
const files = readdirSync(outdir).filter((f) => f.endsWith(".js"));
for (const f of files) {
    const buf = readFileSync(join(outdir, f));
    min += buf.length;
    gz += gzipSync(buf, { level: 9 }).length;
}
console.log(
    `${args[0]}${split ? " (split)" : ""}: ${files.length} file(s), ${kb(min)} min, ${kb(gz)} gzip (each file gzipped on its own)`,
);

// With --split and --reach a,b,c: the files a page loads to draw those diagram types, meaning the entry's static
// closure plus each dynamic chunk whose inputs name one of the types, with its own static closure.
if (split && args.includes("--reach")) {
    const wanted = args[args.indexOf("--reach") + 1].split(",");
    const outputs = result.metafile.outputs;
    const keep = new Set();
    const close = (file) => {
        if (keep.has(file)) return;
        keep.add(file);
        for (const imp of outputs[file].imports)
            if (imp.kind === "import-statement") close(imp.path);
    };
    const entryOut = Object.keys(outputs).find((o) => outputs[o].entryPoint);
    close(entryOut);
    for (const [file, out] of Object.entries(outputs))
        if (
            Object.keys(out.inputs).some((i) =>
                wanted.some((w) => i.includes(w)),
            )
        )
            close(file);
    let rmin = 0;
    let rgz = 0;
    for (const f of keep)
        if (f.endsWith(".js")) {
            const buf = readFileSync(f);
            rmin += buf.length;
            rgz += gzipSync(buf, { level: 9 }).length;
        }
    console.log(
        `  reached for ${wanted.join(", ")}: ${[...keep].filter((f) => f.endsWith(".js")).length} file(s), ${kb(rmin)} min, ${kb(rgz)} gzip`,
    );
}

const byPackage = {};
for (const out of Object.values(result.metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(out.inputs)) {
        const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
        const key = m
            ? m[1]
            : input.includes("/mermaid-src/")
              ? `mermaid-src:${input
                    .split("/mermaid-src/")[1]
                    .split("/")
                    .slice(0, Number(process.env.DEPTH ?? 5))
                    .join("/")}`
              : "(own code)";
        byPackage[key] = (byPackage[key] ?? 0) + bytesInOutput;
    }
}
for (const [k, v] of Object.entries(byPackage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Number(process.env.TOP ?? 25)))
    console.log(`  ${kb(v).padStart(10)}  ${k}`);
