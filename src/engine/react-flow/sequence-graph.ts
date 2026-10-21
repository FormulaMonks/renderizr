/**
 * A Mermaid sequence diagram as the graph the island and the export draw
 * (spec: Sequence diagrams). Participants are element boxes and messages
 * edges, so the style cascade reaches them through their tags and they
 * draw as every element and edge does; everything else (boxes, fragments,
 * lifelines, activation bars, notes, message labels, sequence numbers and
 * central connection dots) is the graph's `sequence` layer. No Dagre and no
 * router: `geometry/sequence.ts` places everything.
 *
 * The layer is plain SVG shapes in two lists, one drawn behind the edges
 * and one in front of them, which the island renders and the export
 * serializes as they are, so the two can't drift apart.
 *
 * Colors are a silent source's (spec: Sequence diagrams), or the source's
 * palette's: its fills in both schemes, its canvas colors where
 * `sequenceOnCanvas` says.
 */

import {
    type ColorScheme as ModelColorScheme,
    type ElementStyle,
    type MermaidMessage,
    type MermaidSequence,
    type MermaidSequencePalette,
    messageStyle,
    mermaidEdgeId,
    mermaidNodeId,
    mermaidPrimaryColor,
    participantStyle,
    type ResolvedView,
    SCHEME_DEFAULTS,
    SEQUENCE_FONT_SIZE,
    sequenceBoxStyle,
    sequenceOnCanvas,
    type WorkspaceModel,
} from "../../model/index";
import type { MeasureText } from "../geometry/boundary";
import { type Bounds, boundsOf } from "../geometry/bounds";
import { iconPositionOf, NAME_SCALE, SIDE_PADDING } from "../geometry/label";
import { borderDashes } from "../geometry/paint";
import {
    type EndMarker,
    edgeMarkers,
    isEndMarker,
    markerInset,
} from "../geometry/markers";
import { endHeading } from "../geometry/routing/path";
import {
    DOT_RADIUS,
    layOutSequence,
    type MessageRange,
    NUMBER_RADIUS,
    PARTICIPANT_WIDTH,
    type SequenceLayout,
    type SequenceMessage,
    type SequenceText,
    TAB,
} from "../geometry/sequence";
import { shallowCylinder, shapeGeometry } from "../geometry/shapes/index";
import { num } from "../geometry/shapes/outline";
import type { Point } from "../geometry/shapes/types";
import type { EdgeLine, ElementBox } from "./graph";

/** One SVG shape of the sequence layer: its tag, its attributes and the text it holds. */
export type SequenceShape = {
    tag: "rect" | "line" | "polygon" | "circle" | "text";
    /** SVG attribute names, as the export writes them. */
    attrs: Record<string, string | number | undefined>;
    text?: string;
    /**
     * The unit an animation step shows or fades the shape with, as a whole:
     * a message, a note, a bar, a fragment's frame or one of its sections,
     * or a lifeline's participant, by its element id. None on what never
     * fades on its own (a `box` grouping).
     */
    unit?: string;
    /**
     * The messages the unit holds, so the steps it shows at; none on a
     * lifeline, which fades with its participant.
     */
    messages?: MessageRange;
};

/** What a sequence diagram draws around its participants and messages, back to front. */
export type SequenceDrawing = {
    /** Behind the edges: boxes, `rect` fills, lifelines, activation bars, the other fragments. */
    back: SequenceShape[];
    /** In front: notes, message labels, sequence numbers and central connection dots. */
    front: SequenceShape[];
    /**
     * Each message's focus box, in message order, which `zoomOnAnimation`
     * fits at its step: its row with the notes that step with it, as wide
     * as its two participants' columns, padded.
     */
    focus: Bounds[];
};

/** A run of shapes in one layer that share a unit, or one shape with none. */
export type SequenceGroup = { unit?: string; shapes: SequenceShape[] };

/**
 * `shapes` in runs of one unit, in drawing order, so the island and the
 * export draw each unit under one opacity and its overlapping parts don't
 * show through each other. A unit's shapes always sit next to each other.
 */
export function sequenceGroups(shapes: SequenceShape[]): SequenceGroup[] {
    const groups: SequenceGroup[] = [];
    for (const shape of shapes) {
        const last = groups[groups.length - 1];
        if (shape.unit !== undefined && last?.unit === shape.unit)
            last.shapes.push(shape);
        else groups.push({ unit: shape.unit, shapes: [shape] });
    }
    return groups;
}

