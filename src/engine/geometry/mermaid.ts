/**
 * The sizes a Mermaid diagram draws at (spec: Flowchart and ERD layout), as
 * plain numbers: each node sized from its own label, the way Mermaid sizes
 * it and scaled from Mermaid's 16 px to Renderizr's 24 px, then grown until
 * the label template fits it unwrapped.
 */

import { MERMAID_SCALE, type MermaidShape } from "../../model/index";
import type { MeasureText } from "./boundary";
import type { Bounds, Size } from "./bounds";
import { INDICATOR_INSET, indicatorRowWidth } from "./indicators";
import {
    INDICATOR_ROW_HEIGHT,
    LINE_HEIGHT,
    NAME_SCALE,
    SIDE_PADDING,
} from "./label";
import { shapeGeometry } from "./shapes/index";

/** Mermaid's cluster padding, 8 at 16 px, scaled. */
export const MERMAID_GROUP_PADDING = 12;

/** What Mermaid adds to the rank separation inside a subgraph laid out on its own, scaled. */
export const MERMAID_RANK_BONUS = 25 * MERMAID_SCALE;

/** Mermaid's node padding at 16 px: 15 above and below, twice that each side. */
const PADDING = 15 * MERMAID_SCALE;

/** The shapes whose box stays square, as Mermaid draws them. */
const SQUARE: ReadonlySet<MermaidShape> = new Set(["Diamond", "Circle"]);

/** The font a node's name draws in: bold unless its source says, and its own family, if any. */
export type MermaidFont = { bold: boolean; family?: string };

const NAME_FONT: MermaidFont = { bold: true };

/** Whether a node's name draws bold under the `font-weight` its source sets, if any. */
export const nameIsBold = (weight: string | undefined) =>
    weight === undefined || /^(bold|bolder|[6-9]00)$/i.test(weight.trim());

/** The label's own size: its widest line and its lines' height, as the name draws them. */
export function mermaidLabelSize(
    label: string,
    fontSize: number,
    measure: MeasureText,
    font: MermaidFont = NAME_FONT,
): Size {
    const size = fontSize * NAME_SCALE;
    const lines = label.split("\n");
    return {
        width: Math.max(
            0,
            ...lines.map((line) => measure(line, size, font.bold, font.family)),
        ),
        height: lines.length * size * LINE_HEIGHT,
    };
}

/**
 * How tall a node's label template is in its content area `content`: all
 * of it, but on a cylinder with an indicator row it ends short of the
 * bottom lid, so the row sits above the bottom curve (spec: Activation
 * targets). The lid is as deep as the content area starts below the top.
 */
export function mermaidLabelHeight(
    shape: MermaidShape,
    content: Bounds,
    indicators: boolean,
): number {
    if (!indicators || shape !== "Cylinder") return content.height;
    return content.height - Math.max(0, content.y - INDICATOR_INSET);
}

/**
 * A node's box: Mermaid's rule for its shape, then as much bigger as the
 * label template needs to hold `label` on its lines. The label plus 30 on
 * each side and 15 above and below (scaled); a diamond's side is the label's
 * width plus its height plus padding (Mermaid's `question.ts`), a circle
 * fits the label's width plus padding (`circle.ts`), a hexagon adds half its
 * height, a cylinder twice the padding for its lids.
 *
 * A node with `indicators` target kinds draws C4's indicator row under its
 * label and grows by it (spec: Activation targets): the row counts as part
 * of the label's height in every rule (a circle's too), so the diamond,
 * whose side adds the height, grows the most, and the label keeps its
 * padding above the row.
 */
export function mermaidNodeSize(
    shape: MermaidShape,
    label: string,
    fontSize: number,
    measure: MeasureText,
    indicators = 0,
    font: MermaidFont = NAME_FONT,
): Size {
    const text = mermaidLabelSize(label, fontSize, measure, font);
    const row = indicators > 0 ? INDICATOR_ROW_HEIGHT : 0;
    // What the content area must hold: the label alone, or the label, its
    // padding and the row under it.
    const needed = row
        ? {
              width: Math.max(
                  text.width + 2 * SIDE_PADDING,
                  indicatorRowWidth(indicators),
              ),
              height: text.height + 2 * PADDING + row,
          }
        : { width: text.width + 2 * SIDE_PADDING, height: text.height };
    let width = text.width + 4 * PADDING;
    let height = text.height + row + 2 * PADDING;
    if (shape === "Diamond")
        width = height = text.width + text.height + row + 2 * PADDING;
    // A circle's rule ignores the label's height, but not the row's: the
    // label moves up by it and needs the room at its sides.
    if (shape === "Circle") width = height = text.width + row + 2 * PADDING;
    if (shape === "Hexagon") width = text.width + 2 * PADDING + height / 2;
    if (shape === "Cylinder") height += 2 * PADDING;

    // The label template wraps at its content area less its side padding,
    // which a circle and a cylinder draw inside their outline.
    for (let pass = 0; pass < 3; pass++) {
        const { content } = shapeGeometry(shape, width, height);
        const wide = needed.width / content.width;
        const tall =
            needed.height / mermaidLabelHeight(shape, content, row > 0);
        const grow = Math.max(wide, tall);
        if (grow <= 1) break;
        width *= wide > 1 ? wide : 1;
        height *= tall > 1 ? tall : 1;
        if (SQUARE.has(shape)) width = height = Math.max(width, height);
    }
    return { width: Math.ceil(width), height: Math.ceil(height) };
}
