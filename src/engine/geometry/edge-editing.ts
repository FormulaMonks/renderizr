/**
 * The geometry of editing edges (spec 12): where along a route the pointer
 * is, which leg a double-click splits, where a dragged label lands, and the
 * side an edge-end drag picks with the vertex that holds it (ADR 19). Pure,
 * so it runs under `node --test`; only edit mode calls it.
 */

import {
    isHorizontal,
    lengthOf,
    outward,
    SIDES,
    sidePoint,
} from "./routing/path";
import type { Point, Rect, Side } from "./shapes/types";
import { snapToGrid } from "./snapping";

/** How far out from a side the vertex that holds it sits (spec 12.4). */
export const SIDE_OFFSET = 20;

/** The share of a side at either end a chosen side's vertex keeps out of. */
const SIDE_INSET = 0.1;

/** How far along `route`, by length from its start, the point nearest `point` is. */
export function lengthTo(route: readonly Point[], point: Point): number {
    let best = Number.POSITIVE_INFINITY;
    let at = 0;
    let walked = 0;
    for (let i = 1; i < route.length; i++) {
        const a = route[i - 1];
        const b = route[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const t = length
            ? Math.min(
                  Math.max(
                      ((point.x - a.x) * (b.x - a.x) +
                          (point.y - a.y) * (b.y - a.y)) /
                          length ** 2,
                      0,
                  ),
                  1,
              )
            : 0;
        const distance = Math.hypot(
            a.x + t * (b.x - a.x) - point.x,
            a.y + t * (b.y - a.y) - point.y,
        );
        if (distance < best) {
            best = distance;
            at = walked + t * length;
        }
        walked += length;
    }
    return at;
}

/**
 * Where a double-click at `point` on `route` puts its vertex among
 * `vertices`, the ones the route passes through (spec 12.3): after every
 * vertex that comes before it along the route, so it splits the leg the
 * pointer is on, whatever bends the routing mode adds within it.
 */
export const vertexIndex = (
    route: readonly Point[],
    vertices: readonly Point[],
    point: Point,
): number => {
    const at = lengthTo(route, point);
    return vertices.filter((vertex) => lengthTo(route, vertex) < at).length;
};

/**
 * The `position` a label dragged to `point` takes (spec 12.7): the whole
 * percent of `route`'s length from the source end to the point nearest it,
 * 0 to 100.
 */
export const labelPositionAt = (route: readonly Point[], point: Point) =>
    Math.round((100 * lengthTo(route, point)) / (lengthOf([...route]) || 1));

/** The two ends of `side` of `box`, as its start and length on its own axis. */
const sideOf = (box: Rect, side: Side) =>
    isHorizontal(side)
        ? { start: box.x, length: box.width }
        : { start: box.y, length: box.height };

/** Where `side` of `box` runs, across its own axis. */
const lineOf = (box: Rect, side: Side) => {
    const corner = sidePoint(box, side, 0);
    return isHorizontal(side) ? corner.y : corner.x;
};

/** The coordinate, across `side`, of the line 20 units out from it. */
const outAt = (box: Rect, side: Side) =>
    lineOf(box, side) + (outward(side).x + outward(side).y) * SIDE_OFFSET;

/** How far `point` is from the segment that is `side` of `box`. */
function distanceToSide(box: Rect, side: Side, point: Point): number {
    const { start, length } = sideOf(box, side);
    const [along, across] = isHorizontal(side)
        ? [point.x, point.y]
        : [point.y, point.x];
    const past = Math.max(start - along, 0, along - (start + length));
    return Math.hypot(past, across - lineOf(box, side));
}

/** The side of `box` nearest `point`; a tie goes clockwise from the top (spec 12.4). */
export const nearestSide = (box: Rect, point: Point): Side =>
    SIDES.reduce((best, side) =>
        distanceToSide(box, side, point) < distanceToSide(box, best, point)
            ? side
            : best,
    );

/**
 * The vertex an edge-end drop at `pointer` on `side` of `box` saves (spec
 * 12.4): 20 units straight out from the side, at the pointer's place along
 * it, on the side's middle within `reach` model units, else on the 5-unit
 * grid, and then kept out of the side's outer 10%.
 */
export function sideVertex(
    box: Rect,
    side: Side,
    pointer: Point,
    reach: number,
): Point {
    const { start, length } = sideOf(box, side);
    const middle = start + length / 2;
    const grid = snapToGrid(pointer);
    const wanted = isHorizontal(side) ? pointer.x : pointer.y;
    const snapped =
        Math.abs(wanted - middle) <= reach
            ? middle
            : isHorizontal(side)
              ? grid.x
              : grid.y;
    // In whole units, as saved, rounded inward at either end.
    const along = Math.min(
        Math.max(Math.round(snapped), Math.ceil(start + SIDE_INSET * length)),
        Math.floor(start + (1 - SIDE_INSET) * length),
    );
    const across = Math.round(outAt(box, side));
    return isHorizontal(side)
        ? { x: along, y: across }
        : { x: across, y: along };
}

/**
 * Whether `vertex` still sits exactly 20 units straight out from a side of
 * `box`, within the side's length: the vertex a side drop saved, which a
 * later drop on the same end replaces (spec 12.4).
 */
export const holdsSide = (box: Rect, vertex: Point) =>
    SIDES.some((side) => {
        const { start, length } = sideOf(box, side);
        const [along, across] = isHorizontal(side)
            ? [vertex.x, vertex.y]
            : [vertex.y, vertex.x];
        return (
            Math.abs(across - outAt(box, side)) < 0.5 &&
            along >= start &&
            along <= start + length
        );
    });
