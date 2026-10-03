/**
 * Small helpers every routing module shares: boxes and the points on their
 * sides, the crossing test avoidance is built on, tidying a polyline and
 * writing it as SVG path data. Coordinates are absolute model units, y down.
 */

import { num, touch } from "../shapes/outline";
import type { Point, Rect, ShapeGeometry, Side } from "../shapes/types";

/** The character of a route as the workspace names it (spec 10.2). */
export type RoutingMode = "Direct" | "Orthogonal" | "Curved";

/**
 * A route as drawn: the points it passes through, source end first, and its
 * SVG path data. A curve's route is sampled along it.
 */
export type DrawnRoute = { route: Point[]; path: string };

/** How far inside a box a segment has to reach before it counts as crossing it. */
export const CLEARANCE = 1e-6;

/** The sides of a box, clockwise from the top. */
export const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

/** The unit vector pointing out of a box through `side`. */
export function outward(side: Side): Point {
    return {
        top: { x: 0, y: -1 },
        right: { x: 1, y: 0 },
        bottom: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
    }[side];
}

/** Whether `side` runs horizontally, so a point on it is placed by x. */
export const isHorizontal = (side: Side): boolean =>
    side === "top" || side === "bottom";

/**
 * The point on `side` of `box` at `along`, measured on the side's own axis
 * from the box's top-left: x for top and bottom, y for left and right.
 */
export function sidePoint(box: Rect, side: Side, along: number): Point {
    switch (side) {
        case "top":
            return { x: box.x + along, y: box.y };
        case "right":
            return { x: box.x + box.width, y: box.y + along };
        case "bottom":
            return { x: box.x + along, y: box.y + box.height };
        case "left":
            return { x: box.x, y: box.y + along };
    }
}

/**
 * Where an edge end at `along` on `side` of a shape drawn as `geometry`,
 * with its top-left at `origin`, meets the drawn outline (spec 10.5).
 */
export function onOutline(
    origin: Point,
    geometry: ShapeGeometry,
    side: Side,
    along: number,
): Point {
    const local = touch(geometry, side, along);
    return { x: origin.x + local.x, y: origin.y + local.y };
}

export function centerOf(box: Rect): Point {
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** `box` grown by `by` on every side. */
export function grow(box: Rect, by: number): Rect {
    return {
        x: box.x - by,
        y: box.y - by,
        width: box.width + 2 * by,
        height: box.height + 2 * by,
    };
}

/** The corners of `box`, clockwise from the top-left. */
export function cornersOf({ x, y, width, height }: Rect): Point[] {
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
    ];
}

/** Whether `point` lies strictly inside `box`. */
export function isInside(point: Point, box: Rect): boolean {
    return (
        point.x > box.x + CLEARANCE &&
        point.x < box.x + box.width - CLEARANCE &&
        point.y > box.y + CLEARANCE &&
        point.y < box.y + box.height - CLEARANCE
    );
}

/** Whether two boxes share any area. */
export function overlaps(a: Rect, b: Rect): boolean {
    return (
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height
    );
}

/** The box around every point. */
export function boxAround(points: Point[]): Rect {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Whether the segment from `a` to `b` passes through the inside of `box`.
 * Running along a side or touching a corner does not count, so a route may
 * hug a padded box (Liang–Barsky clipping).
 */
export function crossesBox(a: Point, b: Point, box: Rect): boolean {
    const left = box.x + CLEARANCE;
    const right = box.x + box.width - CLEARANCE;
    const top = box.y + CLEARANCE;
    const bottom = box.y + box.height - CLEARANCE;
    // Most segments miss most boxes: rule those out before clipping.
    if (Math.max(a.x, b.x) <= left || Math.min(a.x, b.x) >= right) {
        return false;
    }
    if (Math.max(a.y, b.y) <= top || Math.min(a.y, b.y) >= bottom) {
        return false;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let enter = 0;
    let leave = 1;
    const clip = (p: number, q: number) => {
        if (p === 0) return q > 0;
        const t = q / p;
        if (p < 0) enter = Math.max(enter, t);
        else leave = Math.min(leave, t);
        return enter < leave;
    };
    return (
        clip(-dx, a.x - left) &&
        clip(dx, right - a.x) &&
        clip(-dy, a.y - top) &&
        clip(dy, bottom - a.y)
    );
}

/** Whether any segment of `route` passes through the inside of `box`. */
export function routeCrosses(route: Point[], box: Rect): boolean {
    return route.some(
        (point, i) => i > 0 && crossesBox(route[i - 1], point, box),
    );
}

const same = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < CLEARANCE && Math.abs(a.y - b.y) < CLEARANCE;

const collinear = (a: Point, b: Point, c: Point) =>
    Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <
        CLEARANCE && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) >= 0;

/**
 * `points` without repeats and without points in the middle of a straight
 * run, so every point left is an end or a bend.
 */
export function simplify(points: Point[]): Point[] {
    const kept: Point[] = [];
    for (const point of points) {
        if (kept.length && same(kept[kept.length - 1], point)) continue;
        if (
            kept.length >= 2 &&
            collinear(kept[kept.length - 2], kept[kept.length - 1], point)
        ) {
            kept[kept.length - 1] = point;
            continue;
        }
        kept.push(point);
    }
    return kept;
}

export const distance = (a: Point, b: Point): number =>
    Math.hypot(b.x - a.x, b.y - a.y);

/** The length of a polyline. */
export function lengthOf(route: Point[]): number {
    return route.reduce(
        (sum, point, i) => (i ? sum + distance(route[i - 1], point) : 0),
        0,
    );
}

/** The point `fraction` of the way along a polyline, by length. */
export function pointAlong(route: Point[], fraction: number): Point {
    let remaining = lengthOf(route) * fraction;
    for (let i = 1; i < route.length; i++) {
        const step = distance(route[i - 1], route[i]);
        if (step > 0 && remaining <= step) {
            const t = remaining / step;
            return {
                x: route[i - 1].x + t * (route[i].x - route[i - 1].x),
                y: route[i - 1].y + t * (route[i].y - route[i - 1].y),
            };
        }
        remaining -= step;
    }
    return route[route.length - 1];
}

/** A point written for path data, through the shapes' `num`. */
export const pathPoint = ({ x, y }: Point): string => `${num(x)} ${num(y)}`;

/** SVG path data for a polyline: one `M`, then an `L` per point. */
export const polylinePath = (route: Point[]): string =>
    route.map((point, i) => `${i ? "L" : "M"} ${pathPoint(point)}`).join(" ");
