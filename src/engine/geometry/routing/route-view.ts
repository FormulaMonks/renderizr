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
 * A Mermaid edge carries `ends`, its End markers' fit (spec: End markers):
 * each end with a marker runs straight out of its side for its `room`
 * before the route may bend, side choice counts bends from there, no
 * jump-over sits on a straight end, and the line stops each end's `inset`
 * short of it. C4 edges carry none and route as they always have.
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
import { type JumpOver, jumpOversOf, jumpPath, jumpRadius } from "./jumps";
import { type Corner, cornerEnd, loopCorner, selfLoop } from "./loops";
import {
    centerOf,
    type DrawnRoute,
    distance,
    endHeading,
    isHorizontal,
    onOutline,
    outward,
    polylinePath,
    type RoutingMode,
    SIDES,
    sidePoint,
} from "./path";
import {
    chooseSides,
    type EdgeEnd,
    type EdgeRoom,
    type EdgeSides,
    facingSide,
    fitRoom,
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
    /** A Mermaid edge's: its ends spread evenly around their sides' middles. */
    centered?: boolean;
    /**
     * A Mermaid edge's: how each end fits its End marker. Without it the
     * source end takes no room and the line stops `thickness` short of the
     * target end, under the arrowhead.
     */
    ends?: { source: EndFit; target: EndFit };
};

