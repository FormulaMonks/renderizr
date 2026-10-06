/**
 * The router (ADR 8): every edge of a view routed in one synchronous pass,
 * in full, with no time budget (spec 10.12). First each edge's sides are
 * chosen, each self-relationship's corner too, and the edge ends sharing a
 * side are spread (spec 10.4, 10.7); then each edge is routed in its routing
 * mode, around elements when it has no vertices (spec 10.2, ADR 7) and
 * through them when it has (spec 10.3); each end is moved onto the drawn
 * outline (spec 10.5); self-relationships become loops (spec 10.7); and
 * jump-overs go in last, once every route is known (spec 10.11). The line
 * is written ending short of its target end, where the arrowhead takes over
 * (spec 10.10).
 *
 * Pure: elements and edges in, routes out, so the layout editor can rerun it
 * when something moves.
 */

import type { Point, Rect, ShapeGeometry, Side } from "../shapes/types";
import {
    directRoute,
    isStraightClear,
    obstaclePadding,
    obstaclesFor,
    orthogonalRoute,
    orthogonalThrough,
} from "./avoid";
import { type Cubic, cubicRoute, curvedRoute, curvePath } from "./curve";
import { jumpOversOf, jumpPath, jumpRadius } from "./jumps";
import { type Corner, cornerEnd, loopCorner, selfLoop } from "./loops";
import {
    centerOf,
    type DrawnRoute,
    endHeading,
    onOutline,
    polylinePath,
    type RoutingMode,
    SIDES,
    sidePoint,
} from "./path";
import {
    chooseSides,
    type EdgeEnd,
    type EdgeSides,
    facingSide,
    spreadEnds,
} from "./sides";

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
    /**
     * The line's thickness: obstacles are padded by it, jump-overs sized by
     * it, and the line ends this far short of its target end.
     */
    thickness: number;
};

/**
 * One edge routed: its points, both ends on the drawn outline; its path data
 * as drawn, jump-overs included, ending `thickness` short of the target end
 * so that an arrowhead as wide as it is long covers the line's butt end; and
 * its heading there.
 */
export type RoutedEdge = DrawnRoute & {
    key: string;
    /** The unit vector along the route's last segment, toward the target. */
    heading: Point;
};

/**
 * A route before its path data is written. A curve carries its cubic
 * pieces; a polyline is written from its points, with any jump-overs.
 */
type RouteDraft = { route: Point[]; cubics?: Cubic[] };

/** A self-relationship's place on its element: its corner and its nest. */
type Loop = { corner: Corner; nest: number };

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

/** The ids an edge's two ends go by in `spreadEnds`. */
const sourceEnd = (index: number) => `${index}:source`;
const targetEnd = (index: number) => `${index}:target`;

