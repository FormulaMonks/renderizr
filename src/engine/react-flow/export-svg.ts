/**
 * PROTOTYPE (#160): a standalone SVG of one view as drawn, built from the
 * graph's geometry rather than from the DOM. Labels are `<text>` lines broken
 * here, never `<foreignObject>`, which taints a canvas in Safari.
 *
 * Pure: the caller hands in a text measure and the font's vertical metrics,
 * so it runs under `node --test`.
 */

import type { Bounds } from "../geometry/bounds";
import type { MeasureText, TextBlock } from "../geometry/boundary";
import { wrapLines } from "../geometry/boundary";
import { EDGE_LABEL_PADDING, TECHNOLOGY_GAP } from "../geometry/edge-label";
import {
    INDICATOR_GAP,
    INDICATOR_INSET,
    INDICATOR_MARGIN,
    INDICATOR_SIZE,
    indicatorKinds,
    indicatorRowWidth,
} from "../geometry/indicators";
import {
    breakLines,
    DESCRIPTION_GAP,
    fitLabel,
    ICON_LAYOUTS,
    ICON_SIZE,
    LINE_HEIGHT,
    METADATA_SCALE,
    NAME_GAP,
    NAME_SCALE,
    SIDE_PADDING,
    textWidth,
} from "../geometry/label";
import { lineDashes } from "../geometry/line";
import { borderDashes, paintPart } from "../geometry/paint";
import type { TargetKind } from "../../model/index";
import { PRESENCE_OPACITY, type StepState } from "./animation";
import type { BoundaryBox, EdgeLine, ElementBox, Graph } from "./graph";

/** What the serializer needs to set text the way CSS does. */
export type TextSetting = {
    measure: MeasureText;
    /** The font's ascent and descent, as multiples of the font size. */
    ascent: number;
    descent: number;
    /** The CSS `font-family` the diagram is drawn in. */
    family: string;
    /** `@font-face` rules to embed, with `data:` sources. */
    fontFaces: string;
};

export type ExportInput = {
    graph: Graph;
    /** The step shown, or undefined for the full view. */
    step?: StepState;
    /** The canvas that frames the export, in model units. */
    frame: Bounds;
    text: TextSetting;
};

/** The same glyphs the island strokes (island.tsx `GLYPHS`). */
const GLYPHS: Record<TargetKind, string[]> = {
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
    link: ["M11 3h6v6", "M17 3l-8 8", "M15 12v5h-12v-12h5"],
};

const escapeXml = (text: string) =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const n = (value: number) => String(Math.round(value * 100) / 100);

/** SVG attributes from a record, dropping the undefined ones. */
const attrs = (record: Record<string, string | number | undefined>) =>
    Object.entries(record)
        .flatMap(([key, value]) =>
            value === undefined
                ? []
                : [
                      `${key}="${escapeXml(typeof value === "number" ? n(value) : value)}"`,
                  ],
        )
        .join(" ");

/** A block of lines set like CSS: each in a line box `LINE_HEIGHT` tall. */
type Lines = {
    lines: string[];
    fontSize: number;
    bold?: boolean;
    /** Left edge and width of the column the lines align in. */
    x: number;
    width: number;
    /** Top of the first line box. */
    y: number;
    align: "start" | "middle";
    color: string;
    opacity?: number;
};

function textLines(block: Lines, text: TextSetting): string {
    const { fontSize } = block;
    const box = fontSize * LINE_HEIGHT;
    // CSS centers the font's content area (ascent + descent) in the line box.
    const baseline =
        (box - (text.ascent + text.descent) * fontSize) / 2 +
        text.ascent * fontSize;
    const x = block.align === "middle" ? block.x + block.width / 2 : block.x;
    return block.lines
        .map((line, index) =>
            line === ""
                ? ""
                : `<text ${attrs({
                      x,
                      y: block.y + index * box + baseline,
                      "font-size": fontSize,
                      "font-weight": block.bold ? "bold" : undefined,
                      "text-anchor": block.align,
                      fill: block.color,
                      "fill-opacity": block.opacity,
                  })}>${escapeXml(line)}</text>`,
        )
        .join("");
}

/**
 * `text` wrapped at `width` the way CSS `overflow-wrap: break-word` does:
 * between words, and inside a word that is wider than the column.
 */
