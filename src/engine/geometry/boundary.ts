/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (reposition, createBoundary and createDeploymentNode's minimumWidth and
 * instance count, shapeHasRoundedCorners).
 *
 * Copyright Structurizr. Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Modified by Renderizr: ported to pure functions over numbers and a text
 * measure instead of JointJS cells; 50 padding with no padding view
 * properties; the label band wraps to the box's width, reserving room for an
 * icon on the left and the instance count on the right.
 */

/**
 * Boundary boxes, derived from their children before React renders (spec 8,
 * ADR 9): the bounding box of the children, 50 padding on every side and a
 * label band at the bottom, deepest first. Coordinates stored on a boundary
 * are never read, so the layout editor can rerun this when a child moves.
 *
 * The band's width comes from the children, widened only to `minimumWidth`:
 * the name and metadata wrap within it and the band grows downward. Text is
 * measured by the caller's `MeasureText` (canvas `measureText` in the island,
 * in the same font string the CSS uses), which keeps this module free of the
 * DOM.
 */

import { type Bounds, boundsOf } from "./bounds";
import {
    breakLines,
    LINE_HEIGHT,
    METADATA_SCALE,
    NAME_GAP,
    NAME_SCALE,
} from "./label";
import type { Shape } from "./shapes/types";

/** The width `text` takes at `fontSize`, bold or not, in model units. */
export type MeasureText = (
    text: string,
    fontSize: number,
    bold: boolean,
) => number;

/**
 * A rough `MeasureText` for where there is no canvas to measure with, such
 * as `node --test`: an average glyph of a sans-serif at that size.
 */
export const estimateText: MeasureText = (text, fontSize, bold) =>
    text.length * fontSize * (bold ? 0.6 : 0.55);

/** Space between a boundary's children and its edges, on every side. */
export const BOUNDARY_PADDING = 50;

/** Space between the band's text and the boundary's left, right and bottom edges. */
export const BAND_MARGIN = 15;

/** Space between the text and an icon or instance count beside it. */
export const BAND_GAP = 10;

/** An instance count's font size, as a multiple of the name's. */
export const INSTANCE_SCALE = 2;

/** The corner radius of a boundary in the RoundedBox family (spec 8). */
export const BOUNDARY_RADIUS = 20;

/**
 * The shapes whose boundary has rounded corners (upstream's
 * `shapeHasRoundedCorners`); every other boundary is a square-cornered box.
 */
const ROUNDED_BOUNDARY_SHAPES: readonly Shape[] = [
    "RoundedBox",
    "Folder",
    "WebBrowser",
    "Window",
    "Terminal",
    "Shell",
    "MobileDevicePortrait",
    "MobileDeviceLandscape",
    "Component",
];

/**
 * A boundary is a rectangle whatever shape its style names (spec 8): 20
 * radius corners for the RoundedBox family, square otherwise.
 */
export const boundaryRadius = (shape: string | undefined) =>
    ROUNDED_BOUNDARY_SHAPES.some((rounded) => rounded === shape)
        ? BOUNDARY_RADIUS
        : 0;

/** What a boundary's label band says. */
export type BoundaryLabel = {
    name: string;
    /** Empty when the style hides it (`metadata: false`) or there is none. */
    metadata: string;
    /** The style's `fontSize`; the name is 1.4× and the metadata 0.7× of it. */
    fontSize: number;
    /** Whether the style has an icon, drawn to the left of the text. */
    icon: boolean;
    /** A deployment node's `x<instances>`, from `formatInstanceCount`. */
    instances?: string;
    /**
     * Whether the metadata, like the name, sets the minimum width: true for
     * a deployment node, as upstream sizes one.
     */
    metadataSetsWidth?: boolean;
};

export type BoundaryInput = {
    id: string;
    /** Ids of the elements and boundaries drawn directly inside it. */
    children: string[];
    label: BoundaryLabel;
};

/** Lines of text set at one size, with the top-left of the first line. */
export type TextBlock = Bounds & { lines: string[]; fontSize: number };

/** A boundary's box and its label band; band parts are relative to the box. */
export type DerivedBoundary = Bounds & {
    id: string;
    children: string[];
    /** The band along the bottom, the only part that takes clicks. */
    band: Bounds;
    name: TextBlock;
    metadata?: TextBlock;
    iconBox?: Bounds;
    instances?: TextBlock;
};

