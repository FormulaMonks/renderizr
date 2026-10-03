/**
 * How an edge's line is drawn (spec 10.10): its dashes and the filled
 * triangle at its target, sized from its thickness, in model units. The
 * router ends the line one thickness short of the target end, where this
 * triangle is exactly as wide as the line. Color and opacity are not here:
 * the island paints the line and the arrowhead in one `<g opacity>`, so
 * where they overlap the alpha is not doubled.
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
export function arrowheadSize(t: number): number {
    return Math.min(10 * t, ARROWHEAD_MAX);
}

/**
 * SVG path data for the filled triangle at an edge's target: its tip on
 * `tip` (the route's last point, on the target's outline, spec 10.5), its
 * base `arrowheadSize(t)` back against `heading` and as wide.
 */
export function arrowheadPath(tip: Point, heading: Point, t: number): string {
    const size = arrowheadSize(t);
    const base = { x: tip.x - heading.x * size, y: tip.y - heading.y * size };
    const half = { x: -heading.y * (size / 2), y: heading.x * (size / 2) };
    const at = ({ x, y }: Point) => `${num(x)} ${num(y)}`;
    const left = { x: base.x + half.x, y: base.y + half.y };
    const right = { x: base.x - half.x, y: base.y - half.y };
    return `M ${at(tip)} L ${at(left)} L ${at(right)} Z`;
}
