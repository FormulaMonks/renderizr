/**
 * Jump-overs (spec 10.11): a semicircle an edge draws where it crosses
 * another edge, so the crossing does not read as a junction. Which edge of
 * two draws the jump-over is decided in `route-view.ts`; this module finds
 * the crossings on one route and writes its path data with the jump-overs in.
 */

import type { Point } from "../shapes/types";
import { num } from "../shapes/outline";
import { distance, pathPoint, polylinePath } from "./path";

/** A jump-over's radius for an edge of `thickness`: about 3t + 3. */
export const jumpRadius = (thickness: number): number => 3 * thickness + 3;

/** One jump-over: on which segment of the route, and where it crosses. */
export type JumpOver = { segment: number; at: Point };

const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/**
 * Where segment `a`–`b` properly crosses segment `c`–`d`, as the fraction of
 * the way from `a` to `b`; `null` when they are parallel, only touch, or miss.
 */
function crossing(a: Point, b: Point, c: Point, d: Point): number | null {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const cd = { x: d.x - c.x, y: d.y - c.y };
    const denominator = cross(ab, cd);
    if (denominator === 0) return null;
    const ac = { x: c.x - a.x, y: c.y - a.y };
    const t = cross(ac, cd) / denominator;
    const u = cross(ac, ab) / denominator;
    return t > 0 && t < 1 && u > 0 && u < 1 ? t : null;
}

/**
 * The jump-overs `route` makes over `others`, in order along it. A crossing
 * closer than two radii to a bend or an end, or to the jump-over before it,
 * is drawn plainly: there is no room for the whole semicircle.
 */
export function jumpOversOf(
    route: Point[],
    others: Point[][],
    radius: number,
): JumpOver[] {
    const jumpOvers: JumpOver[] = [];
    for (let segment = 0; segment + 1 < route.length; segment++) {
        const a = route[segment];
        const b = route[segment + 1];
        const length = distance(a, b);
        const found: number[] = [];
        for (const other of others) {
            for (let i = 0; i + 1 < other.length; i++) {
                const t = crossing(a, b, other[i], other[i + 1]);
                if (t !== null) found.push(t);
            }
        }
        let last = Number.NEGATIVE_INFINITY;
        for (const t of found.sort((p, q) => p - q)) {
            const along = t * length;
            if (along < 2 * radius || length - along < 2 * radius) continue;
            if (along - last < 2 * radius) continue;
            last = along;
            jumpOvers.push({
                segment,
                at: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) },
            });
        }
    }
    return jumpOvers;
}

/**
 * SVG path data for the polyline `route` with a semicircle of `radius` at
 * each of `jumpOvers`. Every one bulges the same way for the same heading:
 * up on a rightward segment, right on a downward one.
 */
export function jumpPath(
    route: Point[],
    jumpOvers: JumpOver[],
    radius: number,
): string {
    if (!jumpOvers.length) return polylinePath(route);
    const commands = [`M ${pathPoint(route[0])}`];
    for (let segment = 0; segment + 1 < route.length; segment++) {
        const a = route[segment];
        const b = route[segment + 1];
        const length = distance(a, b);
        const ux = (b.x - a.x) / length;
        const uy = (b.y - a.y) / length;
        const sweep = ux > 0 || (ux === 0 && uy > 0) ? 1 : 0;
        for (const { at } of jumpOvers.filter((j) => j.segment === segment)) {
            const before = { x: at.x - ux * radius, y: at.y - uy * radius };
            const after = { x: at.x + ux * radius, y: at.y + uy * radius };
            commands.push(
                `L ${pathPoint(before)}`,
                `A ${num(radius)} ${num(radius)} 0 0 ${sweep} ${pathPoint(after)}`,
            );
        }
        commands.push(`L ${pathPoint(b)}`);
    }
    return commands.join(" ");
}
