/**
 * The router (ADR 8): every edge of a view routed in one synchronous pass,
 * in full, with no time budget (spec 10.12). First each edge's sides are
 * chosen and the edge ends sharing a side are spread (spec 10.4); then each
 * edge is routed in its routing mode, around elements when it has no
 * vertices (spec 10.2, ADR 7) and through them when it has (spec 10.3);
 * each end is moved onto the drawn outline (spec 10.5); self-relationships
 * become loops (spec 10.7); and jump-overs go in last, once every route is
 * known (spec 10.11).
 *
 * Pure: elements and edges in, routes out, so the layout editor can rerun it
 * when something moves.
 */

import { touch } from "../shapes/outline";
import type { Point, Rect, ShapeGeometry, Side } from "../shapes/types";
import {
    directRoute,
    obstaclePadding,
    orthogonalRoute,
    orthogonalThrough,
} from "./avoid";
import { cubicRoute, curvedRoute } from "./curve";
import { hopsOf, jumpPath, jumpRadius } from "./jumps";
import { loopCorner, selfLoop } from "./loops";
import {
    centerOf,
    polylinePath,
    type RoutingMode,
    SIDES,
    sidePoint,
} from "./path";
import { chooseSides, type EdgeEnd, facingSide, spreadEnds } from "./sides";

export type { RoutingMode };

/** An element edges are routed to and around. Boundaries are never one. */
export type RoutingElement = {
    id: string;
    /** Top-left, in model units. */
    x: number;
    y: number;
    /** The shape it is drawn as, which its edge ends touch. */
    geometry: ShapeGeometry;
};

/** One edge to route. Its source and target are among the view's elements. */
export type RoutingEdge = {
    key: string;
    sourceId: string;
    targetId: string;
    routing: RoutingMode;
    /** The relationship's stored vertices; any at all turn avoidance off. */
    vertices: Point[];
    jump: boolean;
    thickness: number;
};

export type RoutedEdge = {
    key: string;
    /**
     * The points the edge passes through, source end first and target end
     * last, both on the drawn outline. A Curved route is sampled along the
     * curve.
     */
    route: Point[];
    /** SVG path data for the edge as drawn, hops included. */
    path: string;
};

/** The routing mode a workspace names, Direct for anything unrecognized. */
export function routingModeOf(name: string | undefined): RoutingMode {
    return name === "Orthogonal" || name === "Curved" ? name : "Direct";
}

const boxOf = ({ x, y, geometry }: RoutingElement): Rect => ({
    x,
    y,
    width: geometry.width,
    height: geometry.height,
});

/** Where an edge end at `along` on `side` meets the drawn outline. */
const onOutline = (element: RoutingElement, side: Side, along: number) => {
    const local = touch(element.geometry, side, along);
    return { x: element.x + local.x, y: element.y + local.y };
};

/** The ids an edge's two ends go by in `spreadEnds`. */
const sourceEnd = (index: number) => `${index}:source`;
const targetEnd = (index: number) => `${index}:target`;

