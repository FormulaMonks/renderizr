/**
 * Indicators (spec 9.2, 10.9): one 20-unit glyph per kind of target an
 * element, boundary or relationship offers, in a row. Each label template
 * keeps room for its row, so the glyphs never cover text: an element's
 * label gives up description lines, a boundary's band and an edge's label
 * wrap short of them. An item without targets draws none and keeps the room.
 */

import type { TargetKind } from "../../model/index";

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
