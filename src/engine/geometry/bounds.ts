/**
 * Axis-aligned boxes in model units, and the box around a set of them. Shared
 * by the boundary derivation and the graph's overall bounds, so both agree on
 * what "around" means.
 */

/** A box in model units: top-left corner, width and height. */
export type Bounds = { x: number; y: number; width: number; height: number };

/** The box around `boxes`, or undefined when there are none. */
export function boundsOf(boxes: readonly Bounds[]): Bounds | undefined {
    if (!boxes.length) return undefined;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}
