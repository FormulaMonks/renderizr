globalThis.structuredClone ??= (o) => JSON.parse(JSON.stringify(o));
import { createRequire } from "node:module";
const dagre = createRequire(import.meta.url)("@dagrejs/dagre");
import fs from "node:fs";
const all = JSON.parse(fs.readFileSync("captured-dagre.json", "utf8"));
const svgOrder = (f) => {
    const s = fs.readFileSync(f, "utf8");
    const re =
        /<g class="node[^"]*"[^>]*id="d-flowchart-([^"]+?)-\d+"[^>]*transform="translate\(([-\d.]+),\s*([-\d.]+)\)"/g;
    return [...s.matchAll(re)].map((m) => [m[1], +m[2], +m[3]]);
};
const rankOf = (pairs, horiz) => {
    const vals = [
        ...new Set(pairs.map((p) => Math.round(horiz ? p[1] : p[2]))),
    ].sort((a, b) => a - b);
    return Object.fromEntries(
        pairs.map((p) => [p[0], vals.indexOf(Math.round(horiz ? p[1] : p[2]))]),
    );
};
for (const [name, c] of Object.entries(all)) {
    const horiz = /LR|RL/.test(
        c.calls[c.calls.length - 1].before.graph.rankdir,
    );
    const k = c.calls[c.calls.length - 1]; // outermost call is last for extracted graphs
    for (const mode of ["model order", "sources first"]) {
        const g = new dagre.graphlib.Graph({
            multigraph: true,
            compound: true,
        });
        g.setGraph({ ...k.before.graph });
        let nodes = k.before.nodes;
        if (mode === "sources first") {
            const leafIn = new Set(k.before.edges.map((e) => e.w));
            nodes = [
                ...nodes.filter((n) => !n.children && !leafIn.has(n.v)),
                ...nodes.filter((n) => n.children || leafIn.has(n.v)),
            ];
        }
        for (const n of nodes)
            g.setNode(
                n.v,
                n.children ? {} : { width: n.width, height: n.height },
            );
        for (const n of nodes) if (n.parent) g.setParent(n.v, n.parent);
        for (const e of k.before.edges)
            g.setEdge(
                e.v,
                e.w,
                {
                    minlen: e.minlen,
                    width: e.width,
                    height: e.height,
                    labelpos: e.labelpos,
                },
                e.name,
            );
        dagre.layout(g);
        const leaves = nodes
            .filter((n) => !n.children)
            .map((n) => [n.v, g.node(n.v).x, g.node(n.v).y]);
        const r = rankOf(leaves, horiz);
        console.log(
            name,
            mode.padEnd(13),
            Object.entries(r)
                .sort((a, b) => a[1] - b[1])
                .map(([v, i]) => `${i}:${v}`)
                .join(" "),
        );
    }
    const elk = svgOrder(`out-default-${name}.svg`);
    const r = rankOf(elk, horiz);
    console.log(
        name,
        "mermaid ELK  ",
        Object.entries(r)
            .sort((a, b) => a[1] - b[1])
            .map(([v, i]) => `${i}:${v}`)
            .join(" "),
    );
}
