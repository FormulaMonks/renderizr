/**
 * An edge's label as plain numbers (spec 10.8): what it says, the lines it
 * wraps into at the style's `width` and how big they make it, and where
 * along the route it sits. The island draws exactly these lines, so the
 * label drawn is the box placement kept clear.
 * Placement runs over the whole view in view order, so each label can keep
 * clear of the elements, the boundary label bands and the labels placed
 * before it. Text is measured by the caller's `MeasureText`, as boundary
 * bands are, which keeps this module free of the DOM (ADR 8).
 */

import { type MeasureText, wrapLines } from "./boundary";
import type { Bounds, Size } from "./bounds";
import { INDICATOR_GAP, INDICATOR_SIZE, indicatorRowWidth } from "./indicators";
import { LINE_HEIGHT, METADATA_SCALE } from "./label";
import { pointAlong } from "./routing/path";
import type { Point } from "./shapes/types";

/** Space between the label's text and the edge of its backing. */
export const EDGE_LABEL_PADDING = 4;

/** Space between the description and the technology below it (upstream's). */
export const TECHNOLOGY_GAP = 10;

/** How far a label moves along its route per try, in percent. */
const POSITION_STEP = 5;

/** The earliest a searching label goes along its route, in percent. */
const FIRST_POSITION = 10;

/** The latest a searching label goes along its route, in percent. */
const LAST_POSITION = 90;

/** What an edge's label says, each part empty when hidden. */
export type EdgeLabelText = {
    /** With its order prefixed in a dynamic view; breaks like an element's. */
    description: string;
    /** In the workspace's metadata symbols; never breaks (spec 9.3). */
    technology: string;
};

/**
 * The label's two parts. In a dynamic view the description is prefixed
 * `order: `, and the order shows alone when there is no description to show,
 * so a step without one can still be told apart.
 */
export function edgeLabelText(parts: {
    description: string;
    technology: string;
    order?: string;
}): EdgeLabelText {
    const { description, technology, order } = parts;
    if (order === undefined) return { description, technology };
    return {
        description: description ? `${order}: ${description}` : order,
        technology,
    };
}

/** A label wrapped into lines, and the size of its backing. */
export type EdgeLabelLayout = {
    /** At the style's `fontSize`. */
    description: string[];
    /** At the metadata size, below the description. */
    technology: string[];
    size: Size;
    /**
     * The indicator row after the text, relative to the backing's top-left;
     * absent when the relationship has no targets (spec 10.9).
     */
    indicators?: Bounds;
};

/**
 * Metadata wrapped between words only: any whitespace, a newline included,
 * runs on as a space, and the literal `\n` stays as written (spec 9.3).
 */
function wrapMetadata(
    text: string,
    width: number,
    fontSize: number,
    measure: MeasureText,
): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const longer = line ? `${line} ${word}` : word;
        if (line && measure(longer, fontSize, false) > width) {
            lines.push(line);
            line = word;
        } else {
            line = longer;
        }
    }
    return line ? [...lines, line] : lines;
}

/**
 * The label's lines wrapped at `width`, the description at `fontSize`
 * (breaking at newlines like an element's) and the technology at the
 * metadata size below it, and its backing: the widest line and every line's
 * height, plus padding all round. `indicators` glyphs follow the text, which
 * wraps short of them; with no text they are the whole label (spec 10.9).
 * `undefined` for a label that says nothing and has no glyphs.
 */
export function layoutEdgeLabel(
    text: EdgeLabelText,
    fontSize: number,
    labelWidth: number,
    measure: MeasureText,
    indicators = 0,
): EdgeLabelLayout | undefined {
    const row = indicatorRowWidth(indicators);
    const width =
        row > 0 ? Math.max(0, labelWidth - row - INDICATOR_GAP) : labelWidth;
    const metadataSize = fontSize * METADATA_SCALE;
    const description = text.description
        ? wrapLines(text.description, width, fontSize, false, measure)
        : [];
    const technology = wrapMetadata(
        text.technology,
        width,
        metadataSize,
        measure,
    );
    const says = description.length > 0 || technology.length > 0;
    if (!says && row === 0) return undefined;
    // Unclamped: a word wider than `width` is drawn whole on its own line.
    const widest = Math.max(
        0,
        ...description.map((line) => measure(line, fontSize, false)),
        ...technology.map((line) => measure(line, metadataSize, false)),
    );
    const textHeight =
        description.length * fontSize * LINE_HEIGHT +
        (description.length && technology.length ? TECHNOLOGY_GAP : 0) +
        technology.length * metadataSize * LINE_HEIGHT;
    const gap = says && row > 0 ? INDICATOR_GAP : 0;
    const height =
        Math.max(textHeight, row > 0 ? INDICATOR_SIZE : 0) +
        2 * EDGE_LABEL_PADDING;
    return {
        description,
        technology,
        size: {
            width: widest + gap + row + 2 * EDGE_LABEL_PADDING,
            height,
        },
        ...(row > 0 && {
            indicators: {
                x: EDGE_LABEL_PADDING + widest + gap,
                y: (height - INDICATOR_SIZE) / 2,
                width: row,
                height: INDICATOR_SIZE,
            },
        }),
    };
}

