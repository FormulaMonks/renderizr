/**
 * The label template every element carries (spec 9.1 to 9.3), as plain
 * numbers: how its text breaks, how wide its text column is, and how much of
 * it fits a content area that never grows. The island measures the fixed
 * parts and asks `fitLabel` what to keep; nothing here touches the DOM.
 */

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

const ICON_POSITIONS: readonly IconPosition[] = ["Top", "Bottom", "Left"];

/** A style's `iconPosition`, with anything unrecognized drawn as `Bottom`. */
export const iconPositionOf = (value: string): IconPosition =>
    ICON_POSITIONS.find((position) => position === value) ?? "Bottom";

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
    const inset = icon && iconPosition === "Left" ? ICON_LEFT_INSET : 0;
    return Math.max(0, width - 2 * SIDE_PADDING - inset);
}

export type LabelMeasure = {
    /** The content area's height. */
    height: number;
    fontSize: number;
    iconPosition: IconPosition;
    /** Whether the icon is drawn in the layout the heights were measured in. */
    icon: boolean;
    /** The name's rendered height. */
    name: number;
    /** The metadata's rendered height; `undefined` when there is none. */
    metadata?: number;
    /** Whether there is a description to place. */
    description: boolean;
};

export type LabelFit = {
    /** Whether the icon is kept. */
    icon: boolean;
    /** Whole description lines that fit; 0 leaves the description out. */
    descriptionLines: number;
    /** Name and metadata are taller than the content area on their own. */
    overflows: boolean;
};

/** Height the icon adds to the column when it sits at `position`. */
const iconHeight = (position: IconPosition) =>
    position === "Top"
        ? ICON_SIZE + ICON_TOP_GAP
        : position === "Bottom"
          ? ICON_SIZE + ICON_BOTTOM_GAP
          : 0;

/**
 * What of the label fits its content area (spec 9.1). Icon, name and
 * metadata are fixed parts; when they overflow, the icon goes first, and if
 * name and metadata still overflow they are reported. The description gets
 * the whole lines left after them, and is clamped there with an ellipsis.
 *
 * A Left icon narrows the text column, so a caller that is told to drop it
 * measures again without it before trusting `overflows`.
 */
export function fitLabel(measure: LabelMeasure): LabelFit {
    const { height, fontSize, iconPosition } = measure;
    const text =
        measure.name +
        (measure.metadata === undefined ? 0 : NAME_GAP + measure.metadata);
    const withIcon =
        iconPosition === "Left"
            ? Math.max(ICON_SIZE, text)
            : text + iconHeight(iconPosition);
    const icon = measure.icon && withIcon <= height;
    const fixed = icon && iconPosition !== "Left" ? withIcon : text;
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
