/**
 * PROTOTYPE (issue 197): a sequence diagram as the graph the island and the
 * export serializer draw. Participants stay element boxes and messages stay
 * edges, so the style cascade and the edge drawing reach them; everything
 * else (lifelines, activation bars, notes, fragments, boxes, sequence
 * numbers) is the graph's `sequence` layer. No Dagre and no router: the
 * layout in `geometry/sequence.ts` places everything.
 */

import type { Bounds } from "../geometry/bounds";
import type { MeasureText } from "../geometry/boundary";
import { EDGE_LABEL_PADDING } from "../geometry/edge-label";
import { arrowheadPath } from "../geometry/line";
import {
    layOutSequence,
    NUMBER_RADIUS,
    SEQUENCE_LINE,
    SEQUENCE_TEXT,
    type SequenceMarker,
    type SequenceScript,
    TAB,
} from "../geometry/sequence";
import type { Point } from "../geometry/shapes/types";
import type { EdgeLine, ElementBox } from "./graph";

export type SequenceText = { lines: string[]; box: Bounds };

/** What the island draws around the participants and messages, back to front. */
export type SequenceDrawing = {
    fontSize: number;
    lineHeight: number;
    boxes: (Bounds & {
        title?: SequenceText;
        fill: string;
        stroke: string;
        color: string;
    })[];
    fragments: (Bounds & {
        fragment: string;
        /** The keyword's tab, a polygon's points. */
        tab: string;
        keyword: Point;
        title?: SequenceText;
        sections: { y: number; title?: SequenceText }[];
        fill: string;
        stroke: string;
        tabFill: string;
        color: string;
    })[];
    lifelines: { x: number; top: number; bottom: number; stroke: string }[];
    activations: (Bounds & { fill: string; stroke: string })[];
    notes: (Bounds & {
        lines: string[];
        fill: string;
        stroke: string;
        color: string;
    })[];
    numbers: {
        x: number;
        y: number;
        text: string;
        fill: string;
        color: string;
    }[];
    dots: { x: number; y: number; fill: string }[];
};

/** `#rrggbb` mixed toward `toward` by `amount` (0 to 1). */
function mix(color: string, toward: string, amount: number): string {
    const parse = (c: string) =>
        /^#[0-9a-f]{6}$/i.test(c)
            ? [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16))
            : undefined;
    const a = parse(color);
    const b = parse(toward);
    if (!a || !b) return color;
    return `#${a
        .map((v, i) =>
            Math.round(v + (b[i] - v) * amount)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

/** An end marker at `tip`, the line arriving along `heading`. */
function markerPaths(
    marker: SequenceMarker,
    tip: Point,
    heading: Point,
    thickness: number,
): { fill: string; stroke: string } {
    const at = (along: number, across: number) => ({
        x: tip.x - heading.x * along - heading.y * across,
        y: tip.y - heading.y * along + heading.x * across,
    });
    const line = (a: Point, b: Point) =>
        `M${a.x.toFixed(2)},${a.y.toFixed(2)}L${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    switch (marker) {
        case "arrow":
            return { fill: arrowheadPath(tip, heading, thickness), stroke: "" };
        case "openArrow":
            return {
                fill: "",
                stroke: line(at(0, 0), at(13, -9)) + line(at(0, 0), at(13, 9)),
            };
        case "cross": {
            const c = at(9, 0);
            const d = 6;
            return {
                fill: "",
                stroke:
                    line(
                        { x: c.x - d, y: c.y - d },
                        { x: c.x + d, y: c.y + d },
                    ) +
                    line(
                        { x: c.x - d, y: c.y + d },
                        { x: c.x + d, y: c.y - d },
                    ),
            };
        }
        default:
            return { fill: "", stroke: "" };
    }
}

const unit = (from: Point, to: Point): Point => {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};