function wrap(
    text: string,
    width: number,
    fontSize: number,
    bold: boolean,
    measure: MeasureText,
): string[] {
    return wrapLines(text, width, fontSize, bold, measure).flatMap((line) => {
        if (measure(line, fontSize, bold) <= width) return [line];
        const pieces: string[] = [];
        let piece = "";
        for (const char of line) {
            if (piece && measure(piece + char, fontSize, bold) > width) {
                pieces.push(piece);
                piece = char.trimStart();
            } else piece += char;
        }
        return [...pieces, piece];
    });
}

/** The first `count` lines, the last ending in an ellipsis if any were cut. */
function clamp(
    lines: string[],
    count: number,
    width: number,
    fontSize: number,
    measure: MeasureText,
): string[] {
    if (lines.length <= count) return lines;
    const kept = lines.slice(0, count);
    let last = kept[count - 1] ?? "";
    while (last && measure(`${last}…`, fontSize, false) > width)
        last = last.slice(0, -1);
    kept[count - 1] = `${last.trimEnd()}…`;
    return kept;
}

function indicatorRow(
    targets: TargetKind[],
    x: number,
    y: number,
    color: string,
): string {
    return indicatorKinds(targets)
        .map((kind, index) => {
            const left = x + index * (INDICATOR_SIZE + INDICATOR_GAP);
            const scale = INDICATOR_SIZE / 20;
            return `<g transform="translate(${n(left)} ${n(y)}) scale(${scale})" fill="none" stroke="${escapeXml(color)}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[
                kind
            ]
                .map((d) => `<path d="${d}"/>`)
                .join("")}</g>`;
        })
        .join("");
}

const image = (href: string, box: Bounds) =>
    `<image ${attrs({ href, x: box.x, y: box.y, width: box.width, height: box.height, preserveAspectRatio: "xMidYMid meet" })}/>`;