/**
 * How much wider than the style's wrap width upstream reserves an edge's
 * label in an automatic layout.
 */
const LAYOUT_WIDTH_SCALE = 1.2;

/**
 * How tall upstream counts `lines` lines of text at `fontSize` when it sizes
 * a label for Dagre: the first line at the font size, each further one at
 * the line height.
 */
const upstreamHeight = (lines: number, fontSize: number) =>
    lines ? fontSize + (lines - 1) * fontSize * LINE_HEIGHT : 0;

/**
 * The room an automatic layout keeps for an edge's label (spec 7.1), sized
 * the way upstream sizes it for Dagre: 1.2 times the style's wrap `width`
 * whatever the label says, and the height of its lines as upstream counts
 * them, without the backing's padding, or none when it says nothing.
 */
export function layoutLabelRoom(
    label: EdgeLabelLayout | undefined,
    fontSize: number,
    width: number,
): Size {
    const technology = label?.technology.length ?? 0;
    return {
        width: width * LAYOUT_WIDTH_SCALE,
        height:
            upstreamHeight(label?.description.length ?? 0, fontSize) +
            (technology
                ? TECHNOLOGY_GAP +
                  upstreamHeight(technology, fontSize * METADATA_SCALE)
                : 0),
    };
}

/**
 * The positions a label tries, in order: `start` (clamped to 10–90), then
 * 5% steps alternately later and earlier, each within 10–90.
 */
export function labelPositions(start: number): number[] {
    const first = Math.min(LAST_POSITION, Math.max(FIRST_POSITION, start));
    const positions = [first];
    for (let step = POSITION_STEP; ; step += POSITION_STEP) {
        const later = first + step;
        const earlier = first - step;
        if (later > LAST_POSITION && earlier < FIRST_POSITION) break;
        if (later <= LAST_POSITION) positions.push(later);
        if (earlier >= FIRST_POSITION) positions.push(earlier);
    }
    return positions;
}

/** One edge's label as placement sees it. */
export type LabelPlacementInput = {
    /** The edge's final route, source first. */
    route: Point[];
    /** From `layoutEdgeLabel`; `undefined` when the label says nothing. */
    size: Size | undefined;
    /** Percent along the route: the view's, then the style's. */
    position: number;
    /** Whether the view stores the position, which is then never nudged. */
    stored: boolean;
};

/** Where a label landed: its position and its backing's box. */
export type PlacedLabel = { position: number; box: Bounds };

/** Whether two boxes share any area; touching edges do not count. */
const overlaps = (a: Bounds, b: Bounds) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

/** The label's box centered on the route `position` percent along it. */
function boxAt(route: Point[], size: Size, position: number): Bounds {
    const center = pointAlong(route, position / 100);
    return {
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
        width: size.width,
        height: size.height,
    };
}

/**
 * Place every label of a view in view order. A label with a stored position
 * stays there; any other takes the first of `labelPositions` whose box
 * overlaps none of `obstacles` (the elements and boundary label bands) and
 * no label already placed, or its starting position if none is clear.
 */
export function placeEdgeLabels(
    labels: LabelPlacementInput[],
    obstacles: Bounds[],
): (PlacedLabel | undefined)[] {
    const placed: Bounds[] = [];
    return labels.map(({ route, size, position, stored }) => {
        if (!size) return undefined;
        const clear = (box: Bounds) =>
            !obstacles.some((o) => overlaps(box, o)) &&
            !placed.some((o) => overlaps(box, o));
        const found = stored
            ? position
            : labelPositions(position).find((p) =>
                  clear(boxAt(route, size, p)),
              ) ?? position;
        const box = boxAt(route, size, found);
        placed.push(box);
        return { position: found, box };
    });
}
