/**
 * Indicators (spec 9.2, 10.9): one 20-unit glyph per kind of target an
 * element, boundary or relationship offers, in a row. Each label template
 * keeps room for its row, so the glyphs never cover text: an element's
 * label gives up description lines, a boundary's band and an edge's label
 * wrap short of them. An item without targets draws none and keeps the room.
 */

import type { TargetKind } from "../../model/index";
import { escapeXml } from "./xml";

/** One glyph's width and height, in model units. */
export const INDICATOR_SIZE = 20;

/** Space between two glyphs in a row, and between a row and text beside it. */
export const INDICATOR_GAP = 5;

/** Space between an element's text and the indicator row below it. */
export const INDICATOR_MARGIN = 10;

/**
 * Space between an element's indicator row, or a Bottom icon under it, and
 * the bottom of its content area, so the glyphs don't crowd the outline.
 */
export const INDICATOR_INSET = 20;

/** Each kind once, in the order the targets first offer it. */
export const indicatorKinds = (
    targets: readonly TargetKind[],
): TargetKind[] => [...new Set(targets)];

/** How wide a row of `count` glyphs is. */
export const indicatorRowWidth = (count: number) =>
    count > 0 ? count * INDICATOR_SIZE + (count - 1) * INDICATOR_GAP : 0;

/** The side of the box every glyph is drawn in. */
export const GLYPH_BOX = 20;

/** The width of a glyph's stroke, in the glyph's own box. */
export const GLYPH_STROKE = 1.6;

/**
 * Each target kind's glyph, stroked in a `GLYPH_BOX` box: a magnifier for a
 * view to drill down to, a page for the documentation, a checked circle for
 * the decisions, two overlapping windows for another workspace of the set
 * and an arrow out of a box for a link. The island strokes
 * them inline and an export draws them as images (ADR 21), so both draw
 * these paths.
 */
export const GLYPHS: Readonly<Record<TargetKind, readonly string[]>> = {
    view: [
        "M8.5 3a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11z",
        "M12.6 12.6L17 17",
        "M6 8.5h5",
        "M8.5 6v5",
    ],
    documentation: [
        "M4.5 2.5h7.5l3.5 3.5v11.5h-11z",
        "M12 2.5v3.5h3.5",
        "M7.5 10h5",
        "M7.5 13h5",
    ],
    decisions: [
        "M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z",
        "M6.5 10.2l2.5 2.5l4.5-5",
    ],
    workspace: ["M3 7h10v10h-10z", "M7 3h10v10", "M3 10h10"],
    link: ["M11 3h6v6", "M17 3l-8 8", "M15 12v5h-12v-12h5"],
};

/** One glyph as a standalone SVG document, stroked in `color`. */
export function glyphSvg(kind: TargetKind, color: string): string {
    const paths = GLYPHS[kind].map((d) => `<path d="${d}"/>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${GLYPH_BOX}" height="${GLYPH_BOX}" viewBox="0 0 ${GLYPH_BOX} ${GLYPH_BOX}" fill="none" stroke="${escapeXml(color)}" stroke-width="${GLYPH_STROKE}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

/** One glyph as a `data:` URL an `<image>` can draw, fetching nothing. */
export const glyphDataUrl = (kind: TargetKind, color: string) =>
    `data:image/svg+xml,${encodeURIComponent(glyphSvg(kind, color))}`;
