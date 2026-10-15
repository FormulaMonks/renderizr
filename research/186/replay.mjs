globalThis.structuredClone ??= (o) => JSON.parse(JSON.stringify(o));
import { createRequire } from "node:module";
const dagre = createRequire(import.meta.url)("@dagrejs/dagre");
import fs from "node:fs";
const all = JSON.parse(fs.readFileSync("captured-dagre.json", "utf8"));
for (const [name, c] of Object.entries(all)) {
    c.calls.forEach((k, i) => {
        const g = new dagre.graphlib.Graph({
            multigraph: true,
            compound: true,
        });
        g.setGraph({ ...k.before.graph });
        for (const n of k.before.nodes) {
            g.setNode(
                n.v,
                n.children ? {} : { width: n.width, height: n.height },
            );
        }
        for (const n of k.before.nodes)
            if (n.parent) g.setParent(n.v, n.parent);
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
        let same = 0;
        const diff = [];
        for (const n of k.after.nodes) {
            if (n.children) continue;
            const m = g.node(n.v);
            if (Math.abs(m.x - n.x) < 0.5 && Math.abs(m.y - n.y) < 0.5) same++;
            else
                diff.push(
                    `${n.v} mermaid(${Math.round(n.x)},${Math.round(n.y)}) dagre2(${Math.round(m.x)},${Math.round(m.y)})`,
                );
        }
        console.log(
            name,
            "call",
            i,
            "leaf nodes identical:",
            same,
            diff.length ? `differ: ${diff.join("; ")}` : "",
        );
    });
}
