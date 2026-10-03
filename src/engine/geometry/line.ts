/**
 * How an edge's line is drawn (spec 10.10): its dashes and the filled
 * triangle at its target, sized from its thickness, in model units. Color
 * and opacity are not here: the island paints the line and the arrowhead in
 * one `<g opacity>`, so where they overlap the alpha is not doubled.
 */

import { num } from "./shapes/outline";
import type { Point } from "./shapes/types";

/** The line styles a relationship style names. */
export type LineStyle = "Solid" | "Dashed" | "Dotted";

/**
 * The SVG `stroke-dasharray` for a line style at thickness `t`: dashes of
 * `4t 4t`, dots of `t 2t` (drawn with round caps), nothing when solid.
 */
export function lineDashes(style: LineStyle, t: number): string | undefined {
    if (style === "Dashed") return `${4 * t} ${4 * t}`;
    if (style === "Dotted") return `${t} ${2 * t}`;
    return undefined;
}

/** The longest an arrowhead gets, whatever the thickness (upstream's cap). */
const ARROWHEAD_MAX = 50;

/**
 * An arrowhead's length and the width of its base: ten times the thickness,
 * at most 50, as upstream's `calculateArrowHead` sizes it.
 */
export const arrowheadSize = (t: number): number =>
    Math.min(10 * t, ARROWHEAD_MAX);

/**
 * The unit vector along a route's last segment, toward its end, skipping
 * points that repeat the end.
 */
function endDirection(route: Point[]): Point {
    const end = route[route.length - 1];
    for (let i = route.length - 2; i >= 0; i--) {
        const dx = end.x - route[i].x;
        const dy = end.y - route[i].y;
        const length = Math.hypot(dx, dy);
        if (length > 0) return { x: dx / length, y: dy / length };
    }
    return { x: 1, y: 0 };
}

/**
 * SVG path data for the filled triangle at the target end of `route`: its
 * tip on the route's last point (on the target's outline, spec 10.5), its
 * base `arrowheadSize(t)` back along the last segment and as wide.
 */
export function arrowheadPath(route: Point[], t: number): string {
    const tip = route[route.length - 1];
    const along = endDirection(route);
    const size = arrowheadSize(t);
    const base = { x: tip.x - along.x * size, y: tip.y - along.y * size };
    const half = { x: -along.y * (size / 2), y: along.x * (size / 2) };
    const at = (p: Point) => `${num(p.x)} ${num(p.y)}`;
    return `M ${at(tip)} L ${at({ x: base.x + half.x, y: base.y + half.y })} L ${at({ x: base.x - half.x, y: base.y - half.y })} Z`;
}

/** The last coordinate pair in path data, which is where the path ends. */
const LAST_POINT = /(-?[\d.]+(?:e-?\d+)?) (-?[\d.]+(?:e-?\d+)?)\s*$/;

/**
 * `path` with its end pulled back `by` along the route's last segment. A
 * line `t` thick ends `t` short of the arrowhead's tip, where the triangle is
 * `t` wide, so the line's butt end never shows past the arrowhead's sides.
 */
export function endShort(path: string, route: Point[], by: number): string {
    const end = route[route.length - 1];
    const along = endDirection(route);
    const x = num(end.x - along.x * by);
    const y = num(end.y - along.y * by);
    return path.replace(LAST_POINT, `${x} ${y}`);
}
