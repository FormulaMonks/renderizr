/**
 * How an element's outline is painted (spec 9.4): which style colors each
 * part takes and its border dashes in model units. Shared by every shape, so
 * the SVG that draws one stays a matter of geometry. Opacity is not here: the
 * island applies it to all of an element's parts at once with `<g opacity>`.
 */

import type { Paint } from "./shapes/types";

/**
 * The SVG `stroke-dasharray` for a style's `border` at `strokeWidth`:
 * `Dashed` is a dash and gap of 4× the stroke width and `Dotted` 1×, as the
 * spec says rather than upstream's `sw 2sw`. Anything else is solid.
 */
export function borderDashes(
    border: string,
    strokeWidth: number,
): string | undefined {
    if (border === "Dashed") return `${4 * strokeWidth} ${4 * strokeWidth}`;
    if (border === "Dotted") return `${strokeWidth} ${strokeWidth}`;
    return undefined;
}

/** What `paintPart` reads from an element's style. */
export type PartStyle = {
    background: string;
    stroke: string;
    strokeWidth: number;
    border: string;
};

/** The SVG paint of one drawn part. */
export type PartPaint = {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeDasharray: string | undefined;
};

/**
 * How a shape part with paint role `paint` is drawn in `style` (see `Paint`
 * in `shapes/types.ts`). Border dashes go on the outline (`body`), on device
 * and window bezels (`frame`) and on Person and Robot arms (`rule`), as
 * upstream dashes them; panels, displays and the prompt stay solid.
 */
export function paintPart(paint: Paint, style: PartStyle): PartPaint {
    const { background, stroke, strokeWidth, border } = style;
    switch (paint) {
        case "body":
            return {
                fill: background,
                stroke,
                strokeWidth,
                strokeDasharray: borderDashes(border, strokeWidth),
            };
        case "frame":
            return {
                fill: stroke,
                stroke,
                strokeWidth,
                strokeDasharray: borderDashes(border, strokeWidth),
            };
        case "screen":
            return {
                fill: background,
                stroke: "none",
                strokeWidth: 0,
                strokeDasharray: undefined,
            };
        case "ink":
            return {
                fill: stroke,
                stroke: "none",
                strokeWidth: 0,
                strokeDasharray: undefined,
            };
        case "rule":
            return {
                fill: "none",
                stroke,
                strokeWidth: 1,
                strokeDasharray: borderDashes(border, strokeWidth),
            };
        case "grille":
            return {
                fill: "none",
                stroke: background,
                strokeWidth: 2,
                strokeDasharray: undefined,
            };
    }
}