/** One element's label template (spec 9.2), as the island lays it out. */
function elementLabel(element: ElementBox, text: TextSetting): string {
    const { measure } = text;
    const { fontSize, iconPosition, color, targets } = element;
    const content = {
        x: element.x + element.content.x,
        y: element.y + element.content.y,
        width: element.content.width,
        height: element.content.height,
    };
    const layout = ICON_LAYOUTS[iconPosition];
    const indicators = targets.length > 0;
    const nameSize = fontSize * NAME_SCALE;
    const metadataSize = fontSize * METADATA_SCALE;
    const metadataText = element.metadata.replace(/\s+/g, " ");

    const fixedAt = (width: number) => {
        const name = wrap(
            breakLines(element.name),
            width,
            nameSize,
            true,
            measure,
        );
        const metadata = metadataText
            ? wrap(metadataText, width, metadataSize, false, measure)
            : [];
        return {
            name,
            metadata,
            heights: {
                name: name.length * nameSize * LINE_HEIGHT,
                metadata: metadataText
                    ? metadata.length * metadataSize * LINE_HEIGHT
                    : undefined,
            },
        };
    };
    const fitAt = (showIcon: boolean) => {
        const drawn = fixedAt(textWidth(content.width, iconPosition, showIcon));
        const withIcon = element.icon
            ? fixedAt(textWidth(content.width, iconPosition, true)).heights
            : undefined;
        return {
            drawn,
            fit: fitLabel({
                height: element.labelHeight,
                fontSize,
                iconPosition,
                ...drawn.heights,
                withIcon,
                description: Boolean(element.description),
                indicators,
            }),
        };
    };
    // The island draws the icon first and drops it if it doesn't fit; a Left
    // icon changes the text width, so it measures again without it.
    let { drawn, fit } = fitAt(Boolean(element.icon));
    if (fit.icon !== Boolean(element.icon)) ({ drawn, fit } = fitAt(fit.icon));

    const showIcon = fit.icon && Boolean(element.icon);
    const width = textWidth(content.width, iconPosition, showIcon);
    const description =
        element.description && fit.descriptionLines > 0
            ? clamp(
                  wrap(
                      breakLines(element.description),
                      width,
                      fontSize,
                      false,
                      measure,
                  ),
                  fit.descriptionLines,
                  width,
                  fontSize,
                  measure,
              )
            : [];

    const textHeight =
        drawn.heights.name +
        (drawn.heights.metadata === undefined
            ? 0
            : NAME_GAP + drawn.heights.metadata) +
        (description.length
            ? DESCRIPTION_GAP + description.length * fontSize * LINE_HEIGHT
            : 0);

    // The indicator row, and a Bottom icon below it, sit at the bottom of the
    // content area; the rest is centered in what is left.
    const iconLast = showIcon && layout.after;
    const bottomBlock = indicators
        ? INDICATOR_MARGIN +
          INDICATOR_SIZE +
          (iconLast ? layout.margin.top + ICON_SIZE : 0) +
          INDICATOR_INSET
        : 0;
    const main = {
        x: content.x + SIDE_PADDING,
        y: content.y,
        width: content.width - 2 * SIDE_PADDING,
        height: content.height - bottomBlock,
    };
    const parts: string[] = [];
    let columnX = main.x + (main.width - width) / 2;
    let top: number;

    if (showIcon && layout.beside) {
        const row = ICON_SIZE + layout.margin.right + width;
        const left = main.x + (main.width - row) / 2;
        parts.push(
            image(element.icon as string, {
                x: left,
                y: main.y + (main.height - ICON_SIZE) / 2,
                width: ICON_SIZE,
                height: ICON_SIZE,
            }),
        );
        columnX = left + ICON_SIZE + layout.margin.right;
        top = main.y + (main.height - textHeight) / 2;
    } else {
        const before = showIcon && !layout.after ? layout.height : 0;
        const after = iconLast && !indicators ? layout.height : 0;
        const stack = before + textHeight + after;
        const stackTop = main.y + (main.height - stack) / 2;
        if (before)
            parts.push(
                image(element.icon as string, {
                    x: main.x,
                    y: stackTop,
                    width: main.width,
                    height: ICON_SIZE,
                }),
            );
        if (after)
            parts.push(
                image(element.icon as string, {
                    x: main.x,
                    y: stackTop + before + textHeight + layout.margin.top,
                    width: main.width,
                    height: ICON_SIZE,
                }),
            );
        top = stackTop + before;
    }

    const column = { x: columnX, width, align: "middle" as const, color };
    parts.push(
        textLines(
            {
                ...column,
                lines: drawn.name,
                fontSize: nameSize,
                bold: true,
                y: top,
            },
            text,
        ),
    );
    top += drawn.heights.name;
    if (drawn.heights.metadata !== undefined) {
        top += NAME_GAP;
        parts.push(
            textLines(
                {
                    ...column,
                    lines: drawn.metadata,
                    fontSize: metadataSize,
                    y: top,
                },
                text,
            ),
        );
        top += drawn.heights.metadata;
    }
    if (description.length) {
        top += DESCRIPTION_GAP;
        parts.push(
            textLines(
                { ...column, lines: description, fontSize, y: top },
                text,
            ),
        );
    }

    if (indicators) {
        const rowWidth = indicatorRowWidth(indicatorKinds(targets).length);
        const rowTop =
            content.y + content.height - bottomBlock + INDICATOR_MARGIN;
        parts.push(
            indicatorRow(
                targets,
                content.x + (content.width - rowWidth) / 2,
                rowTop,
                color,
            ),
        );
        if (iconLast)
            parts.push(
                image(element.icon as string, {
                    x: main.x,
                    y: rowTop + INDICATOR_SIZE + layout.margin.top,
                    width: main.width,
                    height: ICON_SIZE,
                }),
            );
    }
    return parts.join("");
}

const block = (
    lines: TextBlock,
    origin: { x: number; y: number },
    color: string,
    text: TextSetting,
    bold = false,
) =>
    textLines(
        {
            lines: lines.lines,
            fontSize: lines.fontSize,
            bold,
            x: origin.x + lines.x,
            y: origin.y + lines.y,
            width: lines.width,
            align: "start",
            color,
        },
        text,
    );

function element(element: ElementBox, text: TextSetting): string {
    const parts = element.parts
        .map((part) => {
            const paint = paintPart(part.paint, element);
            return `<path ${attrs({
                d: part.d,
                fill: paint.fill,
                stroke: paint.stroke,
                "stroke-width": paint.strokeWidth || undefined,
                "stroke-dasharray": paint.strokeDasharray,
            })}/>`;
        })
        .join("");
    return [
        `<g transform="translate(${n(element.x)} ${n(element.y)})" opacity="${n(element.opacity)}">${parts}</g>`,
        elementLabel(element, text),
        element.instances
            ? block(element.instances, element, element.color, text, true)
            : "",
    ].join("");
}

