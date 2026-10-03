/**
 * Automatic layout: Dagre in compound mode behind one function from a
 * compound graph and settings to boxes and edges (spec 7.1, ADR 4). This is
 * the only module that knows which library lays a view out, so a swap stays
 * a one-file change.
 *
 * It does what the JointJS `DirectedGraph` adapter in today's renderer does:
 * one `setParent` per boundary, the view's rank direction and separations
 * mapped one to one, edges of zero size, and each route simplified at 0.001
 * with its end points dropped before it is kept as vertices. Dagre places
 * elements only. Its cluster boxes are discarded and every boundary is
 * derived from its children afterwards (spec 8, ADR 9).
 */

import dagre from "@dagrejs/dagre";

import type { AutomaticLayoutSettings } from "../../model/index";
import type { Bounds } from "../geometry/bounds";

export type Point = { x: number; y: number };

/** An element Dagre places, at its drawn size, inside its boundary if any. */
export type LayoutNode = {
    id: string;
    width: number;
    height: number;
    /** The boundary drawn directly around it. */
    parent?: string;
};

/** A boundary: Dagre keeps its children together but never sizes it. */
export type LayoutCluster = { id: string; parent?: string };

export type LayoutEdge = { id: string; source: string; target: string };

/** Elements, the boundaries they nest in and the edges between elements. */
export type CompoundGraph = {
    nodes: LayoutNode[];
    clusters: LayoutCluster[];
    edges: LayoutEdge[];
};

export type LayoutSettings = Pick<
    AutomaticLayoutSettings,
    | "rankDirection"
    | "rankSeparation"
    | "nodeSeparation"
    | "edgeSeparation"
    | "vertices"
>;

export type Layout = {
    /** Each element's top-left and size, by id. */
    boxes: Map<string, Bounds>;
    /** Each edge's vertices by id, in order from source to target. */
    edges: Map<string, Point[]>;
};

/** The view's rank direction as Dagre spells it. */
const RANK_DIRECTION = {
    TopBottom: "TB",
    BottomTop: "BT",
    LeftRight: "LR",
    RightLeft: "RL",
} as const;

/** How far off the line a bend must be to survive (JointJS's threshold). */
const COLLINEAR_THRESHOLD = 0.001;

/**
 * Lay out `graph` with Dagre. An edge that names a cluster at either end is
 * left out: Dagre throws on one (`Cannot set properties of undefined
 * (setting 'rank')`), which is how today's renderer loses Big Bank's whole
 * Live deployment layout (spec 10.6).
 */
export function layOut(graph: CompoundGraph, settings: LayoutSettings): Layout {
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

    for (const cluster of graph.clusters) g.setNode(cluster.id, {});
    for (const node of graph.nodes)
        g.setNode(node.id, { width: node.width, height: node.height });
    for (const cluster of graph.clusters)
        if (cluster.parent) g.setParent(cluster.id, cluster.parent);
    for (const node of graph.nodes)
        if (node.parent) g.setParent(node.id, node.parent);

    const leaves = new Set(graph.nodes.map((n) => n.id));
    const edges = graph.edges.filter(
        (e) => leaves.has(e.source) && leaves.has(e.target),
    );
    for (const edge of edges)
        g.setEdge(
            edge.source,
            edge.target,
            {
                minlen: 1,
                weight: 1,
                labelpos: "c",
                labeloffset: 0,
                width: 0,
                height: 0,
            },
            edge.id,
        );

    dagre.layout(g);

    const boxes = new Map<string, Bounds>();
    for (const node of graph.nodes) {
        // Dagre gives centers; the view stores top-left corners (spec 7.1).
        const placed = g.node(node.id);
        boxes.set(node.id, {
            x: placed.x - node.width / 2,
            y: placed.y - node.height / 2,
            width: node.width,
            height: node.height,
        });
    }

    const routes = new Map<string, Point[]>();
    for (const edge of edges) {
        const points = g.edge(edge.source, edge.target, edge.id).points ?? [];
        routes.set(
            edge.id,
            settings.vertices
                ? simplify(points, COLLINEAR_THRESHOLD)
                      .slice(1, -1)
                      .map(({ x, y }) => ({ x, y }))
                : [],
        );
    }
    return { boxes, edges: routes };
}

/**
 * Drop each point closer than `threshold` to the line through the last point
 * kept and the next one, so a straight run carries no vertices.
 */
export function simplify(points: Point[], threshold: number): Point[] {
    if (points.length < 3) return points;
    const kept = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const a = kept[kept.length - 1];
        const b = points[i];
        const c = points[i + 1];
        const length = Math.hypot(c.x - a.x, c.y - a.y);
        const distance =
            length === 0
                ? Math.hypot(b.x - a.x, b.y - a.y)
                : Math.abs(
                      (c.x - a.x) * (a.y - b.y) - (a.x - b.x) * (c.y - a.y),
                  ) / length;
        if (distance > threshold) kept.push(b);
    }
    kept.push(points[points.length - 1]);
    return kept;
}