/** How one end of an edge fits its End marker (spec: End markers). */
export type EndFit = {
    /** How far the end runs straight out of its side before it may bend. */
    room: number;
    /**
     * The marker's length, the least `room` shrinks to between two sides
     * that face each other close (`fitRoom`).
     */
    length: number;
    /** How far short of the end the line stops. */
    inset: number;
    /** The marker's width across the line, which spreading keeps apart. */
    width: number;
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

/** How far each end of `edge` runs straight before its route may bend. */
const roomOf = ({ ends }: RoutingEdge): EdgeRoom => ({
    source: ends?.source.room ?? 0,
    target: ends?.target.room ?? 0,
    ...(ends && {
        least: { source: ends.source.length, target: ends.target.length },
    }),
});

/** `point` moved `by` along the unit vector `direction`. */
const offset = (point: Point, direction: Point, by: number): Point => ({
    x: point.x + direction.x * by,
    y: point.y + direction.y * by,
});

/** A straight line as a cubic piece, so a curve can start or end with one. */
const straightCubic = (from: Point, to: Point): Cubic => ({
    from,
    c1: { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 },
    c2: {
        x: from.x + ((to.x - from.x) * 2) / 3,
        y: from.y + ((to.y - from.y) * 2) / 3,
    },
    to,
});

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
    // Each edge's straight ends, fitted to the sides it was given.
    const rooms = new Map<number, EdgeRoom>();
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
            : chooseSides(
                  from,
                  to,
                  edge.routing,
                  (a, b) => isStraightClear(a, b, others, [from, to], padding),
                  roomOf(edge),
              );
        sides.set(index, chosen);
        rooms.set(
            index,
            vertices.length
                ? roomOf(edge)
                : fitRoom(from, to, chosen, roomOf(edge)),
        );
        addEnd(source.id, {
            id: sourceEnd(index),
            side: chosen.source,
            far: vertices[0] ?? centerOf(to),
            order: index,
            routed: vertices.length > 0,
            ...(edge.centered && { centered: true }),
            ...(edge.ends && { apart: edge.ends.source.width }),
        });
        addEnd(target.id, {
            id: targetEnd(index),
            side: chosen.target,
            far: vertices[vertices.length - 1] ?? centerOf(from),
            order: index,
            routed: vertices.length > 0,
            ...(edge.centered && { centered: true }),
            ...(edge.ends && { apart: edge.ends.target.width }),
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
    alignFacingEnds(edges, sides, loops, edgeEndsOn, elementsOf, along);
    const roomAt = (index: number) => rooms.get(index) ?? roomOf(edges[index]);
    const sourceAlong = (index: number) => along.get(sourceEnd(index)) ?? 0;
    const targetAlong = (index: number) => along.get(targetEnd(index)) ?? 0;

    /* ---------------- routes */

    const draftOf = (index: number): RouteDraft => {
        const edge = edges[index];
        const { source, target } = elementsOf(edge);
        const loop = loops.get(index);
        if (loop) {
            return loopOf(
                source,
                edge.routing,
                loop,
                sourceAlong(index),
                targetAlong(index),
                roomOf(edge),
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
            roomAt(index),
        );
    };
    const drafts = edges.map((_, index) => draftOf(index));

    /* ---------------- shared lines */

    // Two Mermaid edges never run along the same line: where they do, one
    // end alone on its side moves along it, toward where its edge heads,
    // and the edge routes again; the move stays only when it parts the two
    // and joins its edge to no other.
    const separable = (index: number) =>
        edges[index].centered === true &&
        !loops.has(index) &&
        !edges[index].vertices.length;
    const sharesWithAny = (index: number) =>
        drafts.some(
            (other, j) =>
                j !== index &&
                separable(j) &&
                sharesRun(drafts[index].route, other.route),
        );
    const separate = (index: number, from: number): boolean => {
        const chosen = sides.get(index);
        if (!chosen) return false;
        const { source, target } = elementsOf(edges[index]);
        const ends = [
            {
                element: source,
                side: chosen.source,
                id: sourceEnd(index),
                far: target,
            },
            {
                element: target,
                side: chosen.target,
                id: targetEnd(index),
                far: source,
            },
        ];
        for (const end of ends) {
            const onSide = (edgeEndsOn.get(end.element.id) ?? []).filter(
                (e) => e.side === end.side,
            );
            const span = end.element.geometry.spans[end.side];
            if (onSide.length !== 1 || !span) continue;
            const was = along.get(end.id) ?? 0;
            const axis = isHorizontal(end.side) ? "x" : "y";
            const toward = Math.sign(
                centerOf(boxOf(end.far))[axis] -
                    centerOf(boxOf(end.element))[axis],
            );
            const moved = Math.min(
                span.to,
                Math.max(span.from, was + (toward || 1) * SHARED_LINE_STEP),
            );
            if (moved === was) continue;
            const before = drafts[index];
            along.set(end.id, moved);
            drafts[index] = draftOf(index);
            if (
                !sharesRun(drafts[index].route, drafts[from].route) &&
                !sharesWithAny(index)
            ) {
                return true;
            }
            along.set(end.id, was);
            drafts[index] = before;
        }
        return false;
    };
    for (const i of edges.keys()) {
        for (let j = i + 1; j < edges.length; j++) {
            if (!separable(i) || !separable(j)) continue;
            if (!sharesRun(drafts[i].route, drafts[j].route)) continue;
            if (!separate(j, i)) separate(i, j);
        }
    }

    /* ---------------- jump-overs */

    const jumps = (edge: RoutingEdge) => edge.jump && edge.routing !== "Curved";
    // Every straight end, as the segment it runs along: no jump-over sits
    // on one, whichever edge would draw it.
    const straightEnds: [Point, Point][] = [];
    for (const index of edges.keys()) {
        const { route } = drafts[index];
        const room = roomAt(index);
        if (room.source > 0) {
            const back = endHeading([...route].reverse());
            straightEnds.push([route[0], offset(route[0], back, -room.source)]);
        }
        if (room.target > 0) {
            const end = route[route.length - 1];
            straightEnds.push([
                end,
                offset(end, endHeading(route), -room.target),
            ]);
        }
    }
    return edges.map((edge, index) => {
        const { route, cubics } = drafts[index];
        const { key, thickness } = edge;
        const heading = endHeading(route);
        const end = route[route.length - 1];
        const lineEnd = offset(
            end,
            heading,
            -(edge.ends?.target.inset ?? thickness),
        );
        const startInset = edge.ends?.source.inset ?? 0;
        const lineStart = startInset
            ? offset(route[0], endHeading([...route].reverse()), -startInset)
            : route[0];
        if (cubics) {
            const pieces = [
                { ...cubics[0], from: lineStart },
                ...cubics.slice(1),
            ];
            const last = pieces[pieces.length - 1];
            const path = curvePath([
                ...pieces.slice(0, -1),
                { ...last, to: lineEnd },
            ]);
            return { key, route, heading, path };
        }
        const line = [lineStart, ...route.slice(1, -1), lineEnd];
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
        const room = roomAt(index);
        const jumpOvers = jumpOversOf(route, others, radius).filter(
            (jump) =>
                !onStraightEnd(jump, route, room, radius) &&
                !straightEnds.some(([a, b]) => isOnSegment(jump.at, a, b)),
        );
        return {
            key,
            route,
            heading,
            path: jumpPath(line, jumpOvers, radius),
        };
    });
}

/** How close a point counts as on a segment, in model units. */
const ON_SEGMENT = 1e-3;

/** Whether `point` lies on the segment from `a` to `b`. */
function isOnSegment(point: Point, a: Point, b: Point): boolean {
    const length = distance(a, b);
    if (!length) return distance(point, a) < ON_SEGMENT;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const dx = point.x - a.x;
    const dy = point.y - a.y;
    const t = dx * ux + dy * uy;
    return (
        Math.abs(dx * uy - dy * ux) < ON_SEGMENT &&
        t > -ON_SEGMENT &&
        t < length + ON_SEGMENT
    );
}

/**
 * Whether the jump-over `jump` on `route` would reach into one of the
 * route's own straight ends: its semicircle, `radius` either side of it,
 * comes within `room` of an end along the route.
 */
function onStraightEnd(
    { segment, at }: JumpOver,
    route: Point[],
    room: EdgeRoom,
    radius: number,
): boolean {
    if (!(room.source > 0 || room.target > 0)) return false;
    let before = distance(route[segment], at);
    for (let i = 0; i < segment; i++) {
        before += distance(route[i], route[i + 1]);
    }
    let total = 0;
    for (let i = 0; i + 1 < route.length; i++) {
        total += distance(route[i], route[i + 1]);
    }
    return (
        (room.source > 0 && before - radius < room.source) ||
        (room.target > 0 && total - before - radius < room.target)
    );
}

/** How far an end moves along its side to part two edges on one line. */
const SHARED_LINE_STEP = 30;

/** Whether two routes run along the same line for more than a point. */
function sharesRun(a: Point[], b: Point[]): boolean {
    const runs = (route: Point[]) =>
        route.slice(1).flatMap((end, i) => {
            const start = route[i];
            if (
                Math.abs(start.y - end.y) < 0.5 &&
                Math.abs(start.x - end.x) > 0.5
            ) {
                return [
                    {
                        horizontal: true,
                        at: start.y,
                        from: Math.min(start.x, end.x),
                        to: Math.max(start.x, end.x),
                    },
                ];
            }
            if (
                Math.abs(start.x - end.x) < 0.5 &&
                Math.abs(start.y - end.y) > 0.5
            ) {
                return [
                    {
                        horizontal: false,
                        at: start.x,
                        from: Math.min(start.y, end.y),
                        to: Math.max(start.y, end.y),
                    },
                ];
            }
            return [];
        });
    const theirs = runs(b);
    return runs(a).some((p) =>
        theirs.some(
            (q) =>
                p.horizontal === q.horizontal &&
                Math.abs(p.at - q.at) < 0.5 &&
                Math.min(p.to, q.to) - Math.max(p.from, q.from) > 0.5,
        ),
    );
}

/**
 * A Mermaid edge between facing sides runs straight where it can: when
 * one of its ends is alone on its side and the partner side's other ends
 * put its partner off the middle, the lone end moves to face it, as long as
 * its own side reaches that far. `along` holds every end's place on its
 * side and changes in place.
 */
function alignFacingEnds(
    edges: RoutingEdge[],
    sides: Map<number, EdgeSides>,
    loops: Map<number, Loop>,
    edgeEndsOn: Map<string, EdgeEnd[]>,
    elementsOf: (edge: RoutingEdge) => {
        source: RoutingElement;
        target: RoutingElement;
    },
    along: Map<string, number>,
): void {
    const facing = (a: Side, b: Side) =>
        outward(a).x === -outward(b).x && outward(a).y === -outward(b).y;
    const alone = (element: RoutingElement, side: Side) =>
        (edgeEndsOn.get(element.id) ?? []).filter((end) => end.side === side)
            .length === 1;
    for (const [index, edge] of edges.entries()) {
        const chosen = sides.get(index);
        if (!edge.centered || loops.has(index) || !chosen) continue;
        if (!facing(chosen.source, chosen.target)) continue;
        const { source, target } = elementsOf(edge);
        const ends = [
            { element: source, side: chosen.source, id: sourceEnd(index) },
            { element: target, side: chosen.target, id: targetEnd(index) },
        ];
        // A point on a top or bottom side is placed by x, otherwise by y.
        const origin = (element: RoutingElement, side: Side) =>
            isHorizontal(side) ? boxOf(element).x : boxOf(element).y;
        for (const [mover, partner] of [ends, [...ends].reverse()]) {
            if (!alone(mover.element, mover.side)) continue;
            const span = mover.element.geometry.spans[mover.side];
            const at =
                origin(partner.element, partner.side) +
                (along.get(partner.id) ?? 0) -
                origin(mover.element, mover.side);
            if (!span || at < span.from || at > span.to) continue;
            along.set(mover.id, at);
            break;
        }
    }
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
    room: EdgeRoom,
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
    if (!vertices.length && (room.source > 0 || room.target > 0)) {
        return straightEndRoute(
            edge,
            source,
            target,
            sides,
            sourceAlong,
            targetAlong,
            others,
            room,
        );
    }

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
 * A Mermaid edge without vertices whose ends run straight (spec: End
 * markers): routed in its mode between two stubs, `room` straight out of
 * each end's side, then joined to the ends on the outlines. Elements near a
 * stub keep as much clearance as leaves the stub outside them. A Curved
 * route curves between the stubs and runs straight along them.
 */
function straightEndRoute(
    edge: RoutingEdge,
    source: RoutingElement,
    target: RoutingElement,
    sides: EdgeSides,
    sourceAlong: number,
    targetAlong: number,
    others: Rect[],
    room: EdgeRoom,
): RouteDraft {
    const from = boxOf(source);
    const to = boxOf(target);
    const stub = (box: Rect, side: Side, at: number, by: number) =>
        offset(sidePoint(box, side, at), outward(side), by);
    const leave = stub(from, sides.source, sourceAlong, room.source);
    const enter = stub(to, sides.target, targetAlong, room.target);
    const padding = obstaclePadding(edge.thickness);
    const between =
        edge.routing === "Orthogonal"
            ? orthogonalRoute(
                  leave,
                  sides.source,
                  enter,
                  sides.target,
                  others,
                  [from, to],
                  padding,
                  true,
              )
            : directRoute(leave, enter, others, [from, to], padding, true);
    // Each end moves inward from the box, perpendicular to its side, onto
    // the drawn shape, so the stubs stay straight (spec 10.5).
    const start = onOutline(source, source.geometry, sides.source, sourceAlong);
    const end = onOutline(target, target.geometry, sides.target, targetAlong);
    if (edge.routing !== "Curved") {
        return { route: [start, ...between, end] };
    }
    const curve = curvedRoute(
        between,
        obstaclesFor(others, [leave, enter], padding, true),
    );
    return {
        route: [start, ...curve.route, end],
        cubics: [
            straightCubic(start, leave),
            ...curve.cubics,
            straightCubic(enter, end),
        ],
    };
}

/**
 * A self-relationship's loop on `element`, round its corner at its nest,
 * between the two edge ends spreading placed on the corner's sides. A
 * Mermaid edge's legs reach out past its straight ends, and a Curved one
 * runs straight along them before it bows.
 */
function loopOf(
    element: RoutingElement,
    mode: RoutingMode,
    { corner, nest }: Loop,
    leaveAlong: number,
    enterAlong: number,
    room: EdgeRoom,
): RouteDraft {
    const reach = Math.max(room.source, room.target);
    const points = selfLoop(
        boxOf(element),
        element.geometry,
        corner,
        leaveAlong,
        enterAlong,
        nest,
        mode,
        reach,
    );
    if (mode !== "Curved") return { route: points };
    const [start, c1, c2, end] = points;
    if (!reach) return cubicRoute(start, c1, c2, end);
    const [leave, enter] = corner;
    const out = outward(leave);
    const into = outward(enter);
    const first = offset(start, out, reach);
    const last = offset(end, into, reach);
    const bow = cubicRoute(
        first,
        offset(c1, out, reach),
        offset(c2, into, reach),
        last,
    );
    return {
        route: [start, ...bow.route, end],
        cubics: [
            straightCubic(start, first),
            ...bow.cubics,
            straightCubic(last, end),
        ],
    };
}
