// Runs Dagre and ELK over the Big Bank views and prints quality + timing per view.
// Usage: node docs/research/compound-layout/bench.js [--workspace big-bank-plc.json] [--svg <dir>] [--runs 20]
// The Big Bank workspace is not committed; fetch it first:
//   curl -sSL -o docs/research/compound-layout/big-bank-plc.json https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
    bounds,
    containmentViolations,
    edgeCrossings,
    foreignBoundaryOverlaps,
    siblingOverlaps,
    toSvg,
} from "./geometry.js";
import { layoutDagre } from "./layout-dagre.js";
import { layoutElk } from "./layout-elk.js";
import { buildViewGraph, nestingDepth } from "./view-graph.js";

const here = new URL(".", import.meta.url).pathname;
const args = process.argv.slice(2);
const svgDir = args.includes("--svg")
    ? args[args.indexOf("--svg") + 1]
    : undefined;
const runs = args.includes("--runs")
    ? Number(args[args.indexOf("--runs") + 1])
    : 20;
const workspacePath = args.includes("--workspace")
    ? args[args.indexOf("--workspace") + 1]
    : join(here, "big-bank-plc.json");

const workspace = JSON.parse(readFileSync(workspacePath, "utf8"));

// structurizr-ui.js lines 8-12
const DEFAULTS = {
    rankDirection: "LeftRight",
    rankSeparation: 100,
    nodeSeparation: 50,
    edgeSeparation: 50,
    vertices: true,
};
const TOP_BOTTOM = { ...DEFAULTS, rankDirection: "TopBottom" };

// Big Bank has no groups; synthesise two inside the software-system boundary of the container view
// so boundary -> group -> element nesting gets exercised (ids from big-bank-plc.json).
const CONTAINER_GROUPS = {
    17: "Channels",
    18: "Channels",
    19: "Channels",
    20: "Backend",
    27: "Backend",
};

const cases = [
    { name: "LiveDeployment LR", view: "LiveDeployment", settings: DEFAULTS },
    { name: "LiveDeployment TB", view: "LiveDeployment", settings: TOP_BOTTOM },
    {
        name: "DevelopmentDeployment LR",
        view: "DevelopmentDeployment",
        settings: DEFAULTS,
    },
    { name: "Containers LR", view: "Containers", settings: DEFAULTS },
    {
        name: "Containers+groups LR",
        view: "Containers",
        settings: DEFAULTS,
        groups: CONTAINER_GROUPS,
    },
    {
        name: "Containers+groups TB",
        view: "Containers",
        settings: TOP_BOTTOM,
        groups: CONTAINER_GROUPS,
    },
];

const engines = [
    { name: "dagre", run: async (g, s) => layoutDagre(g, s) },
    {
        name: "dagre (no fit pass)",
        run: async (g, s) => layoutDagre(g, s, { fitToChildren: false }),
        quiet: true,
    },
    {
        name: "elk include",
        run: async (g, s) =>
            layoutElk(g, s, { hierarchyHandling: "INCLUDE_CHILDREN" }),
    },
    {
        name: "elk include ortho",
        run: async (g, s) =>
            layoutElk(g, s, {
                hierarchyHandling: "INCLUDE_CHILDREN",
                edgeRouting: "ORTHOGONAL",
            }),
        quiet: true,
    },
    {
        name: "elk separate",
        run: async (g, s) =>
            layoutElk(g, s, { hierarchyHandling: "SEPARATE_CHILDREN" }),
    },
];

function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

const rows = [];
if (svgDir) mkdirSync(svgDir, { recursive: true });

for (const c of cases) {
    const graph = buildViewGraph(workspace, c.view, { groups: c.groups });
    const leaves = graph.nodes.filter((n) => n.kind === "element").length;
    const boundaries = graph.nodes.length - leaves;
    console.log(
        `\n== ${c.name}: ${leaves} elements, ${boundaries} boundaries/groups, depth ${nestingDepth(graph)}, ${graph.edges.length} edges`,
    );
    for (const eng of engines) {
        const times = [];
        let result;
        const t0 = performance.now();
        result = await eng.run(graph, c.settings);
        const first = performance.now() - t0;
        for (let i = 0; i < runs; i++) {
            const t = performance.now();
            result = await eng.run(graph, c.settings);
            times.push(performance.now() - t);
        }
        const bb = bounds(result.boxes);
        const row = {
            case: c.name,
            engine: eng.name,
            first_ms: first.toFixed(1),
            median_ms: median(times).toFixed(2),
            size: `${Math.round(bb.width)}x${Math.round(bb.height)}`,
            escapes: containmentViolations(result.boxes).length,
            overlaps: siblingOverlaps(result.boxes).length,
            foreign: foreignBoundaryOverlaps(result.boxes).length,
            crossings: edgeCrossings(result.edges, result.boxes),
            bends: result.edges.reduce((n, e) => n + e.vertices.length, 0),
        };
        rows.push(row);
        if (!eng.quiet || row.escapes || row.overlaps || row.foreign) {
            console.log(
                `${eng.name.padEnd(20)} first ${row.first_ms.padStart(7)}ms  median ${row.median_ms.padStart(6)}ms  bbox ${row.size.padEnd(10)} escapes ${row.escapes}  sibling-overlaps ${row.overlaps}  foreign-boundary ${row.foreign}  crossings ${row.crossings}  bends ${row.bends}`,
            );
            for (const v of containmentViolations(result.boxes))
                console.log(`    escape: ${v}`);
            for (const v of siblingOverlaps(result.boxes))
                console.log(`    overlap: ${v}`);
            for (const v of foreignBoundaryOverlaps(result.boxes))
                console.log(`    foreign: ${v}`);
        }
        if (svgDir) {
            const file = `${c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}--${eng.name.replace(/[^a-z0-9]+/gi, "-")}.svg`;
            writeFileSync(
                join(svgDir, file),
                toSvg(result, `${c.name} / ${eng.name}`),
            );
        }
    }
}

console.log(
    "\n| case | engine | first ms | median ms | bbox | escapes | sibling overlaps | foreign boundary | crossings | bends |",
);
console.log("|---|---|---:|---:|---|---:|---:|---:|---:|---:|");
for (const r of rows) {
    console.log(
        `| ${r.case} | ${r.engine} | ${r.first_ms} | ${r.median_ms} | ${r.size} | ${r.escapes} | ${r.overlaps} | ${r.foreign} | ${r.crossings} | ${r.bends} |`,
    );
}
