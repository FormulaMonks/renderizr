// Third option, for a sentence in the write-up: Graphviz `dot` compiled to WebAssembly
// (@hpcc-js/wasm-graphviz). This is the engine Structurizr's own CLI/Lite autoLayout uses
// ("implementation": "Graphviz" in the view's automaticLayout), with clusters for boundaries.
// Usage: node docs/research/compound-layout/layout-graphviz.js [--workspace big-bank-plc.json]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Graphviz } from "@hpcc-js/wasm-graphviz";
import { buildViewGraph } from "./view-graph.js";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const workspacePath = args.includes("--workspace")
    ? args[args.indexOf("--workspace") + 1]
    : join(here, "big-bank-plc.json");
const workspace = JSON.parse(readFileSync(workspacePath, "utf8"));
const S = {
    rankDirection: "LeftRight",
    rankSeparation: 100,
    nodeSeparation: 50,
    edgeSeparation: 50,
};
const RANKDIR = {
    TopBottom: "TB",
    BottomTop: "BT",
    LeftRight: "LR",
    RightLeft: "RL",
};

function toDot(graph, settings) {
    const children = new Map();
    for (const n of graph.nodes) {
        const k = n.parent ?? "__root__";
        if (!children.has(k)) children.set(k, []);
        children.get(k).push(n);
    }
    const q = (s) => JSON.stringify(String(s));
    const emit = (parentId, indent) => {
        let out = "";
        for (const n of children.get(parentId) ?? []) {
            if (children.has(n.id)) {
                out += `${indent}subgraph ${q(`cluster_${n.id}`)} { label=${q(n.label)}; margin=50;\n${emit(n.id, `${indent}  `)}${indent}}\n`;
            } else {
                // Graphviz sizes are in inches at 72 dpi.
                out += `${indent}${q(n.id)} [shape=box, fixedsize=true, width=${n.width / 72}, height=${n.height / 72}];\n`;
            }
        }
        return out;
    };
    let dot = `digraph G {\n  rankdir=${RANKDIR[settings.rankDirection]}; ranksep=${settings.rankSeparation / 72}; nodesep=${settings.nodeSeparation / 72}; compound=true; splines=polyline;\n`;
    dot += emit("__root__", "  ");
    for (const e of graph.edges) {
        // Edges to a cluster need `compound=true` plus lhead/ltail on an edge between leaf proxies; skipped here.
        const hasChildren = children.has(e.source) || children.has(e.target);
        if (hasChildren) continue;
        dot += `  ${q(e.source)} -> ${q(e.target)};\n`;
    }
    return `${dot}}\n`;
}

const t0 = performance.now();
const graphviz = await Graphviz.load();
console.log(`Graphviz.load() ${(performance.now() - t0).toFixed(1)} ms`);

for (const view of ["LiveDeployment", "Containers"]) {
    const graph = buildViewGraph(workspace, view);
    const dot = toDot(graph, S);
    const times = [];
    let json;
    for (let i = 0; i < 20; i++) {
        const t = performance.now();
        json = graphviz.layout(dot, "json", "dot");
        times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const bb = JSON.parse(json).bb.split(",").map(Number);
    console.log(
        `${view}: first ${times[times.length - 1].toFixed(1)} ms, median ${times[Math.floor(times.length / 2)].toFixed(2)} ms, bbox ${Math.round(bb[2])}x${Math.round(bb[3])} pt`,
    );
}
