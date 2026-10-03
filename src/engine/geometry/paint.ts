/**
 * How an element's outline is painted (spec 9.4): border dashes in model
 * units and real alpha. Shared by every shape, so the SVG that draws one
 * stays a matter of geometry.
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

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `color` with real alpha `alpha` (0 to 1), rather than blended towards the
 * canvas as today's renderer does with `shadeColor`. An opaque color comes
 * back unchanged.
 */
export function withAlpha(color: string, alpha: number): string {
    if (alpha >= 1) return color;
    const match = HEX.exec(color);
    if (!match) {
        return `color-mix(in srgb, ${color} ${alpha * 100}%, transparent)`;
    }
    const hex =
        match[1].length === 3
            ? [...match[1]].map((digit) => digit + digit).join("")
            : match[1];
    const [r, g, b] = [0, 2, 4].map((at) =>
        Number.parseInt(hex.slice(at, at + 2), 16),
    );
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
