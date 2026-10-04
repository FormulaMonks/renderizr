/**
 * Which side of each element an edge leaves and enters by, and where along
 * that side its edge end sits (spec 10.4). Both run in one pass over the view
 * before any edge is routed, so ends that share a side are spread apart and
 * ordered so that their edges do not cross on the way out.
 */

import type { Point, Rect, Side, Span } from "../shapes/types";
import {
    CLEARANCE,
    centerOf,
    isHorizontal,
    outward,
    type RoutingMode,
    SIDES,
} from "./path";

/**
 * What one bend costs when choosing sides, in model units of length: enough
 * that a route with a bend fewer wins unless it is much longer.
 */
export const BEND_PENALTY = 50;

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

/**
 * How many bends the simplest axis-aligned route needs to leave `from`
 * through `fromSide` and arrive at `to` through `toSide`, each perpendicular
 * to its side. A cost estimate for side choice in Orthogonal, and in Direct
 * and Curved when avoidance bends the route (`chooseSides`).
 */
export function bendsBetween(
    from: Point,
    fromSide: Side,
    to: Point,
    toSide: Side,
): number {
    const out = outward(fromSide);
    const into = outward(toSide);
    const toward = { x: to.x - from.x, y: to.y - from.y };
    const ahead = dot(toward, out) > CLEARANCE;
    if (out.x === -into.x && out.y === -into.y) {
        if (!ahead) return 4;
        const across = Math.abs(out.x === 0 ? toward.x : toward.y);
        return across < CLEARANCE ? 0 : 2;
    }
    if (out.x === into.x && out.y === into.y) return 2;
    const behind = -dot(toward, into) > CLEARANCE;
    return ahead && behind ? 1 : 3;
}

const midpointOf = (box: Rect, side: Side): Point => {
    const center = centerOf(box);
    const out = outward(side);
    return {
        x: center.x + (out.x * box.width) / 2,
        y: center.y + (out.y * box.height) / 2,
    };
};

/** The sides an edge leaves its source by and enters its target by. */
export type EdgeSides = { source: Side; target: Side };

/**
 * Whether a straight line from `from` to `to` leaves `fromSide` outward and
 * enters `toSide` inward, so drawing it adds no bend at either end.
 */
function runsStraight(
    from: Point,
    fromSide: Side,
    to: Point,
    toSide: Side,
): boolean {
    const toward = { x: to.x - from.x, y: to.y - from.y };
    return (
        dot(toward, outward(fromSide)) > CLEARANCE &&
        -dot(toward, outward(toSide)) > CLEARANCE
    );
}

/**
 * The sides an edge without vertices leaves `from` and enters `to` by.
 *
 * In Direct and Curved, the sides the line between the two centers leaves
 * and enters (`facingSide`), as Structurizr aims an edge from center to
 * center: a target below gets the edge on its top. That holds while the
 * straight line between those sides' midpoints is clear, as `isClear` judges
 * it; once avoidance has to bend the route, and in Orthogonal always, the
 * pair with the lowest cost: its length (axis-aligned for Orthogonal,
 * straight otherwise) plus `BEND_PENALTY` per bend. A tie goes to the pair
 * met first, clockwise from the top.
 */
export function chooseSides(
    from: Rect,
    to: Rect,
    mode: RoutingMode,
    isClear: (a: Point, b: Point) => boolean = () => true,
): EdgeSides {
    if (mode !== "Orthogonal") {
        const source = facingSide(from, centerOf(to));
        const target = facingSide(to, centerOf(from));
        const a = midpointOf(from, source);
        const b = midpointOf(to, target);
        // Elements that overlap have no straight line between facing sides.
        if (runsStraight(a, source, b, target) && isClear(a, b)) {
            return { source, target };
        }
    }
    let best: EdgeSides = { source: SIDES[0], target: SIDES[0] };
    let lowest = Number.POSITIVE_INFINITY;
    for (const source of SIDES) {
        const a = midpointOf(from, source);
        for (const target of SIDES) {
            const b = midpointOf(to, target);
            const length =
                mode === "Orthogonal"
                    ? Math.abs(b.x - a.x) + Math.abs(b.y - a.y)
                    : Math.hypot(b.x - a.x, b.y - a.y);
            const cost =
                length + BEND_PENALTY * bendsBetween(a, source, b, target);
            if (cost < lowest - CLEARANCE) {
                lowest = cost;
                best = { source, target };
            }
        }
    }
    return best;
}

/**
 * The side a ray from the center of `box` toward `point` leaves by: how an
 * edge with vertices picks its sides, facing its first or last vertex, and
 * how a Direct or Curved edge without them does, facing the other element's
 * center.
 */
export function facingSide(box: Rect, point: Point): Side {
    const center = centerOf(box);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    if (Math.abs(dx) * box.height > Math.abs(dy) * box.width) {
        return dx > 0 ? "right" : "left";
    }
    return dy < 0 ? "top" : "bottom";
}

/** One edge end waiting for its place on a side of an element. */
export type EdgeEnd = {
    /** Unique among the element's ends. */
    id: string;
    side: Side;
    /** Where the edge heads from here: the far element's center, or the nearest vertex. */
    far: Point;
    /** The edge's place in the view, which breaks ties. */
    order: number;
    /**
     * Set on a self-relationship's loop ends: the end of the side's span the
     * loop's corner is at. Loop ends sit nearest their corner, past every
     * other end on the side, the innermost loop nearest (spec 10.7).
     */
    toward?: "from" | "to";
};

/** Where an end sorts on its side: loop ends at either extreme. */
const rankOf = ({ toward }: EdgeEnd) =>
    toward === "from" ? -1 : toward === "to" ? 1 : 0;

/**
 * The order of two ends on one side: loop ends at their corner's end of it,
 * earlier loops nearer the corner; every other end by its far end, then by
 * view order.
 */
function compareEnds(
    a: EdgeEnd,
    b: EdgeEnd,
    coordinate: (end: EdgeEnd) => number,
) {
    const rank = rankOf(a) - rankOf(b);
    if (rank) return rank;
    if (rankOf(a) > 0) return b.order - a.order;
    if (rankOf(a) < 0) return a.order - b.order;
    return coordinate(a) - coordinate(b) || a.order - b.order;
}

/**
 * Where each of one element's edge ends sits along its side, keyed by end
 * id: the ends sharing a side sorted by their far end's coordinate along it,
 * then by view order, and placed at `(i + 1) / (n + 1)` of the side's usable
 * span. Ties keep view order on both elements, which is what makes A→B and
 * B→A two parallel lanes. A self-relationship's loop ends take part too,
 * at their corner's end of the side (`compareEnds`).
 */
export function spreadEnds(
    ends: EdgeEnd[],
    spans: Partial<Record<Side, Span>>,
): Map<string, number> {
    const along = new Map<string, number>();
    for (const side of SIDES) {
        const span = spans[side];
        if (!span) continue;
        const coordinate = (end: EdgeEnd) =>
            isHorizontal(side) ? end.far.x : end.far.y;
        const sorted = ends
            .filter((end) => end.side === side)
            .sort((a, b) => compareEnds(a, b, coordinate));
        for (const [i, end] of sorted.entries()) {
            along.set(
                end.id,
                span.from +
                    ((i + 1) / (sorted.length + 1)) * (span.to - span.from),
            );
        }
    }
    return along;
}