/**
 * A deployment node's instance count as the band shows it: `x` and the
 * count exactly as written, ranges included, and nothing for a single one.
 */
export function formatInstanceCount(
    instances: string | number | undefined,
): string | undefined {
    const written = instances === undefined ? "" : String(instances).trim();
    return written === "" || written === "1" ? undefined : `x${written}`;
}

/**
 * `text` broken into lines no wider than `width`: at every newline (real or
 * the literal `\n`, spec 9.3), then between words. A word wider than `width`
 * gets a line of its own.
 */
export function wrapLines(
    text: string,
    width: number,
    fontSize: number,
    bold: boolean,
    measure: MeasureText,
): string[] {
    const lines: string[] = [];
    for (const paragraph of breakLines(text).split("\n")) {
        let line = "";
        for (const word of paragraph.split(" ").filter(Boolean)) {
            const longer = line ? `${line} ${word}` : word;
            if (line && measure(longer, fontSize, bold) > width) {
                lines.push(line);
                line = word;
            } else {
                line = longer;
            }
        }
        lines.push(line);
    }
    return lines;
}

/** The label's sizes and what it reserves beside the text. */
function bandParts(label: BoundaryLabel, measure: MeasureText) {
    const nameSize = label.fontSize * NAME_SCALE;
    const metadataSize = label.fontSize * METADATA_SCALE;
    // Upstream sizes the icon to the name's first line and the metadata.
    const iconSize =
        nameSize * LINE_HEIGHT +
        (label.metadata ? NAME_GAP + metadataSize * LINE_HEIGHT : 0);
    const countSize = nameSize * INSTANCE_SCALE;
    const countWidth = label.instances
        ? measure(label.instances, countSize, true)
        : 0;
    const left = label.icon ? iconSize + BAND_GAP : 0;
    const right = label.instances ? countWidth + BAND_GAP : 0;
    return {
        nameSize,
        metadataSize,
        iconSize,
        countSize,
        countWidth,
        left,
        right,
    };
}

/** The width of the widest line of `text`, broken only at newlines. */
const widestLine = (
    text: string,
    fontSize: number,
    bold: boolean,
    measure: MeasureText,
) =>
    Math.max(
        0,
        ...breakLines(text)
            .split("\n")
            .map((line) => measure(line, fontSize, bold)),
    );

/**
 * The narrowest a boundary can be, spec 8's `minimumWidth` (upstream's
 * `_computedStyle.minimumWidth`): the name unwrapped beside the icon, between
 * the band's margins, and a deployment node's metadata too. Only the
 * instance count and the metadata of other boundaries are left to wrap.
 */
export function minimumWidth(label: BoundaryLabel, measure: MeasureText) {
    const parts = bandParts(label, measure);
    const text = Math.max(
        widestLine(label.name, parts.nameSize, true, measure),
        label.metadataSetsWidth
            ? widestLine(label.metadata, parts.metadataSize, false, measure)
            : 0,
    );
    return 2 * BAND_MARGIN + parts.left + text;
}

/**
 * Lay out the label band of a boundary `width` wide whose band starts at
 * `bandTop` (relative to the box), where its padded children end: the text wraps between the icon on the left
 * and the instance count on the right, and everything sits on the band's
 * bottom margin.
 */
