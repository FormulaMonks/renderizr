/**
 * Automatic layout: Dagre in compound mode behind one function from a
 * compound graph and settings to boxes and edges (spec 7.1, ADR 4). This is
 * the only module that knows which library lays a view out, so a swap stays
 * a one-file change.
 *
 * It hands Dagre the graph today's renderer hands it through JointJS's
 * `DirectedGraph` adapter, so automatic layouts keep their look: one
 * `setParent` per boundary, nodes in the order upstream's cells are in, the
 * view's rank direction and separations mapped one to one, each edge's
 * label at the size upstream gives it, and each route's points kept as
 * vertices once the collinear ones and the two ends are dropped. The code
 * is written here, not copied from the adapter. Dagre places elements only;
 * the boxes it computes for boundaries are discarded and every boundary is
 * derived from its children afterwards (spec 8, ADR 9). A view of more than
 * `LARGE_VIEW_ELEMENTS` elements is ranked by tight-tree rather than
 * network simplex, which stops scaling there (ADR 14).
 */

import dagre from "@dagrejs/dagre";

import type { AutomaticLayoutSettings } from "../../model/index";
import type { Bounds, Size } from "../geometry/bounds";
import type { Point } from "../geometry/shapes/types";

export type { Point };

/** An element Dagre places, at its drawn size, inside its boundary if any. */
export type LayoutNode = {
    id: string;
    width: number;
    height: number;
    /** The boundary drawn directly around it. */
    parent?: string;
};

/** A boundary: Dagre keeps its children together but never sizes it. */
export type LayoutBoundary = {
    id: string;
    parent?: string;
    /**
     * Drawn behind everything else, as upstream draws a deployment node,
     * which puts it first among the cells upstream hands Dagre.
     */
    behind?: boolean;
};

export type LayoutEdge = {
    id: string;
    source: string;
    target: string;
    /**
     * The room Dagre keeps for the edge's label, on a rank of its own
     * between the two ends; none when absent.
     */
    label?: Size;
};

/** Elements, the boundaries they nest in and the edges between elements. */
export type CompoundGraph = {
    nodes: LayoutNode[];
    boundaries: LayoutBoundary[];
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

/**
 * How far off the line through its neighbors a point must be to stay a
 * vertex: the threshold today's renderer simplifies Dagre's routes with.
 */
const COLLINEAR_THRESHOLD = 0.001;

/**
 * The most elements a view can have and still be ranked by network simplex,
 * Dagre's default and upstream's ranker (ADR 14). Up to here it ranks a
 * grouped view in a fraction of a second; past about 125 elements its time
 * grows without bound, so a larger view is ranked by tight-tree instead.
 */
export const LARGE_VIEW_ELEMENTS = 100;

/**
 * The Dagre ranker for `graph`: network simplex, as upstream ranks every
 * view, unless the view has more than `LARGE_VIEW_ELEMENTS` elements.
 * Boundaries do not count.
 */
export function rankerFor(
    graph: CompoundGraph,
): "network-simplex" | "tight-tree" {
    return graph.nodes.length > LARGE_VIEW_ELEMENTS
        ? "tight-tree"
        : "network-simplex";
}

/**
 * Every boundary and element id of `graph` in the order upstream's cells
 * reach Dagre: each outermost one where its first element appears, then
 * everything inside it, breadth first, each level in order of appearance.
 * Upstream makes the boundaries drawn behind (deployment nodes) in a pass of
 * their own, in the order given: each is sent to the back as it is made, so
 * outermost ones come first with the last made first, and nested ones come
 * after whatever else their boundary holds. Dagre breaks ties by the order
 * it is given, which decides, among other things, which way a pair of
 * relationships running both ways points.
 */
export function layoutOrder(graph: CompoundGraph): string[] {
    const parent = new Map<string, string | undefined>();
    for (const boundary of graph.boundaries)
        parent.set(boundary.id, boundary.parent);
    for (const node of graph.nodes) parent.set(node.id, node.parent);

    /** Each one's children in order of appearance; "" holds the outermost. */
    const children = new Map<string, string[]>();
    const seen = new Set<string>();
    const appear = (id: string) => {
        if (seen.has(id)) return;
        const around = parent.get(id);
        if (around !== undefined) appear(around);
        seen.add(id);
        const siblings = children.get(around ?? "") ?? [];
        children.set(around ?? "", [...siblings, id]);
    };
    for (const node of graph.nodes) appear(node.id);
    for (const boundary of graph.boundaries) appear(boundary.id);

    const made = graph.boundaries.filter((b) => b.behind).map((b) => b.id);
    const behind = (ids: string[]) => made.filter((id) => ids.includes(id));
    const rest = (ids: string[]) => ids.filter((id) => !made.includes(id));
    const inside = (id: string) => {
        const ids = children.get(id) ?? [];
        return [...rest(ids), ...behind(ids)];
    };
    const outermost = children.get("") ?? [];

    const order: string[] = [];
    for (const top of [...behind(outermost).reverse(), ...rest(outermost)]) {
        order.push(top);
        const queue = inside(top);
        for (const id of queue) {
            order.push(id);
            queue.push(...inside(id));
        }
    }
    return order;
}

/**
 * The key an id goes by inside Dagre. Graphlib keeps its nodes in an object,
 * which lists integer-like keys first and in numeric order. Structurizr's
 * element ids are integers and upstream's cell ids are not, so a bare id
 * would reach Dagre in another order than upstream's.
 */
const keyOf = (id: string) => `#${id}`;

/**
 * Lay out `graph` with Dagre. An edge that names a boundary at either end is
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
        ranker: rankerFor(graph),
        marginx: 0,
        marginy: 0,
    });
    g.setDefaultEdgeLabel(() => ({}));

    const leaves = new Map(graph.nodes.map((node) => [node.id, node]));
    const parent = new Map<string, string | undefined>();
    for (const boundary of graph.boundaries)
        parent.set(boundary.id, boundary.parent);
    for (const node of graph.nodes) parent.set(node.id, node.parent);
    for (const id of layoutOrder(graph)) {
        const leaf = leaves.get(id);
        g.setNode(
            keyOf(id),
            leaf ? { width: leaf.width, height: leaf.height } : {},
        );
        const around = parent.get(id);
        if (around) g.setParent(keyOf(id), keyOf(around));
    }

    const edges = graph.edges.filter(
        (e) => leaves.has(e.source) && leaves.has(e.target),
    );
    for (const edge of edges)
        g.setEdge(
            keyOf(edge.source),
            keyOf(edge.target),
            {
                minlen: 1,
                weight: 1,
                labelpos: "c",
                labeloffset: 0,
                width: edge.label?.width ?? 0,
                height: edge.label?.height ?? 0,
            },
            edge.id,
        );

    dagre.layout(g);

    const boxes = new Map<string, Bounds>();
    for (const node of graph.nodes) {
        // Dagre gives centers; the view stores top-left corners (spec 7.1).
        const placed = g.node(keyOf(node.id));
        boxes.set(node.id, {
            x: placed.x - node.width / 2,
            y: placed.y - node.height / 2,
            width: node.width,
            height: node.height,
        });
    }

    const routes = new Map<string, Point[]>();
    for (const edge of edges) {
        const { points = [] } = g.edge(
            keyOf(edge.source),
            keyOf(edge.target),
            edge.id,
        );
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
