// Bundles entries/trimmed-read.mjs for Node, runs it on the samples with no DOM, and prints what the db holds,
// so the trimmed reader can be compared with mermaid's own parse (node-stub.mjs).
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import trim from "./trim-plugin.mjs";
import * as samples from "./samples.mjs";

const outfile = join(mkdtempSync(join(tmpdir(), "m177-")), "trimmed.mjs");
await esbuild.build({
    entryPoints: [join(import.meta.dirname, "entries/trimmed-read.mjs")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    plugins: [trim],
    logLevel: "error",
});
const { read } = await import(pathToFileURL(outfile).href);
console.log(
    `unminified Node bundle: ${(statSync(outfile).size / 1024).toFixed(1)} kB`,
);

const show = (o) =>
    JSON.stringify(o, (_k, v) =>
        v instanceof Map
            ? Object.fromEntries(v)
            : v instanceof Set
              ? [...v]
              : v,
    );
for (const [name, text] of Object.entries(samples)) {
    try {
        const t0 = performance.now();
        const { kind, config, title, db } = read(text);
        const ms = (performance.now() - t0).toFixed(1);
        console.log(
            `\n== ${name}: ${kind} in ${ms} ms, title ${JSON.stringify(title)}, config ${show(config)}`,
        );
        if (kind === "flowchart") {
            console.log(
                "vertices",
                show(
                    [...db.getVertices().values()].map(
                        ({ id, text, type, link, classes, styles }) => ({
                            id,
                            text,
                            type,
                            link,
                            classes,
                            styles,
                        }),
                    ),
                ),
            );
            console.log(
                "edges",
                show(
                    db.getEdges().map(({ start, end, type, stroke, text }) => ({
                        start,
                        end,
                        type,
                        stroke,
                        text,
                    })),
                ),
            );
            console.log(
                "subgraphs",
                show(
                    db
                        .getSubGraphs()
                        .map(({ id, title, nodes }) => ({ id, title, nodes })),
                ),
                "direction",
                db.getDirection(),
                "tooltip A",
                db.getTooltip("A"),
            );
        }
        if (kind === "er")
            console.log(
                "entities",
                show(db.getEntities()),
                "\nrelationships",
                show(db.getRelationships()),
            );
        if (kind === "sequence") {
            console.log("actors", show(db.getActors()));
            console.log(
                "messages",
                show(
                    db
                        .getMessages()
                        .map(({ from, to, message, type, activate }) => ({
                            from,
                            to,
                            message,
                            type,
                            activate,
                        })),
                ),
            );
        }
    } catch (e) {
        console.log(
            `\n== ${name}: ERROR ${e.message.split("\n")[0]} | hash ${show(e.hash?.loc)} expected ${e.hash?.expected?.length}`,
        );
    }
}