function layoutBand(
    label: BoundaryLabel,
    width: number,
    bandTop: number,
    measure: MeasureText,
) {
    const parts = bandParts(label, measure);
    const textWidth = Math.max(
        0,
        width - 2 * BAND_MARGIN - parts.left - parts.right,
    );
    const nameLines = wrapLines(
        label.name,
        textWidth,
        parts.nameSize,
        true,
        measure,
    );
    // Metadata never breaks at a newline (spec 9.3), only between words.
    const metadataLines = label.metadata
        ? wrapLines(
              label.metadata.replace(/\n/g, " "),
              textWidth,
              parts.metadataSize,
              false,
              measure,
          )
        : [];
    const nameHeight = nameLines.length * parts.nameSize * LINE_HEIGHT;
    const metadataHeight = metadataLines.length
        ? NAME_GAP + metadataLines.length * parts.metadataSize * LINE_HEIGHT
        : 0;
    const textHeight = nameHeight + metadataHeight;
    const countHeight = label.instances ? parts.countSize * LINE_HEIGHT : 0;
    const content = Math.max(
        textHeight,
        label.icon ? parts.iconSize : 0,
        countHeight,
    );
    const bottom = bandTop + content;
    const textX = BAND_MARGIN + parts.left;
    const textY = bottom - textHeight;

    const name: TextBlock = {
        x: textX,
        y: textY,
        width: textWidth,
        height: nameHeight,
        lines: nameLines,
        fontSize: parts.nameSize,
    };
    const metadata: TextBlock | undefined = metadataLines.length
        ? {
              x: textX,
              y: textY + nameHeight + NAME_GAP,
              width: textWidth,
              height: metadataHeight - NAME_GAP,
              lines: metadataLines,
              fontSize: parts.metadataSize,
          }
        : undefined;
    const icon: Bounds | undefined = label.icon
        ? {
              x: BAND_MARGIN,
              y: bottom - parts.iconSize,
              width: parts.iconSize,
              height: parts.iconSize,
          }
        : undefined;
    const instances: TextBlock | undefined = label.instances
        ? {
              x: width - BAND_MARGIN - parts.countWidth,
              y: bottom - countHeight,
              width: parts.countWidth,
              height: countHeight,
              lines: [label.instances],
              fontSize: parts.countSize,
          }
        : undefined;

    return {
        band: { x: 0, y: bandTop, width, height: content + BAND_MARGIN },
        name,
        ...(metadata && { metadata }),
        ...(icon && { iconBox: icon }),
        ...(instances && { instances }),
    };
}

/**
 * Derive every boundary's box from the drawn `elements`, deepest first: a
 * boundary inside another is derived before it, and its box is one of the
 * outer one's children. A boundary none of whose children are drawn is left
 * out. Children never move.
 */
export function deriveBoundaries(
    boundaries: BoundaryInput[],
    elements: ReadonlyMap<string, Bounds>,
    measure: MeasureText,
): DerivedBoundary[] {
    const inputs = new Map(boundaries.map((b) => [b.id, b]));
    const derived = new Map<string, DerivedBoundary | null>();

    const derive = (input: BoundaryInput): DerivedBoundary | null => {
        const known = derived.get(input.id);
        if (known !== undefined) return known;
        derived.set(input.id, null);
        const boxes: Bounds[] = [];
        for (const id of input.children) {
            const inner = inputs.get(id);
            const box = inner ? derive(inner) : elements.get(id);
            if (box) boxes.push(box);
        }
        const around = boundsOf(boxes);
        if (!around) return null;

        const width = Math.max(
            around.width + 2 * BOUNDARY_PADDING,
            minimumWidth(input.label, measure),
        );
        const bandTop = around.height + 2 * BOUNDARY_PADDING;
        const band = layoutBand(input.label, width, bandTop, measure);
        const boundary: DerivedBoundary = {
            id: input.id,
            children: input.children,
            x: around.x - BOUNDARY_PADDING,
            y: around.y - BOUNDARY_PADDING,
            width,
            height: bandTop + band.band.height,
            ...band,
        };
        derived.set(input.id, boundary);
        return boundary;
    };

    const result: DerivedBoundary[] = [];
    for (const input of boundaries) {
        const boundary = derive(input);
        if (boundary) result.push(boundary);
    }
    return result;
}

/**
 * Where a deployment node drawn as an element shows its instance count:
 * bottom-right inside its `content` area, at twice the name size.
 */
export function placeInstanceCount(
    content: Bounds,
    fontSize: number,
    text: string,
    measure: MeasureText,
): TextBlock {
    const size = fontSize * NAME_SCALE * INSTANCE_SCALE;
    const width = measure(text, size, true);
    const height = size * LINE_HEIGHT;
    return {
        x: content.x + content.width - BAND_MARGIN - width,
        y: content.y + content.height - BAND_MARGIN - height,
        width,
        height,
        lines: [text],
        fontSize: size,
    };
}

/**
 * How tall the label may grow, centered in the whole `content` area, and
 * still end above the instance `count` in its bottom-right corner. The area
 * keeps its size, so a label short enough sits where it would without a
 * count; only one tall enough to reach the count's rows loses description
 * lines (spec 8: the count's area is reserved).
 */
export function labelHeightClearOf(content: Bounds, count: TextBlock) {
    const reserved = content.y + content.height - count.y;
    return Math.max(0, content.height - 2 * reserved);
}
