// ELK adapter: elk.layered with hierarchyHandling INCLUDE_CHILDREN, the five Structurizr
// automaticLayout settings mapped onto ELK options, and the renderer's 50px cluster padding.
//
// Mapping used here:
//   rankDirection   -> elk.direction (DOWN | UP | RIGHT | LEFT)
//   rankSeparation  -> elk.layered.spacing.nodeNodeBetweenLayers (+ edgeNodeBetweenLayers, edgeEdgeBetweenLayers)
//   nodeSeparation  -> elk.spacing.nodeNode
//   edgeSeparation  -> elk.spacing.edgeEdge and elk.spacing.edgeNode
//   vertices        -> keep or drop the bendPoints ELK returns on each edge section
import ELK from "elkjs/lib/elk.bundled.js";

export const ELK_DIRECTION = {
    TopBottom: "DOWN",
    BottomTop: "UP",
    LeftRight: "RIGHT",
    RightLeft: "LEFT",
};

export const CLUSTER_PADDING = 50;

let shared;
export function getElk() {
    if (!shared) shared = new ELK();
    return shared;
}

/**
 * @param graph from buildViewGraph
 * @param settings Structurizr automaticLayout
 * @param opts { hierarchyHandling?: "INCLUDE_CHILDREN" | "SEPARATE_CHILDREN", edgeRouting?: "POLYLINE" | "ORTHOGONAL" | "SPLINES", elk?: ELK }
 */
export async function layoutElk(graph, settings, opts = {}) {
    const elk = opts.elk ?? getElk();
    const hierarchyHandling = opts.hierarchyHandling ?? "INCLUDE_CHILDREN";
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const childrenOf = new Map();
    for (const n of graph.nodes) {
        const key = n.parent ?? "__root__";
        if (!childrenOf.has(key)) childrenOf.set(key, []);
        childrenOf.get(key).push(n);
    }
    const padding = `[top=${CLUSTER_PADDING},left=${CLUSTER_PADDING},bottom=${CLUSTER_PADDING},right=${CLUSTER_PADDING}]`;

    const toElkNode = (n) => {
        const kids = childrenOf.get(n.id) ?? [];
        const node = { id: n.id, labels: [{ text: n.label }] };
        if (kids.length) {
            node.children = kids.map(toElkNode);
            node.edges = [];
            node.layoutOptions = { "elk.padding": padding };
        } else {
            node.width = n.width;
            node.height = n.height;
        }
        return node;
    };

    const root = {
        id: "__root__",
        layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": ELK_DIRECTION[settings.rankDirection] ?? "DOWN",
            "elk.hierarchyHandling": hierarchyHandling,
            "elk.edgeRouting": opts.edgeRouting ?? "POLYLINE",
            "elk.layered.spacing.nodeNodeBetweenLayers": String(
                settings.rankSeparation,
            ),
            "elk.layered.spacing.edgeNodeBetweenLayers": String(
                settings.rankSeparation / 2,
            ),
            "elk.layered.spacing.edgeEdgeBetweenLayers": String(
                settings.edgeSeparation,
            ),
            "elk.spacing.nodeNode": String(settings.nodeSeparation),
            "elk.spacing.edgeEdge": String(settings.edgeSeparation),
            "elk.spacing.edgeNode": String(settings.edgeSeparation),
            "elk.spacing.componentComponent": String(settings.nodeSeparation),
            "elk.layered.mergeEdges": "false",
        },
        children: (childrenOf.get("__root__") ?? []).map(toElkNode),
        edges: [],
    };

    // ELK JSON wants each edge inside the lowest common ancestor of its endpoints.
    const ancestors = (id) => {
        const chain = [];
        let cur = byId.get(id);
        while (cur?.parent) {
            chain.push(cur.parent);
            cur = byId.get(cur.parent);
        }
        chain.push("__root__");
        return chain;
    };
    const elkNodes = new Map();
    const index = (node) => {
        elkNodes.set(node.id, node);
        for (const c of node.children ?? []) index(c);
    };
    index(root);
    for (const e of graph.edges) {
        const a = ancestors(e.source);
        const b = new Set(ancestors(e.target));
        const lca = a.find((x) => b.has(x)) ?? "__root__";
        elkNodes
            .get(lca)
            .edges.push({ id: e.id, sources: [e.source], targets: [e.target] });
    }

    const laidOut = await elk.layout(root);

    // ELK coordinates are relative to the parent; flatten to absolute top-left boxes.
    const boxes = new Map();
    const absolute = new Map([["__root__", { x: 0, y: 0 }]]);
    const walk = (node, ox, oy) => {
        for (const c of node.children ?? []) {
            const x = ox + c.x;
            const y = oy + c.y;
            absolute.set(c.id, { x, y });
            const src = byId.get(c.id);
            boxes.set(c.id, {
                id: c.id,
                x,
                y,
                width: c.width,
                height: c.height,
                kind: src.kind,
                label: src.label,
                parent: src.parent,
            });
            walk(c, x, y);
        }
    };
    walk(laidOut, 0, 0);

    const edges = [];
    const collect = (node) => {
        const origin = absolute.get(node.id) ?? { x: 0, y: 0 };
        for (const e of node.edges ?? []) {
            const points = [];
            for (const s of e.sections ?? []) {
                points.push({
                    x: origin.x + s.startPoint.x,
                    y: origin.y + s.startPoint.y,
                });
                for (const b of s.bendPoints ?? [])
                    points.push({ x: origin.x + b.x, y: origin.y + b.y });
                points.push({
                    x: origin.x + s.endPoint.x,
                    y: origin.y + s.endPoint.y,
                });
            }
            edges.push({
                id: e.id,
                source: e.sources[0],
                target: e.targets[0],
                points,
                vertices: settings.vertices ? points.slice(1, -1) : [],
            });
        }
        for (const c of node.children ?? []) collect(c);
    };
    collect(laidOut);

    return {
        boxes,
        edges,
        size: { width: laidOut.width, height: laidOut.height },
    };
}
