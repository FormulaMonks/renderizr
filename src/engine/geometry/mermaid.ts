/**
 * The sizes a Mermaid diagram draws at (spec: Flowchart and ERD layout), as
 * plain numbers: each node sized from its own label, the way Mermaid sizes
 * it and scaled from Mermaid's 16 px to Renderizr's 24 px, then grown until
 * the label template fits it unwrapped.
 */

import { MERMAID_SCALE, type MermaidShape } from "../../model/index";
import type { MeasureText } from "./boundary";
import type { Size } from "./bounds";
import { LINE_HEIGHT, NAME_SCALE, SIDE_PADDING } from "./label";
import { shapeGeometry } from "./shapes/index";

/** Mermaid's cluster padding, 8 at 16 px, scaled. */
export const MERMAID_GROUP_PADDING = 12;

/** What Mermaid adds to the rank separation inside a subgraph laid out on its own, scaled. */
export const MERMAID_RANK_BONUS = 25 * MERMAID_SCALE;

/** Mermaid's node padding at 16 px: 15 above and below, twice that each side. */
const PADDING = 15 * MERMAID_SCALE;

/** The shapes whose box stays square, as Mermaid draws them. */
const SQUARE: ReadonlySet<MermaidShape> = new Set(["Diamond", "Circle"]);

/** The label's own size: its widest line and its lines' height, as the name draws them. */
export function mermaidLabelSize(
    label: string,
    fontSize: number,
    measure: MeasureText,
): Size {
    const size = fontSize * NAME_SCALE;
    const lines = label.split("\n");
    return {
        width: Math.max(0, ...lines.map((line) => measure(line, size, true))),
        height: lines.length * size * LINE_HEIGHT,
    };
}

/**
 * A node's box: Mermaid's rule for its shape, then as much bigger as the
 * label template needs to hold `label` on its lines. The label plus 30 on
 * each side and 15 above and below (scaled); a diamond's side is the label's
 * width plus its height plus padding (Mermaid's `question.ts`), a circle
 * fits the label's width plus padding (`circle.ts`), a hexagon adds half its
 * height, a cylinder twice the padding for its lids.
 */
export function mermaidNodeSize(
    shape: MermaidShape,
    label: string,
    fontSize: number,
    measure: MeasureText,
): Size {
    const text = mermaidLabelSize(label, fontSize, measure);
    let width = text.width + 4 * PADDING;
    let height = text.height + 2 * PADDING;
    if (shape === "Diamond")
        width = height = text.width + text.height + 2 * PADDING;
    if (shape === "Circle") width = height = text.width + 2 * PADDING;
    if (shape === "Hexagon") width = text.width + 2 * PADDING + height / 2;
    if (shape === "Cylinder") height += 2 * PADDING;

    // The label template wraps at its content area less its side padding,
    // which a circle and a cylinder draw inside their outline.
    for (let pass = 0; pass < 3; pass++) {
        const { content } = shapeGeometry(shape, width, height);
        const wide = (text.width + 2 * SIDE_PADDING) / content.width;
        const tall = text.height / content.height;
        const grow = Math.max(wide, tall);
        if (grow <= 1) break;
        width *= wide > 1 ? wide : 1;
        height *= tall > 1 ? tall : 1;
        if (SQUARE.has(shape)) width = height = Math.max(width, height);
    }
    return { width: Math.ceil(width), height: Math.ceil(height) };
}
