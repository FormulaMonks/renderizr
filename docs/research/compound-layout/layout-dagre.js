// Dagre adapter. Mirrors what @joint/layout-directed-graph does in the vendored renderer
// (vendor/structurizr/js/structurizr-diagram.js applyAutomaticLayout):
//   - compound graphlib graph, setParent() for embedded cells,
//   - graph label { rankdir, ranksep, nodesep, edgesep, marginx: 0, marginy: 0 },
//   - edges { minlen: 1, weight: 1, labelpos: "c", width: 0, height: 0 },
//   - after layout, JointJS's `fitToChildren({ padding: 50, deep: true })` resizes every
//     boundary to its children's bounding box plus padding (clusterPadding = 50).
import dagre from "@dagrejs/dagre";

export const RANK_DIRECTION = {
    TopBottom: "TB",
    BottomTop: "BT",
    LeftRight: "LR",
    RightLeft: "RL",
};

export const CLUSTER_PADDING = 50;

/**
 * @param graph from buildViewGraph
 * @param settings Structurizr automaticLayout: rankDirection, rankSeparation, nodeSeparation, edgeSeparation, vertices
 * @param opts { fitToChildren?: boolean } apply the JointJS post-pass (default true, as the renderer does)
 */
export function layoutDagre(graph, settings, opts = {}) {
    const g = new dagre.graphlib.Graph({
        compound: true,
        multigraph: true,
        directed: true,
    });
    g.setGraph({
        rankdir: RANK_DIRECTION[settings.rankDirection] ?? "TB",
        ranksep: settings.rankSeparation,
        nodesep: settings.nodeSeparation,
        edgesep: settings.edgeSeparation,
        marginx: 0,
        marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of graph.nodes)
        g.setNode(n.id, { width: n.width, height: n.height });
    for (const n of graph.nodes) if (n.parent) g.setParent(n.id, n.parent);

    // Dagre throws (rank/util.js "Cannot set properties of undefined (setting 'rank')") when an
    // edge starts or ends at a compound node. Big Bank's Live deployment view has one such edge
    // (Oracle Primary -> Oracle Secondary, "Replicates data to"). Strategies:
    //   "throw"    — do what the renderer does today (the exception is caught upstream, layout is lost)
    //   "skip"     — leave the edge out of the layout, draw it centre to centre afterwards
    //   "redirect" — attach the edge to an invisible 1x1 dummy node inside the compound node
    const clusterEdges = opts.clusterEdges ?? "redirect";
    const hasChildren = new Set(
        graph.nodes.filter((n) => n.parent).map((n) => n.parent),
    );
    const skipped = [];
    const endpointFor = (id) => {
        if (!hasChildren.has(id) || clusterEdges === "throw") return id;
        const dummy = `${id}__anchor`;
        if (!g.hasNode(dummy)) {
            g.setNode(dummy, { width: 1, height: 1 });
            g.setParent(dummy, id);
        }
        return dummy;
    };
    for (const e of graph.edges) {
        if (
            clusterEdges === "skip" &&
            (hasChildren.has(e.source) || hasChildren.has(e.target))
        ) {
            skipped.push(e);
            continue;
        }
        g.setEdge(
            endpointFor(e.source),
            endpointFor(e.target),
            {
                minlen: 1,
                weight: 1,
                labelpos: "c",
                labeloffset: 0,
                width: 0,
                height: 0,
            },
            e.id,
        );
    }

    dagre.layout(g);

    // Dagre reports centre coordinates; convert to top-left boxes like importElement does.
    const boxes = new Map();
    for (const n of graph.nodes) {
        const d = g.node(n.id);
        boxes.set(n.id, {
            id: n.id,
            x: d.x - d.width / 2,
            y: d.y - d.height / 2,
            width: d.width,
            height: d.height,
            kind: n.kind,
            label: n.label,
            parent: n.parent,
        });
    }
    const dagreBoxes = new Map([...boxes].map(([k, v]) => [k, { ...v }]));

    if (opts.fitToChildren !== false)
        fitToChildren(boxes, graph, CLUSTER_PADDING);

    const edges = graph.edges.map((e) => {
        if (skipped.includes(e))
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                points: [],
                vertices: [],
            };
        const d = g.edge(endpointFor(e.source), endpointFor(e.target), e.id);
        // JointJS runs g.Polyline#simplify({ threshold: 0.001 }) — drops near-collinear points — then
        // drops the first and last point (connection points) and keeps the rest as vertices.
        const points = simplify(d.points ?? [], 0.001);
        return {
            id: e.id,
            source: e.source,
            target: e.target,
            points,
            vertices: settings.vertices ? points.slice(1, -1) : [],
        };
    });

    const gl = g.graph();
    return {
        boxes,
        dagreBoxes,
        edges,
        size: { width: gl.width, height: gl.height },
    };
}

/** Drop points whose distance from the line through their neighbours is below `threshold` (JointJS Polyline#simplify). */
function simplify(points, threshold) {
    if (points.length < 3) return points;
    const out = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const a = out[out.length - 1];
        const b = points[i];
        const c = points[i + 1];
        const len = Math.hypot(c.x - a.x, c.y - a.y);
        const dist =
            len === 0
                ? Math.hypot(b.x - a.x, b.y - a.y)
                : Math.abs(
                      (c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y),
                  ) / len;
        if (dist > threshold) out.push(b);
    }
    out.push(points[points.length - 1]);
    return out;
}

/** JointJS `fitToChildren({ deep: true, padding })`: deepest boundaries first, each grows to its children + padding. */
export function fitToChildren(boxes, graph, padding) {
    const children = new Map();
    for (const n of graph.nodes) {
        if (!n.parent) continue;
        if (!children.has(n.parent)) children.set(n.parent, []);
        children.get(n.parent).push(n.id);
    }
    const depth = (id) => {
        let d = 0;
        let cur = graph.nodes.find((n) => n.id === id);
        while (cur?.parent) {
            d++;
            cur = graph.nodes.find((n) => n.id === cur.parent);
        }
        return d;
    };
    const parents = [...children.keys()].sort((a, b) => depth(b) - depth(a));
    for (const p of parents) {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const c of children.get(p)) {
            const b = boxes.get(c);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        }
        const box = boxes.get(p);
        box.x = minX - padding;
        box.y = minY - padding;
        box.width = maxX - minX + 2 * padding;
        box.height = maxY - minY + 2 * padding;
    }
}