/** `shapes`, each tagged with `unit` and the messages it holds. */
const inUnit = (
    shapes: SequenceShape[],
    unit: string,
    messages?: MessageRange,
): SequenceShape[] =>
    shapes.map((shape) => ({ ...shape, unit, ...(messages && { messages }) }));

/** The room around a step's focus box. */
const FOCUS_PADDING = 15;

/** How deep a database's lid is, in place of the Cylinder's 30. */
const DATABASE_LID = 12;

/** How much taller than the participant row an actor's Person stands. */
const ACTOR_SCALE = 1.5;

/** A note's colors in each scheme: gray in place of Mermaid's yellow. */
const NOTE_COLORS: Record<
    ModelColorScheme,
    { fill: string; stroke: string; color: string }
> = {
    Light: { fill: "#e6e6e6", stroke: "#b3b3b3", color: "#333333" },
    Dark: { fill: "#474949", stroke: "#2f2f2f", color: "#e6e6e6" },
};

/** How far toward the canvas an activation bar's fill and border mix, per scheme. */
const BAR_MIX: Record<ModelColorScheme, { fill: number; stroke: number }> = {
    Light: { fill: 0.85, stroke: 0.55 },
    Dark: { fill: 0.55, stroke: 0.3 },
};

/** How faint a `rect` with no color of its own tints the primary color. */
const RECT_TINT = 0.85;

