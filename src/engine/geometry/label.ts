/**
 * The label template every element carries (spec 9.1 to 9.3), as plain
 * numbers: how its text breaks, how wide its text column is, and how much of
 * it fits a content area that never grows. The island measures the fixed
 * parts and asks `fitLabel` what to keep; nothing here touches the DOM.
 */

import {
    INDICATOR_INSET,
    INDICATOR_MARGIN,
    INDICATOR_SIZE,
} from "./indicators";

/** Where an element's icon sits relative to its text. */
export type IconPosition = "Top" | "Bottom" | "Left";

/** Line height of every part, as a multiple of its font size. */
export const LINE_HEIGHT = 1.2;

/** The name's font size, as a multiple of the element's `fontSize`. */
export const NAME_SCALE = 1.4;

/** The metadata's font size, as a multiple of the element's `fontSize`. */
export const METADATA_SCALE = 0.7;

/** Space between the name and the metadata below it. */
export const NAME_GAP = 8;

/** Space above the description. */
export const DESCRIPTION_GAP = 15;

/** Space left and right of the text inside the content area. */
export const SIDE_PADDING = 30;

/** An icon's height when Top or Bottom, and its width when Left. */
export const ICON_SIZE = 60;

/** Space between a Top icon and the name. */
export const ICON_TOP_GAP = 10;

/** Space between the last text and a Bottom icon. */
export const ICON_BOTTOM_GAP = 15;

/** How much a Left icon narrows the text column: the icon and its gap. */
export const ICON_LEFT_INSET = 75;

/** How an icon at one position sits in the label template (spec 9.2). */
export type IconLayout = {
    /** In a row beside the text, rather than in the column above or below it. */
    beside: boolean;
    /** Drawn after the text rather than before it. */
    after: boolean;
    /** Height the icon and its gap add to the column; 0 beside the text. */
    height: number;
    /** How much the icon narrows the text column. */
    inset: number;
    /** The icon's margins, which make the gap between it and the text. */
    margin: { top: number; bottom: number; right: number };
};

/** Every icon position's layout: the one place the three are told apart. */
export const ICON_LAYOUTS: Record<IconPosition, IconLayout> = {
    Top: {
        beside: false,
        after: false,
        height: ICON_SIZE + ICON_TOP_GAP,
        inset: 0,
        margin: { top: 0, bottom: ICON_TOP_GAP, right: 0 },
    },
    Bottom: {
        beside: false,
        after: true,
        height: ICON_SIZE + ICON_BOTTOM_GAP,
        inset: 0,
        margin: { top: ICON_BOTTOM_GAP, bottom: 0, right: 0 },
    },
    Left: {
        beside: true,
        after: false,
        height: 0,
        inset: ICON_LEFT_INSET,
        margin: { top: 0, bottom: 0, right: ICON_LEFT_INSET - ICON_SIZE },
    },
};

const isIconPosition = (value: string): value is IconPosition =>
    Object.hasOwn(ICON_LAYOUTS, value);

/** A style's `iconPosition`, with anything unrecognized drawn as `Bottom`. */
export function iconPositionOf(value: string): IconPosition {
    return isIconPosition(value) ? value : "Bottom";
}

/**
 * Names and descriptions break on a real newline and on the literal two
 * characters `\n` (spec 9.3). The stored string is left alone, so matching
 * by name is unaffected.
 */
export const breakLines = (text: string) => text.replace(/\\n/g, "\n");

/**
 * The element's full label text, for its accessible name and hover title,
 * which carry everything clamping may hide. Metadata never breaks.
 */
export function labelText(
    name: string,
    metadata: string,
    description: string,
): string {
    return [breakLines(name), metadata, breakLines(description)]
        .filter(Boolean)
        .join("\n");
}

/** The width the text wraps at inside a content area `width` wide. */
export function textWidth(
    width: number,
    iconPosition: IconPosition,
    icon: boolean,
): number {
    const inset = icon ? ICON_LAYOUTS[iconPosition].inset : 0;
    return Math.max(0, width - 2 * SIDE_PADDING - inset);
}

/** The rendered heights of the fixed text parts at one text width. */
export type FixedHeights = {
    /** The name's rendered height. */
    name: number;
    /** The metadata's rendered height; `undefined` when there is none. */
    metadata?: number;
};

export type LabelMeasure = FixedHeights & {
    /** The content area's height. */
    height: number;
    fontSize: number;
    iconPosition: IconPosition;
    /**
     * The fixed parts measured at the text width the icon leaves, whether or
     * not the icon is drawn now; `undefined` when the element has no icon.
     * Judging the icon by these alone is what lets a dropped icon come back
     * once the fixed parts shrink, after a late web font (spec 9.5).
     */
    withIcon?: FixedHeights;
    /** Whether there is a description to place. */
    description: boolean;
    /**
     * Whether the element draws an indicator row, a fixed part at the bottom
     * of the content area, above a Bottom icon (spec 9.2).
     */
    indicators?: boolean;
};

export type LabelFit = {
    /** Whether the icon is kept. */
    icon: boolean;
    /** Whole description lines that fit; 0 leaves the description out. */
    descriptionLines: number;
    /** Name and metadata are taller than the content area on their own. */
    overflows: boolean;
};

/** Height of the name and the metadata under it. */
const textHeight = ({ name, metadata }: FixedHeights) =>
    name + (metadata === undefined ? 0 : NAME_GAP + metadata);

/** The height an indicator row, its margin and its inset take from a label. */
export const INDICATOR_ROW_HEIGHT =
    INDICATOR_SIZE + INDICATOR_MARGIN + INDICATOR_INSET;

/**
 * What of the label fits its content area (spec 9.1). Icon, name, metadata
 * and the indicator row are fixed parts; when they overflow, the icon goes
 * first, and if name and metadata still overflow they are reported. The
 * description gets the whole lines left after them, and is clamped there
 * with an ellipsis.
 *
 * Lines and overflow are worked out from the heights as drawn now. A Left
 * icon narrows the text column, so when the icon kept differs from the one
 * drawn, the caller draws it that way and measures again.
 */
export function fitLabel(measure: LabelMeasure): LabelFit {
    const { fontSize, iconPosition, withIcon } = measure;
    const row = measure.indicators ? INDICATOR_ROW_HEIGHT : 0;
    // The row sits below everything else, so the rest fits what is left.
    const height = measure.height - row;
    const layout = ICON_LAYOUTS[iconPosition];
    const icon =
        withIcon !== undefined &&
        (layout.beside
            ? Math.max(ICON_SIZE, textHeight(withIcon))
            : textHeight(withIcon) + layout.height) <= height;
    const text = textHeight(measure);
    const fixed = text + (icon ? layout.height : 0);
    const room = height - fixed - DESCRIPTION_GAP;
    // A hair of slack so a description that fits exactly is not cut by
    // floating-point noise in the measured heights.
    const lines = Math.floor((room + 1e-6) / (fontSize * LINE_HEIGHT));

    return {
        icon,
        descriptionLines: measure.description ? Math.max(0, lines) : 0,
        overflows: text > height,
    };
}
