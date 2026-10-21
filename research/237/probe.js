#! /usr/bin/env node
/**
 * Runs Renderizr's pinned Mermaid parser (`scripts/mermaid/parser.js`) and
 * its flowchart reader on small flowchart sources that carry edge ids,
 * edge metadata, `linkStyle` and classes, and prints what each layer holds:
 * FlowDB's raw edges, `getData()`'s edges and the model `readFlowchart`
 * returns, with its ignored-styling entries.
 *
 * Run it from the repo root: `node research/237/probe.js`.
 */

import { readFlowchart } from "../../scripts/mermaid/flowchart.js";
import { read } from "../../scripts/mermaid/parser.js";
import { Ignored } from "../../scripts/mermaid/warnings.js";

const SOURCES = {
    "edge ids and animate": `flowchart LR
  A e1@--> B
  B e2@--> C
  e1@{ animate: true }
  e2@{ animation: slow }`,
    "fast, curve and an unknown key": `flowchart LR
  A e1@--> B
  e1@{ animation: fast, curve: stepBefore, speed: 3 }`,
    "classDef animation on an edge": `flowchart LR
  A e1@--> B
  classDef animate stroke-dasharray: 9\\,5,stroke-dashoffset: 900,animation: dash 25s linear infinite;
  class e1 animate`,
    "declaration order vs. reading order": `flowchart TD
  C --> D
  A --> B
  B --> C
  linkStyle 1 stroke:red`,
    "chained and fanned edges": `flowchart LR
  A --> B & C --> D`,
    "id on a chain": `flowchart LR
  A e1@--> B e2@--> C`,
    "id on a fan": `flowchart LR
  A e1@--> B & C`,
    "duplicate id": `flowchart LR
  A e1@--> B
  B e1@--> C`,
    "metadata before the edge": `flowchart LR
  e1@{ animate: true }
  A e1@--> B`,
    "linkStyle animation": `flowchart LR
  A --> B
  linkStyle 0 stroke-dasharray: 9\\,5,animation: dash 5s linear infinite`,
    "an unknown speed": `flowchart LR
  A e1@--> B
  e1@{ animation: medium }`,
};

const pick = (edge, keys) =>
    Object.fromEntries(
        keys.filter((k) => edge[k] !== undefined).map((k) => [k, edge[k]]),
    );

for (const [name, source] of Object.entries(SOURCES)) {
    console.log(`\n## ${name}\n${source}\n`);
    let parsed;
    try {
        parsed = read(source);
    } catch (error) {
        console.log(`parse error: ${error.message.split("\n")[0]}`);
        continue;
    }
    const { db } = parsed;
    console.log("FlowDB edges:");
    for (const edge of db.getEdges())
        console.log(
            " ",
            JSON.stringify(
                pick(edge, [
                    "id",
                    "isUserDefinedId",
                    "start",
                    "end",
                    "animate",
                    "animation",
                    "interpolate",
                    "classes",
                    "style",
                ]),
            ),
        );
    console.log(
        "FlowDB vertices (insertion order):",
        [...db.vertices.keys()].join(", "),
    );
    console.log("getData() edges:");
    for (const edge of db.getData().edges)
        console.log(
            " ",
            JSON.stringify(
                pick(edge, [
                    "id",
                    "isUserDefinedId",
                    "start",
                    "end",
                    "animate",
                    "animation",
                    "curve",
                    "classes",
                    "cssCompiledStyles",
                    "style",
                ]),
            ),
        );
    const ignored = new Ignored();
    try {
        const model = readFlowchart(db, ignored);
        console.log(
            "readFlowchart nodes:",
            model.nodes.map((n) => n.id).join(", "),
        );
        console.log("readFlowchart edges:");
        for (const edge of model.edges) console.log(" ", JSON.stringify(edge));
    } catch (error) {
        console.log(`readFlowchart throws: ${error.message}`);
    }
    console.log("ignored-styling warning:", ignored.warning("flow") ?? "none");
}