/** Route every edge of a view, returned in the order given. */
export function routeView(
    elements: RoutingElement[],
    edges: RoutingEdge[],
): RoutedEdge[] {
    const byId = new Map(elements.map((element) => [element.id, element]));
    const elementsOf = (edge: RoutingEdge) => {
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

    const sides = new Map<number, EdgeSides>();
    const edgeEndsOn = new Map<string, EdgeEnd[]>();
    const addEnd = (elementId: string, end: EdgeEnd) =>
        edgeEndsOn.set(elementId, [...(edgeEndsOn.get(elementId) ?? []), end]);
    for (const [index, edge] of edges.entries()) {
        const { source, target } = elementsOf(edge);
        if (source === target) continue;
        const from = boxOf(source);
        const to = boxOf(target);
        const { vertices } = edge;
        const others = elements
            .filter((element) => element !== source && element !== target)
            .map(boxOf);
        const padding = obstaclePadding(edge.thickness);
        const chosen = vertices.length
            ? {
                  source: facingSide(from, vertices[0]),
                  target: facingSide(to, vertices[vertices.length - 1]),
              }
            : chooseSides(from, to, edge.routing, (a, b) =>
                  isStraightClear(a, b, others, [from, to], padding),
              );
        sides.set(index, chosen);
        addEnd(source.id, {
            id: sourceEnd(index),
            side: chosen.source,
            far: vertices[0] ?? centerOf(to),
            order: index,
            routed: vertices.length > 0,
        });
        addEnd(target.id, {
            id: targetEnd(index),
            side: chosen.target,
            far: vertices[vertices.length - 1] ?? centerOf(from),
            order: index,
            routed: vertices.length > 0,
        });
    }

    /* ---------------- loop corners */

    // Every loop on an element takes the corner with the fewest of its other
    // edge ends, counted before any loop's own ends join them, so that the
    // loops share it and nest (spec 10.7).
    const loops = new Map<number, Loop>();
    const corners = new Map<string, Corner>();
    const nests = new Map<string, number>();
    for (const [index, edge] of edges.entries()) {
        const { source, target } = elementsOf(edge);
        if (source !== target) continue;
        let corner = corners.get(source.id);
        if (!corner) {
            const endCounts = Object.fromEntries(
                SIDES.map((side) => [side, 0]),
            ) as Record<Side, number>;
            for (const end of edgeEndsOn.get(source.id) ?? []) {
                endCounts[end.side]++;
            }
            corner = loopCorner(endCounts);
            corners.set(source.id, corner);
        }
        const nest = nests.get(source.id) ?? 0;
        nests.set(source.id, nest + 1);
        loops.set(index, { corner, nest });
        // A loop's far end is its own element; `toward` places it instead.
        const far = centerOf(boxOf(source));
        const [leave, enter] = corner;
        addEnd(source.id, {
            id: sourceEnd(index),
            side: leave,
            far,
            order: index,
            toward: cornerEnd(leave, corner),
        });
        addEnd(source.id, {
            id: targetEnd(index),
            side: enter,
            far,
            order: index,
            toward: cornerEnd(enter, corner),
        });
    }

    /* ---------------- spreading */

    const along = new Map<string, number>();
    for (const element of elements) {
        const spread = spreadEnds(
            edgeEndsOn.get(element.id) ?? [],
            element.geometry.spans,
            boxOf(element),
        );
        for (const [id, position] of spread) along.set(id, position);
    }
    const sourceAlong = (index: number) => along.get(sourceEnd(index)) ?? 0;
    const targetAlong = (index: number) => along.get(targetEnd(index)) ?? 0;

    /* ---------------- routes */

    const drafts = edges.map((edge, index): RouteDraft => {
        const { source, target } = elementsOf(edge);
        const loop = loops.get(index);
        if (loop) {
            return loopOf(
                source,
                edge.routing,
                loop,
                sourceAlong(index),
                targetAlong(index),
            );
        }
        return routeOf(
            edge,
            source,
            target,
            // Every edge that is not a loop had its sides chosen above.
            sides.get(index)!,
            sourceAlong(index),
            targetAlong(index),
            elements,
        );
    });

    /* ---------------- jump-overs */

    const jumps = (edge: RoutingEdge) => edge.jump && edge.routing !== "Curved";
    return edges.map((edge, index) => {
        const { route, cubics } = drafts[index];
        const { key, thickness } = edge;
        const heading = endHeading(route);
        const end = route[route.length - 1];
        const lineEnd = {
            x: end.x - heading.x * thickness,
            y: end.y - heading.y * thickness,
        };
        if (cubics) {
            const last = cubics[cubics.length - 1];
            const path = curvePath([
                ...cubics.slice(0, -1),
                { ...last, to: lineEnd },
            ]);
            return { key, route, heading, path };
        }
        const line = [...route.slice(0, -1), lineEnd];
        if (!jumps(edge)) {
            return { key, route, heading, path: polylinePath(line) };
        }
        // Of two edges that both jump, the later draws the jump-over; an
        // edge that does not jump, Curved ones included, is always jumped.
        const others: Point[][] = [];
        for (const [other, { route: theirs }] of drafts.entries()) {
            if (other === index || (jumps(edges[other]) && other > index)) {
                continue;
            }
            others.push(theirs);
        }
        const radius = jumpRadius(thickness);
        return {
            key,
            route,
            heading,
            path: jumpPath(line, jumpOversOf(route, others, radius), radius),
        };
    });
}

/**
 * One edge between two different elements, ends on their outlines. A
 * Curved one carries its cubic pieces; any other is a polyline.
 */
function routeOf(
    edge: RoutingEdge,
    source: RoutingElement,
    target: RoutingElement,
    sides: EdgeSides,
    sourceAlong: number,
    targetAlong: number,
    elements: RoutingElement[],
): RouteDraft {
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
    points[0] = onOutline(source, source.geometry, sides.source, sourceAlong);
    points[points.length - 1] = onOutline(
        target,
        target.geometry,
        sides.target,
        targetAlong,
    );

    if (edge.routing !== "Curved") return { route: points };
    // The curve has to clear what the Direct route under it cleared: the
    // padded elements, not just the elements (spec 10.2).
    return curvedRoute(
        points,
        vertices.length ? [] : obstaclesFor(others, [start, end], padding),
    );
}

/**
 * A self-relationship's loop on `element`, round its corner at its nest,
 * between the two edge ends spreading placed on the corner's sides.
 */
function loopOf(
    element: RoutingElement,
    mode: RoutingMode,
    { corner, nest }: Loop,
    leaveAlong: number,
    enterAlong: number,
): RouteDraft {
    const points = selfLoop(
        boxOf(element),
        element.geometry,
        corner,
        leaveAlong,
        enterAlong,
        nest,
        mode,
    );
    if (mode !== "Curved") return { route: points };
    const [start, c1, c2, end] = points;
    return cubicRoute(start, c1, c2, end);
}
