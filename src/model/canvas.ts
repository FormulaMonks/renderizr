/**
 * The canvas (glossary, spec 14): the area a view's `dimensions` set, which
 * frames an export and which edit mode draws behind the view. A view without
 * `dimensions` gets the frame Structurizr Local would give it.
 */

import type { Dimensions, EditedLayout } from "./edited-layout";
import type { ModelView } from "./types";

/**
 * Structurizr's paper sizes in pixels, as its `PaperSize` enum defines them
 * (`structurizr-core`, `com.structurizr.view.PaperSize`).
 */
export const PAPER_SIZES: Readonly<Record<string, Dimensions>> = {
    A6_Portrait: { width: 1240, height: 1748 },
    A6_Landscape: { width: 1748, height: 1240 },
    A5_Portrait: { width: 1748, height: 2480 },
    A5_Landscape: { width: 2480, height: 1748 },
    A4_Portrait: { width: 2480, height: 3508 },
    A4_Landscape: { width: 3508, height: 2480 },
    A3_Portrait: { width: 3508, height: 4961 },
    A3_Landscape: { width: 4961, height: 3508 },
    A2_Portrait: { width: 4961, height: 7016 },
    A2_Landscape: { width: 7016, height: 4961 },
    A1_Portrait: { width: 7016, height: 9933 },
    A1_Landscape: { width: 9933, height: 7016 },
    A0_Portrait: { width: 9933, height: 14043 },
    A0_Landscape: { width: 14043, height: 9933 },
    Letter_Portrait: { width: 2550, height: 3300 },
    Letter_Landscape: { width: 3300, height: 2550 },
    Legal_Portrait: { width: 2550, height: 4200 },
    Legal_Landscape: { width: 4200, height: 2550 },
    Slide_4_3: { width: 3306, height: 2480 },
    Slide_16_9: { width: 3508, height: 1973 },
    Slide_16_10: { width: 3508, height: 2193 },
};

/** The side of the canvas of a view with neither dimensions nor paper size. */
export const DEFAULT_CANVAS_SIDE = 2000;

/** A side shorter than this shows as `DEFAULT_CANVAS_SIDE`, as in Structurizr Local. */
export const MIN_CANVAS_SIDE = 500;

const isDimensions = (value: unknown): value is Dimensions =>
    typeof value === "object" &&
    value !== null &&
    Number.isFinite((value as Dimensions).width) &&
    Number.isFinite((value as Dimensions).height);

const side = (value: number) =>
    value < MIN_CANVAS_SIDE ? DEFAULT_CANVAS_SIDE : Math.trunc(value);

/**
 * The canvas `view` shows, with its `edited` layout laid over it: its
 * `dimensions`, else its paper size, else 2000 × 2000, and any side under
 * 500 as 2000.
 */
export function canvasOf(view: ModelView, edited?: EditedLayout): Dimensions {
    const paperSize =
        edited?.paperSize !== undefined ? edited.paperSize : view.paperSize;
    const dimensions =
        edited?.dimensions ??
        (isDimensions(view.dimensions) ? view.dimensions : undefined) ??
        (typeof paperSize === "string" ? PAPER_SIZES[paperSize] : undefined);
    if (!dimensions)
        return { width: DEFAULT_CANVAS_SIDE, height: DEFAULT_CANVAS_SIDE };
    return { width: side(dimensions.width), height: side(dimensions.height) };
}