/** Route every edge of a view, returned in the order given. */
export function routeView(
    elements: RoutingElement[],
    edges: RoutingEdge[],
): RoutedEdge[] {
    const byId = new Map(elements.map((element) => [element.id, element]));
    const ends = (edge: RoutingEdge) => {
        const source = byId.get(edge.sourceId);
        const target = byId.get(edge.targetId);
        if (!source || !target) {
            throw new Error(
                `Edge ${edge.key} joins ${edge.sourceId} and ${edge.targetId}; expected both among the elements routed`,
            );
        }
        return { source, target };
    };

    /* ---------------- sides */

    const sides = new Map<number, { source: Side; target: Side }>();
    const endsOn = new Map<string, EdgeEnd[]>();
    const addEnd = (elementId: string, end: EdgeEnd) =>
        endsOn.set(elementId, [...(endsOn.get(elementId) ?? []), end]);
    for (const [index, edge] of edges.entries()) {
        const { source, target } = ends(edge);
        if (source === target) continue;
        const from = boxOf(source);
        const to = boxOf(target);
        const { vertices } = edge;
        const chosen = vertices.length
            ? {
                  source: facingSide(from, vertices[0]),
                  target: facingSide(to, vertices[vertices.length - 1]),
              }
            : chooseSides(from, to, edge.routing);
        sides.set(index, chosen);
        addEnd(source.id, {
            id: sourceEnd(index),
            side: chosen.source,
            far: vertices[0] ?? centerOf(to),
            order: index,
        });
        addEnd(target.id, {
            id: targetEnd(index),
            side: chosen.target,
            far: vertices[vertices.length - 1] ?? centerOf(from),
            order: index,
        });
    }

    /* ---------------- spreading */

    const along = new Map<string, number>();
    for (const element of elements) {
        const spread = spreadEnds(
            endsOn.get(element.id) ?? [],
            element.geometry.spans,
        );
        for (const [id, at] of spread) along.set(id, at);
    }

    /* ---------------- routes */

    const routed: { route: Point[]; path?: string }[] = [];
    const loops = new Map<string, number>();
    for (const [index, edge] of edges.entries()) {
        const { source, target } = ends(edge);
        const chosen = sides.get(index);
        if (!chosen) {
            const nest = loops.get(source.id) ?? 0;
            loops.set(source.id, nest + 1);
            routed.push(loopOf(source, edge.routing, nest, endsOn));
            continue;
        }
        routed.push(
            routeOf(
                edge,
                source,
                target,
                chosen,
                along.get(sourceEnd(index)) ?? 0,
                along.get(targetEnd(index)) ?? 0,
                elements,
            ),
        );
    }

    /* ---------------- jump-overs */

    const hops = (edge: RoutingEdge) => edge.jump && edge.routing !== "Curved";
    return edges.map((edge, index) => {
        const { route, path } = routed[index];
        if (path !== undefined) return { key: edge.key, route, path };
        if (!hops(edge))
            return { key: edge.key, route, path: polylinePath(route) };
        // The later of two jumping edges hops; an edge that does not jump,
        // Curved ones included, is always hopped over.
        const others: Point[][] = [];
        for (const [other, { route: theirs }] of routed.entries()) {
            if (other === index || (hops(edges[other]) && other > index)) {
                continue;
            }
            others.push(theirs);
        }
        const radius = jumpRadius(edge.thickness);
        return {
            key: edge.key,
            route,
            path: jumpPath(route, hopsOf(route, others, radius), radius),
        };
    });
}

/**
 * One edge between two different elements, ends on their outlines. Its
 * `path` is left for the jump-overs unless it is Curved.
 */
function routeOf(
    edge: RoutingEdge,
    source: RoutingElement,
    target: RoutingElement,
    sides: { source: Side; target: Side },
    sourceAlong: number,
    targetAlong: number,
    elements: RoutingElement[],
): { route: Point[]; path?: string } {
    const from = boxOf(source);
    const to = boxOf(target);
    const start = sidePoint(from, sides.source, sourceAlong);
    const end = sidePoint(to, sides.target, targetAlong);
    const others = elements
        .filter((element) => element !== source && element !== target)
        .map(boxOf);
    const padding = obstaclePadding(edge.thickness);
    const { vertices } = edge;

    let points: Point[];
    if (edge.routing === "Orthogonal") {
        points = vertices.length
            ? orthogonalThrough(
                  [start, ...vertices, end],
                  sides.source,
                  sides.target,
              )
            : orthogonalRoute(
                  start,
                  sides.source,
                  end,
                  sides.target,
                  others,
                  [from, to],
                  padding,
              );
    } else {
        points = vertices.length
            ? [start, ...vertices, end]
            : directRoute(start, end, others, [from, to], padding);
    }
    // Each end moves inward from the box, perpendicular to its side, onto
    // the drawn shape: the arrowhead's tip lands on what is drawn (spec 10.5).
    points[0] = onOutline(source, sides.source, sourceAlong);
    points[points.length - 1] = onOutline(target, sides.target, targetAlong);

    if (edge.routing !== "Curved") return { route: points };
    return curvedRoute(points, vertices.length ? [] : others);
}

/**
 * Loop number `nest` on `element`, round the corner with the fewest of its
 * other edge ends.
 */
function loopOf(
    element: RoutingElement,
    mode: RoutingMode,
    nest: number,
    endsOn: Map<string, EdgeEnd[]>,
): { route: Point[]; path?: string } {
    const counts = Object.fromEntries(SIDES.map((side) => [side, 0])) as Record<
        Side,
        number
    >;
    for (const end of endsOn.get(element.id) ?? []) counts[end.side]++;
    const points = selfLoop(
        boxOf(element),
        element.geometry,
        loopCorner(counts),
        nest,
        mode,
    );
    if (mode !== "Curved") return { route: points };
    const [start, c1, c2, end] = points;
    return cubicRoute(start, c1, c2, end);
}