/** An actor's stick figure in a band at the top of its box, the label below. */
function actorParts(width: number) {
    const cx = width / 2;
    const head = 15 * 1.5 * 0.6;
    const top = 8;
    const neck = top + 2 * head;
    const hip = neck + 22;
    const foot = hip + 18;
    const arm = 20;
    const circle = `M${cx - head},${top + head}a${head},${head} 0 1,0 ${2 * head},0a${head},${head} 0 1,0 ${-2 * head},0`;
    const limbs = [
        `M${cx},${neck}L${cx},${hip}`,
        `M${cx - arm},${neck + 8}L${cx + arm},${neck + 8}`,
        `M${cx},${hip}L${cx - arm * 0.8},${foot}`,
        `M${cx},${hip}L${cx + arm * 0.8},${foot}`,
    ].join("");
    return {
        parts: [
            { d: circle, paint: "body" as const },
            { d: limbs, paint: "rule" as const },
        ],
        labelTop: foot + 2,
    };
}

export function finishSequence(
    script: SequenceScript,
    elements: ElementBox[],
    edges: Omit<
        EdgeLine,
        | "source"
        | "target"
        | "route"
        | "path"
        | "arrowhead"
        | "labelPosition"
        | "labelBox"
        | "labelLines"
        | "labelIndicators"
        | "markers"
    >[],
    measure: MeasureText,
    scheme: "light" | "dark",
    defaults: { background: string; color: string },
): {
    elements: ElementBox[];
    edges: EdgeLine[];
    sequence: SequenceDrawing;
    bounds: Bounds;
} {
    const byId = new Map(elements.map((e) => [e.id, e]));
    const widths = new Map(elements.map((e) => [e.id, e.width]));
    const labels = new Map(edges.map((e) => [e.id, e.description]));
    const layout = layOutSequence(script, widths, labels, measure);
    const palette = script.palette;
    const types = new Map(script.participants.map((p) => [p.id, p.type]));

    const placedElements: ElementBox[] = [];
    for (const [id, { head, foot }] of layout.participants) {
        const element = byId.get(id);
        if (!element) continue;
        const figure =
            types.get(id) === "actor" ? actorParts(head.width) : undefined;
        const place = (box: Bounds, suffix: string): ElementBox => ({
            ...element,
            id: `${id}${suffix}`,
            x: box.x,
            y: box.y,
            targets: [],
            ...(figure && {
                parts: figure.parts,
                content: {
                    x: 0,
                    y: figure.labelTop,
                    width: box.width,
                    height: box.height - figure.labelTop,
                },
                labelHeight: box.height - figure.labelTop,
                // The figure's label reads in the text color, on the canvas,
                // and a silent source draws the figure in the fill.
                color: palette?.actorTextColor ?? defaults.color,
                stroke: palette?.actorBorder ?? element.background,
                strokeWidth: 3,
            }),
        });
        placedElements.push(place(head, ""));
        if (foot) placedElements.push(place(foot, "#footer"));
    }

    const edgeById = new Map(edges.map((e) => [e.id, e]));
    const numbers: SequenceDrawing["numbers"] = [];
    const dots: SequenceDrawing["dots"] = [];
    const lines: EdgeLine[] = layout.messages.flatMap((message) => {
        const edge = edgeById.get(message.relationship);
        if (!edge) return [];
        const route = message.route;
        const first = route[0];
        const last = route[route.length - 1];
        const endHeading = unit(route[route.length - 2], last);
        const startHeading = unit(route[1], first);
        const end = markerPaths(message.end, last, endHeading, edge.thickness);
        const start = markerPaths(
            message.start,
            first,
            startHeading,
            edge.thickness,
        );
        const color = palette?.signalColor ?? edge.color;
        if (message.number)
            numbers.push({
                ...message.number.at,
                text: message.number.text,
                fill: color,
                color: palette?.sequenceNumberColor ?? defaults.background,
            });
        for (const dot of message.dots) dots.push({ ...dot, fill: color });
        const hasLabel = message.label.lines.some((line) => line.length > 0);
        const box = message.label.box;
        return [
            {
                ...edge,
                key: message.relationship,
                sourceId: message.from,
                targetId: message.to,
                source: first,
                target: last,
                route,
                path: message.path,
                arrowhead: end.fill + start.fill,
                ...((end.stroke || start.stroke) && {
                    markers: { stroke: end.stroke + start.stroke, circles: "" },
                }),
                color,
                fontSize: SEQUENCE_TEXT,
                labelPosition: 50,
                bareLabel: true,
                ...(hasLabel && {
                    labelBox: {
                        x: box.x - EDGE_LABEL_PADDING,
                        y: box.y - EDGE_LABEL_PADDING,
                        width: box.width + 2 * EDGE_LABEL_PADDING,
                        height: box.height + 2 * EDGE_LABEL_PADDING,
                    },
                    labelLines: {
                        description: message.label.lines,
                        technology: [],
                    },
                }),
            },
        ];
    });

    // Colors: the source's palette, else what a silent source fills in
    // (issue 196): each participant's own fill and border, a scheme note
    // palette, fragments in the edge color.
    const edgeColor = palette?.signalColor ?? edges[0]?.color ?? defaults.color;
    const participantColors = (id: string) => {
        const element = byId.get(id);
        return {
            fill: element?.background ?? defaults.background,
            stroke: element?.stroke ?? defaults.color,
        };
    };
    const note =
        palette !== undefined
            ? {
                  fill: palette.noteBkgColor,
                  stroke: palette.noteBorderColor,
                  color: palette.noteTextColor,
              }
            : scheme === "dark"
              ? { fill: "#474949", stroke: "#2f2f2f", color: "#e6e6e6" }
              : { fill: "#fff5ad", stroke: "#aaaa33", color: "#333333" };
    const firstFill = participantColors(script.participants[0]?.id ?? "").fill;

    const sequence: SequenceDrawing = {
        fontSize: SEQUENCE_TEXT,
        lineHeight: SEQUENCE_LINE,
        boxes: layout.boxes.map((box) => ({
            ...box,
            fill: box.fill ?? "none",
            stroke: mix(edgeColor, defaults.background, 0.5),
            color: defaults.color,
        })),
        fragments: layout.fragments.map((fragment) => {
            const { x, y } = fragment;
            const rect = fragment.fragment === "rect";
            return {
                ...fragment,
                tab: rect
                    ? ""
                    : [
                          [x, y],
                          [x + TAB.width, y],
                          [x + TAB.width, y + TAB.height - TAB.cut],
                          [x + TAB.width - TAB.cut * 1.2, y + TAB.height],
                          [x, y + TAB.height],
                      ]
                          .map((p) => p.join(","))
                          .join(" "),
                keyword: { x: x + TAB.width / 2, y: y + TAB.height / 2 },
                fill: rect
                    ? fragment.color ??
                      palette?.rectBkgColor ??
                      mix(firstFill, defaults.background, 0.85)
                    : "none",
                stroke: rect
                    ? "none"
                    : palette?.labelBoxBorderColor ?? edgeColor,
                tabFill: palette?.labelBoxBkgColor ?? defaults.background,
                color: palette?.loopTextColor ?? defaults.color,
            };
        }),
        lifelines: layout.lifelines.map((lifeline) => ({
            x: lifeline.x,
            top: lifeline.top,
            bottom: lifeline.bottom,
            stroke:
                palette?.actorLineColor ?? participantColors(lifeline.id).fill,
        })),
        activations: layout.activations.map((bar) => {
            const own = participantColors(bar.id);
            return {
                x: bar.x,
                y: bar.y,
                width: bar.width,
                height: bar.height,
                fill:
                    palette?.activationBkgColor ??
                    mix(own.fill, "#ffffff", 0.6),
                stroke: palette?.activationBorderColor ?? own.stroke,
            };
        }),
        notes: layout.notes.map((n) => ({ ...n, ...note })),
        numbers,
        dots,
    };

    return {
        elements: placedElements,
        edges: lines,
        sequence,
        bounds: layout.bounds,
    };
}

export const SEQUENCE_NUMBER_RADIUS = NUMBER_RADIUS;