function boundary(box: BoundaryBox, text: TextSetting): string {
    const origin = { x: box.x, y: box.y };
    return [
        `<rect ${attrs({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            rx: box.radius || undefined,
            fill: box.background,
            stroke: box.stroke,
            "stroke-width": box.strokeWidth,
            "stroke-dasharray": borderDashes(box.border, box.strokeWidth),
            opacity: box.opacity,
        })}/>`,
        box.icon && box.iconBox
            ? image(box.icon, {
                  ...box.iconBox,
                  x: box.x + box.iconBox.x,
                  y: box.y + box.iconBox.y,
              })
            : "",
        block(box.name, origin, box.color, text, true),
        box.metadata ? block(box.metadata, origin, box.color, text) : "",
        box.instances
            ? block(box.instances, origin, box.color, text, true)
            : "",
        box.indicators
            ? indicatorRow(
                  box.targets,
                  box.x + box.indicators.x,
                  box.y + box.indicators.y,
                  box.color,
              )
            : "",
    ].join("");
}

function edgeLine(edge: EdgeLine): string {
    return `<g opacity="${n(edge.opacity)}"><path ${attrs({
        d: edge.path,
        fill: "none",
        stroke: edge.color,
        "stroke-width": edge.thickness,
        "stroke-dasharray": lineDashes(edge.style, edge.thickness),
        "stroke-linecap": edge.style === "Dotted" ? "round" : undefined,
    })}/><path ${attrs({ d: edge.arrowhead, fill: edge.color })}/></g>`;
}

function edgeLabel(edge: EdgeLine, background: string, text: TextSetting) {
    const { labelBox: box, labelLines: lines } = edge;
    if (!box || !lines) return "";
    const left = box.x + EDGE_LABEL_PADDING;
    const width = edge.labelIndicators
        ? edge.labelIndicators.x - EDGE_LABEL_PADDING - INDICATOR_GAP
        : box.width - 2 * EDGE_LABEL_PADDING;
    const column = {
        x: left,
        width,
        align: "middle" as const,
        color: edge.color,
        opacity: edge.opacity < 1 ? edge.opacity : undefined,
    };
    let top = box.y + EDGE_LABEL_PADDING;
    const parts = [
        `<rect ${attrs({ x: box.x, y: box.y, width: box.width, height: box.height, fill: background })}/>`,
    ];
    if (lines.description.length) {
        parts.push(
            textLines(
                {
                    ...column,
                    lines: lines.description,
                    fontSize: edge.fontSize,
                    y: top,
                },
                text,
            ),
        );
        top +=
            lines.description.length * edge.fontSize * LINE_HEIGHT +
            TECHNOLOGY_GAP;
    }
    if (lines.technology.length)
        parts.push(
            textLines(
                {
                    ...column,
                    lines: lines.technology,
                    fontSize: edge.fontSize * METADATA_SCALE,
                    y: top,
                },
                text,
            ),
        );
    if (edge.labelIndicators)
        parts.push(
            indicatorRow(
                edge.targets,
                box.x + edge.labelIndicators.x,
                box.y + edge.labelIndicators.y,
                edge.color,
            ),
        );
    return parts.join("");
}

/** Wrap `body` in the opacity a step gives it; nothing when it is hidden. */
function present(
    body: string,
    presence: keyof typeof PRESENCE_OPACITY | undefined,
) {
    if (!presence || presence === "shown") return body;
    if (presence === "hidden") return "";
    return `<g opacity="${PRESENCE_OPACITY[presence]}">${body}</g>`;
}

/** The view as a standalone SVG document. */
export function exportSvg({ graph, step, frame, text }: ExportInput): string {
    const boundaries = graph.boundaries.map((box) =>
        present(boundary(box, text), step?.boundaries[box.id]),
    );
    const lines = graph.edges.map((edge) =>
        present(edgeLine(edge), step?.edges[edge.key]),
    );
    const labels = graph.edges.map((edge) =>
        present(edgeLabel(edge, graph.background, text), step?.edges[edge.key]),
    );
    const elements = graph.elements.map((box) =>
        present(element(box, text), step?.elements[box.id]),
    );
    const style = text.fontFaces ? `<style>${text.fontFaces}</style>` : "";
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" ${attrs({
            width: frame.width,
            height: frame.height,
            viewBox: `${n(frame.x)} ${n(frame.y)} ${n(frame.width)} ${n(frame.height)}`,
            "font-family": text.family,
        })}>`,
        `<title>${escapeXml(graph.title)}</title>`,
        style,
        `<rect ${attrs({ ...frame, fill: graph.background })}/>`,
        ...boundaries,
        ...lines,
        ...labels,
        ...elements,
        "</svg>",
    ].join("");
}