/** `#rrggbb` mixed toward `toward` by `amount`, 0 to 1; any other color as it is. */
export function mix(color: string, toward: string, amount: number): string {
    const parse = (c: string) =>
        /^#[\da-f]{6}$/i.test(c)
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

const markerOf = (name: string): EndMarker =>
    isEndMarker(name) ? name : "none";

/** A participant's width: its name on one line in the C4 label template, at least Mermaid's. */
function participantWidth(
    name: string,
    style: ElementStyle,
    measure: MeasureText,
): number {
    const longest = Math.max(
        ...name
            .split("\n")
            .map((line) => measure(line, style.fontSize * NAME_SCALE, true)),
    );
    return Math.max(PARTICIPANT_WIDTH, Math.ceil(longest) + 2 * SIDE_PADDING);
}

/**
 * A participant's box in `row`: a database keeps the row with a shallow
 * lid, so its body reads as tall as the others'; an actor draws C4's
 * Person at its own square proportions, standing on the header row and
 * hanging from the footer row, so every lifeline starts on one line.
 */
function participantBox(
    id: string,
    name: string,
    style: ElementStyle,
    row: Bounds,
    footer: boolean,
): ElementBox {
    const strokeWidth = style.strokeWidth ?? 2;
    let box = row;
    let geometry = shapeGeometry(
        style.shape ?? "Box",
        row.width,
        row.height,
        strokeWidth,
    );
    if (style.shape === "Cylinder") {
        geometry = shallowCylinder(
            row.width,
            row.height,
            DATABASE_LID,
            strokeWidth,
        );
    } else if (style.shape === "Person") {
        const side = Math.round(row.height * ACTOR_SCALE);
        box = {
            x: row.x + (row.width - side) / 2,
            y: footer ? row.y : row.y + row.height - side,
            width: side,
            height: side,
        };
        geometry = shapeGeometry("Person", side, side, strokeWidth);
    }
    return {
        id,
        ...box,
        shape: geometry.shape,
        parts: geometry.parts,
        name,
        metadata: "",
        description: "",
        background: style.background,
        stroke: style.stroke ?? style.background,
        strokeWidth,
        color: style.color ?? "#ffffff",
        fontSize: style.fontSize,
        border: style.border ?? "Solid",
        opacity: style.opacity / 100,
        icon: style.icon,
        iconPosition: iconPositionOf(style.iconPosition),
        content: geometry.content,
        labelHeight: geometry.content.height,
        // Participants never become activation targets.
        targets: [],
    };
}

/** `point` moved `by` along the unit vector `heading`. */
const along = (point: Point, heading: Point, by: number): Point => ({
    x: point.x + heading.x * by,
    y: point.y + heading.y * by,
});

/**
 * A message's line as path data, stopping short of each marker by its
 * inset: straight, a self-message's cubic loop or its right angles.
 */
function messagePath(message: SequenceMessage, thickness: number): string {
    const route = [...message.route];
    const last = route.length - 1;
    const end = endHeading(route);
    const start = endHeading([...route].reverse());
    route[last] = along(
        route[last],
        end,
        -markerInset(markerOf(message.end), thickness),
    );
    route[0] = along(
        route[0],
        start,
        -markerInset(markerOf(message.start), thickness),
    );
    const at = (p: Point) => `${num(p.x)} ${num(p.y)}`;
    if (message.loop)
        return `M ${at(route[0])} C ${at(route[1])} ${at(route[2])} ${at(route[3])}`;
    return `M ${route.map(at).join(" L ")}`;
}

/** Each line of `text` as an SVG `<text>`, centered in its box. */
function textShapes(
    text: SequenceText,
    line: number,
    attrs: SequenceShape["attrs"],
): SequenceShape[] {
    const x = text.box.x + text.box.width / 2;
    return text.lines.map((value, i) => ({
        tag: "text",
        attrs: {
            x,
            y: text.box.y + line * (i + 0.5),
            "text-anchor": "middle",
            "dominant-baseline": "central",
            ...attrs,
        },
        text: value,
    }));
}

/** The colors the layer draws in. */
type Colors = {
    canvas: string;
    /** Fragment titles and conditions, and box titles. */
    text: string;
    /** Fragment lines. */
    line: string;
    /** A fragment's tab and the keyword on it. */
    tab: { fill: string; color: string };
    /** A `rect` with no color of its own. */
    rect: string;
    /** How opaque a `rect`'s fill draws: a color from the source fades in dark mode. */
    rectOpacity: (sourced: boolean) => number | undefined;
    /** A sequence number's text, on its circle in the message's color. */
    number: string;
    note: { fill: string; stroke: string; color: string };
    box: ElementStyle;
};

/** Each participant's lifeline color and activation bar colors. */
type Lanes = ReadonlyMap<
    string,
    { line: string; fill: string; stroke: string }
>;

/**
 * The colors in `scheme`: a silent source's (spec: Sequence diagrams), or
 * its `palette`'s fills in both schemes and its canvas colors where
 * `sequenceOnCanvas` says, the scheme's elsewhere.
 */
function colorsOf(
    model: WorkspaceModel,
    scheme: ModelColorScheme,
    line: string,
    palette: MermaidSequencePalette | undefined,
): Colors {
    const defaults = SCHEME_DEFAULTS[scheme];
    const canvas = defaults.background;
    const own = sequenceOnCanvas(palette, scheme) ? palette.colors : undefined;
    const colors = palette?.colors;
    const dark = scheme === "Dark";
    return {
        canvas,
        text: own?.loopTextColor ?? defaults.color,
        line: own?.labelBoxBorderColor ?? line,
        tab: colors
            ? { fill: colors.labelBoxBkgColor, color: colors.labelTextColor }
            : { fill: canvas, color: defaults.color },
        rect:
            colors?.rectBkgColor ??
            mix(mermaidPrimaryColor(scheme), canvas, RECT_TINT),
        rectOpacity: (sourced) =>
            dark && (sourced || (palette && !palette.dark)) ? 0.2 : undefined,
        number: own?.sequenceNumberColor ?? canvas,
        note: colors
            ? {
                  fill: colors.noteBkgColor,
                  stroke: colors.noteBorderColor,
                  color: colors.noteTextColor,
              }
            : NOTE_COLORS[scheme],
        box: sequenceBoxStyle(model, scheme),
    };
}

/** The shapes of `layout` behind the edges and in front of them. */
function layerShapes(
    layout: SequenceLayout,
    colors: Colors,
    lanes: Lanes,
    edges: ReadonlyMap<string, EdgeLine>,
): Omit<SequenceDrawing, "focus"> {
    const { size, line } = layout.text;
    const font = { "font-size": size };
    const back: SequenceShape[] = [];
    const front: SequenceShape[] = [];

    for (const box of layout.boxes) {
        const style = colors.box;
        back.push({
            tag: "rect",
            attrs: {
                "data-sequence": "box",
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                fill: box.fill ?? "none",
                // Behind the lines and text as a `rect` is, so it fades alike.
                "fill-opacity": box.fill ? colors.rectOpacity(true) : undefined,
                stroke: style.stroke ?? colors.text,
                "stroke-width": style.strokeWidth ?? 1,
                "stroke-dasharray": borderDashes(
                    style.border ?? "Solid",
                    style.strokeWidth ?? 1,
                ),
            },
        });
        if (box.title)
            back.push(
                ...textShapes(box.title, line, {
                    ...font,
                    fill: style.color ?? colors.text,
                }),
            );
    }

    const fragment = (
        f: SequenceLayout["fragments"][number],
        index: number,
    ) => {
        const rect = f.fragment === "rect";
        const shapes: SequenceShape[] = [
            {
                tag: "rect",
                attrs: {
                    "data-sequence": `fragment ${f.fragment}`,
                    x: f.x,
                    y: f.y,
                    width: f.width,
                    height: f.height,
                    fill: rect ? (f.color ?? colors.rect) : "none",
                    "fill-opacity": rect
                        ? colors.rectOpacity(f.color !== undefined)
                        : undefined,
                    stroke: rect ? "none" : colors.line,
                    "stroke-width": rect ? undefined : 2,
                    "stroke-dasharray": rect ? undefined : "3 3",
                },
            },
        ];
        if (rect) return inUnit(shapes, `fragment:${index}`, f.messages);
        const { x, y } = f;
        shapes.push(
            {
                tag: "polygon",
                attrs: {
                    points: [
                        [x, y],
                        [x + TAB.width, y],
                        [x + TAB.width, y + TAB.height - TAB.cut],
                        [x + TAB.width - TAB.cut * 1.2, y + TAB.height],
                        [x, y + TAB.height],
                    ]
                        .map(([px, py]) => `${num(px)},${num(py)}`)
                        .join(" "),
                    fill: colors.tab.fill,
                    stroke: colors.line,
                    "stroke-width": 2,
                },
            },
            {
                tag: "text",
                attrs: {
                    x: x + TAB.width / 2,
                    y: y + TAB.height / 2,
                    "font-size": size * 0.8,
                    "font-weight": "bold",
                    "text-anchor": "middle",
                    "dominant-baseline": "central",
                    fill: colors.tab.color,
                },
                text: f.fragment,
            },
        );
        if (f.title)
            shapes.push(
                ...textShapes(f.title, line, { ...font, fill: colors.text }),
            );
        const frame = inUnit(shapes, `fragment:${index}`, f.messages);
        for (const [i, section] of f.sections.entries()) {
            const parts: SequenceShape[] = [];
            parts.push({
                tag: "line",
                attrs: {
                    "data-sequence": "section",
                    x1: f.x,
                    x2: f.x + f.width,
                    y1: section.y,
                    y2: section.y,
                    stroke: colors.line,
                    "stroke-width": 2,
                    "stroke-dasharray": "4.5 4.5",
                },
            });
            if (section.title)
                parts.push(
                    ...textShapes(section.title, line, {
                        ...font,
                        fill: colors.text,
                    }),
                );
            frame.push(
                ...inUnit(parts, `section:${index}:${i}`, section.messages),
            );
        }
        return frame;
    };

    // A `rect` fills behind the lifelines and bars; the other fragments
    // draw over them, so their titles show.
    for (const [i, f] of layout.fragments.entries())
        if (f.fragment === "rect") back.push(...fragment(f, i));
    for (const lifeline of layout.lifelines)
        back.push({
            // A lifeline fades with its participant.
            unit: mermaidNodeId(lifeline.id),
            tag: "line",
            attrs: {
                "data-sequence": "lifeline",
                x1: lifeline.x,
                x2: lifeline.x,
                y1: lifeline.top,
                y2: lifeline.bottom,
                stroke: lanes.get(lifeline.id)?.line,
                "stroke-width": 1,
            },
        });
    for (const [i, bar] of layout.activations.entries()) {
        const lane = lanes.get(bar.id);
        back.push({
            unit: `bar:${i}`,
            messages: bar.messages,
            tag: "rect",
            attrs: {
                "data-sequence": "activation",
                x: bar.x,
                y: bar.y,
                width: bar.width,
                height: bar.height,
                fill: lane?.fill,
                stroke: lane?.stroke,
            },
        });
    }
    for (const [i, f] of layout.fragments.entries())
        if (f.fragment !== "rect") back.push(...fragment(f, i));

    for (const [i, note] of layout.notes.entries()) {
        const parts: SequenceShape[] = [];
        parts.push({
            tag: "rect",
            attrs: {
                "data-sequence": "note",
                x: note.x,
                y: note.y,
                width: note.width,
                height: note.height,
                fill: colors.note.fill,
                stroke: colors.note.stroke,
            },
        });
        parts.push(
            ...textShapes(
                {
                    lines: note.lines,
                    box: {
                        ...note,
                        y:
                            note.y +
                            (note.height - note.lines.length * line) / 2,
                    },
                },
                line,
                { ...font, fill: colors.note.color },
            ),
        );
        front.push(...inUnit(parts, `note:${i}`, note.messages));
    }
    for (const [i, message] of layout.messages.entries()) {
        const edge = edges.get(mermaidEdgeId(message.id));
        if (!edge) continue;
        const from = front.length;
        // A message's label draws with no backing, as Mermaid's.
        front.push(
            ...textShapes(message.label, line, {
                ...font,
                fill: edge.labelColor ?? edge.color,
                opacity: edge.opacity < 1 ? edge.opacity : undefined,
            }),
        );
        for (const dot of message.dots)
            front.push({
                tag: "circle",
                attrs: {
                    "data-sequence": "dot",
                    cx: dot.x,
                    cy: dot.y,
                    r: DOT_RADIUS,
                    fill: edge.color,
                },
            });
        if (message.number) {
            const { at, text } = message.number;
            front.push(
                {
                    tag: "circle",
                    attrs: {
                        "data-sequence": "number",
                        cx: at.x,
                        cy: at.y,
                        r: NUMBER_RADIUS,
                        fill: edge.color,
                    },
                },
                {
                    tag: "text",
                    attrs: {
                        x: at.x,
                        y: at.y,
                        // Mermaid's 12 px, then 9 and 7 for longer numbers.
                        "font-size":
                            text.length > 5
                                ? 10.5
                                : text.length > 3
                                  ? 13.5
                                  : 18,
                        "text-anchor": "middle",
                        "dominant-baseline": "central",
                        fill: colors.number,
                    },
                    text,
                },
            );
        }
        front.splice(
            from,
            front.length - from,
            ...inUnit(front.slice(from), `message:${i}`, {
                from: i,
                to: i + 1,
            }),
        );
    }
    return { back, front };
}

/**
 * Each message's focus box: its arrow, label, number and dots with the
 * notes that step with it, widened to the outer edges of its two
 * participants' columns, padded.
 */
function focusOf(layout: SequenceLayout): Bounds[] {
    return layout.messages.map((message, i) => {
        const points = [
            ...message.route,
            ...message.dots,
            ...(message.number ? [message.number.at] : []),
        ].map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 }));
        const number = message.number && {
            x: message.number.at.x - NUMBER_RADIUS,
            y: message.number.at.y - NUMBER_RADIUS,
            width: 2 * NUMBER_RADIUS,
            height: 2 * NUMBER_RADIUS,
        };
        const notes = layout.notes.filter((note) => note.messages.from === i);
        const row =
            boundsOf([
                message.label.box,
                ...points,
                ...(number ? [number] : []),
                ...notes,
            ]) ?? message.label.box;
        const columns = [message.from, message.to].flatMap((id) => {
            const head = layout.participants.get(id)?.head;
            return head ? [head] : [];
        });
        const left = Math.min(row.x, ...columns.map((c) => c.x));
        const right = Math.max(
            row.x + row.width,
            ...columns.map((c) => c.x + c.width),
        );
        return {
            x: left - FOCUS_PADDING,
            y: row.y - FOCUS_PADDING,
            width: right - left + 2 * FOCUS_PADDING,
            height: row.height + 2 * FOCUS_PADDING,
        };
    });
}

/** A sequence diagram drawn: its participants, its messages and the layer around them. */
export type SequenceGraph = {
    elements: ElementBox[];
    edges: EdgeLine[];
    sequence: SequenceDrawing;
    bounds: Bounds;
};

/**
 * The sequence diagram `view` resolved to, as the graph draws it in
 * `scheme`. With `notes` off (the descriptions toggle) it lays out as if
 * the source had none, so the gaps they leave close.
 */
export function drawSequence(
    model: WorkspaceModel,
    view: ResolvedView & { sequence: MermaidSequence },
    scheme: ModelColorScheme,
    measure: MeasureText,
    notes = true,
): SequenceGraph {
    const script = notes
        ? view.sequence
        : {
              ...view.sequence,
              items: view.sequence.items.filter((i) => i.kind !== "note"),
          };
    const { palette } = script;
    const styles = new Map(
        script.participants.map((p, i) => [
            p.id,
            participantStyle(model, p, scheme, palette, i),
        ]),
    );
    const widths = new Map(
        script.participants.map((p) => [
            p.id,
            participantWidth(p.label, styles.get(p.id)!, measure),
        ]),
    );
    const messages = new Map(
        script.items.flatMap((item) =>
            item.kind === "message" ? [[item.id, item] as const] : [],
        ),
    );
    const solid: MermaidMessage = {
        kind: "message",
        id: "",
        from: "",
        to: "",
        label: "",
        line: "solid",
        start: "none",
        end: "none",
        wrap: false,
    };
    const text = messageStyle(model, solid, scheme, palette);
    const layout = layOutSequence(
        script,
        widths,
        measure,
        text.fontSize ?? SEQUENCE_FONT_SIZE,
    );

    const elements: ElementBox[] = [];
    for (const participant of script.participants) {
        const placed = layout.participants.get(participant.id);
        if (!placed) continue;
        const id = mermaidNodeId(participant.id);
        const style = styles.get(participant.id)!;
        elements.push(
            participantBox(id, participant.label, style, placed.head, false),
        );
        if (placed.foot)
            elements.push(
                participantBox(
                    `${id}#footer`,
                    participant.label,
                    style,
                    placed.foot,
                    true,
                ),
            );
    }

    const names = new Map(script.participants.map((p) => [p.id, p.label]));
    const edges: EdgeLine[] = layout.messages.flatMap((placed) => {
        const message = messages.get(placed.id);
        if (!message) return [];
        const style = messageStyle(model, message, scheme, palette);
        const key = mermaidEdgeId(placed.id);
        const { route } = placed;
        const markers = edgeMarkers(
            markerOf(placed.start),
            markerOf(placed.end),
            route,
            style.thickness,
        );
        return [
            {
                key,
                id: key,
                sourceId: mermaidNodeId(placed.from),
                targetId: mermaidNodeId(placed.to),
                source: route[0],
                target: route[route.length - 1],
                route,
                path: messagePath(placed, style.thickness),
                arrowhead: markers.fill,
                ...(markers.stroke && { markerStroke: markers.stroke }),
                // The router, avoidance and jump-overs don't apply.
                routing: "Direct",
                jump: false,
                vertices: [],
                description: message.label,
                technology: "",
                labelPosition: 50,
                targets: [],
                name: `${names.get(placed.from)} → ${names.get(placed.to)}${message.label ? `: ${message.label}` : ""}`,
                fontSize: layout.text.size,
                labelWidth: style.width,
                color: style.color,
                ...(style.labelColor && { labelColor: style.labelColor }),
                thickness: style.thickness,
                style: style.style,
                opacity: style.opacity / 100,
            },
        ];
    });

    const canvas = SCHEME_DEFAULTS[scheme].background;
    const own = sequenceOnCanvas(palette, scheme) ? palette.colors : undefined;
    const lanes: Lanes = new Map(
        script.participants.map((p, i) => {
            const fill = styles.get(p.id)!.background;
            const redux = palette?.participants?.[i];
            const mixed = BAR_MIX[scheme];
            // A lifeline takes the palette's line color where it applies,
            // else the participant's fill; a bar the palette's colors, a
            // redux-color participant's own, else a tint of the fill.
            const bar = redux
                ? {
                      fill: redux.background ?? palette.colors.actorBkg,
                      stroke: redux.stroke ?? palette.colors.actorBorder,
                  }
                : palette
                  ? {
                        fill: palette.colors.activationBkgColor,
                        stroke: palette.colors.activationBorderColor,
                    }
                  : {
                        fill: mix(fill, canvas, mixed.fill),
                        stroke: mix(fill, canvas, mixed.stroke),
                    };
            return [p.id, { line: own?.actorLineColor ?? fill, ...bar }];
        }),
    );
    const sequence = {
        ...layerShapes(
            layout,
            colorsOf(model, scheme, text.color, palette),
            lanes,
            new Map(edges.map((edge) => [edge.key, edge])),
        ),
        focus: focusOf(layout),
    };
    return {
        elements,
        edges,
        sequence,
        // An actor stands taller than the participant row.
        bounds: boundsOf([layout.bounds, ...elements]) ?? layout.bounds,
    };
}
