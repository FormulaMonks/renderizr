/**
 * PROTOTYPE (issue 197): a Mermaid sequence diagram's layout, our own and
 * with no Dagre. One pass over the script the build hands the page, with a
 * vertical cursor, a fragment stack and an activation stack per
 * participant, the way Mermaid's `sequenceRenderer.ts` walks its message
 * list. Every constant is Mermaid's at 16 px, scaled by 1.5 for the 24 px
 * Renderizr draws Mermaid diagrams at.
 *
 * Pure: the caller hands in the text measure.
 */

import type { Bounds } from "./bounds";
import type { MeasureText } from "./boundary";
import { wrapLines } from "./boundary";
import type { Point } from "./shapes/types";

const S = 1.5;
/** Mermaid's text, 16 px, scaled. */
export const SEQUENCE_TEXT = 16 * S;
/** One line of text: Mermaid's 18 at 16 px. */
export const SEQUENCE_LINE = 18 * S;
const LINE = SEQUENCE_LINE;
export const PARTICIPANT_WIDTH = 150 * S;
/** `neo`'s participant row: max(65, 44 + 6 + label + 6) at 16 px. */
export const PARTICIPANT_ROW = Math.max(65, 44 + 6 + 18 + 6) * S;
const ROW = PARTICIPANT_ROW;
const ACTOR_MARGIN = 50 * S;
const BOX_MARGIN = 10 * S;
const WRAP_PADDING = 10 * S;
const NOTE_MARGIN = 10 * S;
const NOTE_WIDTH = 150 * S;
/** How far a note right or left of a participant sits from its lifeline. */
const NOTE_OFFSET = 25 * S;
export const ACTIVATION_WIDTH = 10 * S;
const SELF_LOOP = 60 * S;
const SELF_EXTRA = 30 * S;
const SELF_REACH = 75 * S;
/** The fragment's label tab: 50 × 20 with a 7 px cut corner. */
export const TAB = { width: 50 * S, height: 20 * S, cut: 7 * S };
/** `box … end`: the margin around its participants, and its title's. */
const GROUP_MARGIN = 5 * S;
/** Space below the last item before the footer, or where lifelines end. */
const TAIL = 20 * S;
// Measured off Mermaid 12's picture: about 11 at 16 px, where the source reads 6.
export const NUMBER_RADIUS = 11 * S;

export type ParticipantType = "participant" | "actor" | "database" | "queue";
export type SequenceMarker = "none" | "arrow" | "openArrow" | "cross";

type Message = {
    kind: "message";
    index: number;
    relationship: string;
    from: string;
    to: string;
    start: SequenceMarker;
    end: SequenceMarker;
    wrap: boolean;
    dots?: "start" | "end" | "both";
};

export type SequenceItem =
    | Message
    | {
          kind: "note";
          index: number;
          placement: "left" | "right" | "over";
          from: string;
          to: string;
          text: string;
          wrap: boolean;
      }
    | { kind: "activate" | "deactivate"; index: number; who: string }
    | {
          kind: "open";
          index: number;
          fragment: string;
          title: string;
          color?: string;
      }
    | { kind: "section"; index: number; title: string }
    | { kind: "close"; index: number }
    | {
          kind: "autonumber";
          index: number;
          start: number;
          step: number;
          visible: boolean;
      };

/** The script the build writes into the view's `renderizr.mermaid.sequence`. */
export type SequenceScript = {
    participants: { id: string; type: ParticipantType }[];
    boxes: { title: string; fill?: string; participants: string[] }[];
    /** The message index that creates or destroys a participant, by id. */
    created: Record<string, number>;
    destroyed: Record<string, number>;
    mirror: boolean;
    rightAngles: boolean;
    /** The sequence theme variables a source's config sets; absent when silent. */
    palette?: Record<string, string>;
    items: SequenceItem[];
};

/** Lines of text and the box they fill, top-left first. */
export type SequenceText = { lines: string[]; box: Bounds };

export type SequenceMessage = {
    relationship: string;
    from: string;
    to: string;
    /** The points the line passes through, its start first. */
    route: Point[];
    /** SVG path data: a straight line, or the self-message's loop. */
    path: string;
    label: SequenceText;
    start: SequenceMarker;
    end: SequenceMarker;
    number?: { at: Point; text: string };
    /** Central connections: dots on the lifeline. */
    dots: Point[];
};

export type SequenceFragment = Bounds & {
    fragment: string;
    depth: number;
    title?: SequenceText;
    sections: { y: number; title?: SequenceText }[];
    color?: string;
};

export type SequenceLayout = {
    /** Each participant's header box, and its footer box when one draws. */
    participants: Map<string, { head: Bounds; foot?: Bounds }>;
    lifelines: { id: string; x: number; top: number; bottom: number }[];
    activations: (Bounds & { id: string; depth: number })[];
    messages: SequenceMessage[];
    notes: (Bounds & { lines: string[] })[];
    fragments: SequenceFragment[];
    boxes: (Bounds & { title?: SequenceText; fill?: string })[];
    bounds: Bounds;
};

const widthOf = (lines: string[], measure: MeasureText) =>
    Math.max(0, ...lines.map((line) => measure(line, SEQUENCE_TEXT, false)));

const split = (text: string) => text.split("\n");

/**
 * Lay the script out. `widths` holds each participant's width as the page
 * measured its label, `labels` each message's text by relationship id.
 */
export function layOutSequence(
    script: SequenceScript,
    widths: ReadonlyMap<string, number>,
    labels: ReadonlyMap<string, string>,
    measure: MeasureText,
): SequenceLayout {
    // Mermaid finds every fragment's width before it wraps the titles; a
    // first pass does the same here.
    const first = pass(script, widths, labels, measure, new Map());
    const fragmentWidths = new Map(
        first.fragments.map((f) => [f.index, f.width]),
    );
    const { layout } = pass(script, widths, labels, measure, fragmentWidths);
    return layout;
}

type Frame = {
    index: number;
    fragment: string;
    title: string;
    color?: string;
    top: number;
    depth: number;
    left: number;
    right: number;
    bottom: number;
    sections: { y: number; title: string }[];
};

function pass(
    script: SequenceScript,
    widths: ReadonlyMap<string, number>,
    labels: ReadonlyMap<string, string>,
    measure: MeasureText,
    fragmentWidths: ReadonlyMap<number, number>,
): {
    layout: SequenceLayout;
    fragments: { index: number; width: number }[];
} {
    const order = script.participants.map((p) => p.id);
    const at = new Map(order.map((id, i) => [id, i]));
    const width = (id: string) => widths.get(id) ?? PARTICIPANT_WIDTH;
    const messageText = (m: Message) => labels.get(m.relationship) ?? "";

    // --- Columns: what sits between two neighbors widens the gap between them. ---
    const need = order.map(() => 0);
    const widen = (i: number | undefined, room: number) => {
        if (i !== undefined && i >= 0 && i < need.length - 1)
            need[i] = Math.max(need[i], room);
    };
    for (const item of script.items) {
        if (item.kind === "message") {
            const lines = item.wrap
                ? wrapLines(
                      messageText(item),
                      NOTE_WIDTH - 2 * WRAP_PADDING,
                      SEQUENCE_TEXT,
                      false,
                      measure,
                  )
                : split(messageText(item));
            const room = widthOf(lines, measure) + 2 * WRAP_PADDING;
            const a = at.get(item.from)!;
            const b = at.get(item.to)!;
            if (a === b) widen(a, room / 2);
            else if (Math.abs(a - b) === 1) widen(Math.min(a, b), room);
        } else if (item.kind === "note" && item.placement !== "over") {
            const lines = item.wrap
                ? wrapLines(
                      item.text,
                      NOTE_WIDTH - 2 * WRAP_PADDING,
                      SEQUENCE_TEXT,
                      false,
                      measure,
                  )
                : split(item.text);
            const room =
                Math.max(
                    NOTE_WIDTH,
                    widthOf(lines, measure) + 2 * WRAP_PADDING,
                ) + NOTE_OFFSET;
            const i = at.get(item.from)!;
            widen(item.placement === "right" ? i : i - 1, room);
        }
    }
    const boxOf = new Map<string, number>();
    script.boxes.forEach((box, b) => {
        for (const id of box.participants) boxOf.set(id, b);
    });
    const centers: number[] = [];
    order.forEach((id, i) => {
        if (i === 0) {
            centers.push(width(id) / 2 + (boxOf.has(id) ? GROUP_MARGIN : 0));
            return;
        }
        const previous = order[i - 1];
        let distance = Math.max(
            width(previous) / 2 + width(id) / 2 + ACTOR_MARGIN,
            need[i - 1] + ACTOR_MARGIN,
        );
        // Entering a box, and leaving one, shifts the participant over.
        if (boxOf.get(id) !== boxOf.get(previous)) {
            if (boxOf.has(id)) distance += GROUP_MARGIN;
            if (boxOf.has(previous)) distance += BOX_MARGIN + GROUP_MARGIN;
        }
        // A participant drawn later, at the message that creates it, moves
        // over by half its width.
        if (script.created[id] !== undefined) distance += width(id) / 2;
        centers.push(centers[i - 1] + distance);
    });
    const x = (id: string) => centers[at.get(id)!];

    // --- Rows: one cursor down the message list. ---
    const titled = script.boxes.some((box) => box.title);
    const top = titled ? BOX_MARGIN + LINE : 0;
    const participants = new Map<string, { head: Bounds; foot?: Bounds }>();
    const lifelineTop = new Map<string, number>();
    const lifelineBottom = new Map<string, number>();
    for (const id of order) {
        if (script.created[id] !== undefined) continue;
        participants.set(id, {
            head: {
                x: x(id) - width(id) / 2,
                y: top,
                width: width(id),
                height: ROW,
            },
        });
        lifelineTop.set(id, top + ROW);
    }
    let cursor = top + ROW;

    const stacks = new Map<string, number[]>(order.map((id) => [id, []]));
    const activations: SequenceLayout["activations"] = [];
    const messages: SequenceMessage[] = [];
    const notes: SequenceLayout["notes"] = [];
    const frames: Frame[] = [];
    const closed: (Frame & { bottom: number })[] = [];
    let counter: { next: number; step: number } | undefined;

    /** The left and right edges of a participant's activation bars, or its lifeline. */
    const edges = (id: string, extra = 0) => {
        const n = stacks.get(id)!.length + extra;
        const c = x(id);
        return n === 0
            ? { left: c, right: c }
            : {
                  left: c - ACTIVATION_WIDTH / 2,
                  right:
                      c +
                      ACTIVATION_WIDTH / 2 +
                      (ACTIVATION_WIDTH / 2) * (n - 1),
              };
    };
    const reach = (left: number, right: number, bottom: number) => {
        for (const frame of frames) {
            frame.left = Math.min(frame.left, left);
            frame.right = Math.max(frame.right, right);
            frame.bottom = Math.max(frame.bottom, bottom);
        }
    };
    const startActivation = (id: string, from: number) =>
        stacks.get(id)!.push(from);
    const endActivation = (id: string) => {
        const stack = stacks.get(id)!;
        let start = stack.pop();
        if (start === undefined) return;
        if (cursor - start < LINE) {
            start = cursor - 6 * S;
            cursor += 12 * S;
        }
        const depth = stack.length;
        const c = x(id);
        const box = {
            id,
            depth,
            x: c - ACTIVATION_WIDTH / 2 + (ACTIVATION_WIDTH / 2) * depth,
            y: start,
            width: ACTIVATION_WIDTH,
            height: cursor - start,
        };
        activations.push(box);
        reach(box.x, box.x + box.width, cursor);
    };

    script.items.forEach((item, position) => {
        switch (item.kind) {
            case "autonumber":
                counter = item.visible
                    ? { next: item.start, step: item.step }
                    : undefined;
                return;
            case "activate":
                startActivation(item.who, cursor);
                return;
            case "deactivate":
                endActivation(item.who);
                return;
            case "note": {
                cursor += BOX_MARGIN;
                const lines = item.wrap
                    ? wrapLines(
                          item.text,
                          NOTE_WIDTH - 2 * WRAP_PADDING,
                          SEQUENCE_TEXT,
                          false,
                          measure,
                      )
                    : split(item.text);
                const textWidth = widthOf(lines, measure) + 2 * WRAP_PADDING;
                const height = lines.length * LINE + 2 * NOTE_MARGIN;
                const a = x(item.from);
                const b = x(item.to);
                let left: number;
                let noteWidth = Math.max(NOTE_WIDTH, textWidth);
                if (item.placement === "right") left = a + NOTE_OFFSET;
                else if (item.placement === "left")
                    left = a - NOTE_OFFSET - noteWidth;
                else if (item.from === item.to) {
                    noteWidth = Math.max(noteWidth, width(item.from));
                    left = a - noteWidth / 2;
                } else {
                    left = Math.min(a, b) - NOTE_OFFSET;
                    noteWidth = Math.abs(b - a) + 2 * NOTE_OFFSET;
                }
                notes.push({
                    x: left,
                    y: cursor,
                    width: noteWidth,
                    height,
                    lines,
                });
                cursor += height;
                reach(left, left + noteWidth, cursor);
                return;
            }
            case "open": {
                cursor += BOX_MARGIN;
                const frameTop = cursor;
                const known = fragmentWidths.get(item.index);
                const titleLines =
                    item.title && known !== undefined
                        ? wrapLines(
                              `[${item.title}]`,
                              Math.max(known - TAB.width - 2 * WRAP_PADDING, 1),
                              SEQUENCE_TEXT,
                              false,
                              measure,
                          )
                        : item.title
                          ? [`[${item.title}]`]
                          : [];
                if (item.fragment === "rect") cursor += BOX_MARGIN;
                else
                    cursor +=
                        15 * S + Math.max(titleLines.length * LINE, 20 * S);
                frames.push({
                    index: item.index,
                    fragment: item.fragment,
                    title: item.title,
                    ...(item.color && { color: item.color }),
                    top: frameTop,
                    depth: frames.length,
                    left: Number.POSITIVE_INFINITY,
                    right: Number.NEGATIVE_INFINITY,
                    bottom: cursor,
                    sections: [],
                });
                return;
            }
            case "section": {
                const frame = frames[frames.length - 1];
                if (!frame) return;
                cursor = Math.max(cursor, frame.bottom) + 15 * S;
                const y = cursor;
                const known = fragmentWidths.get(frame.index);
                const lines = item.title
                    ? known !== undefined
                        ? wrapLines(
                              `[${item.title}]`,
                              Math.max(known - 2 * WRAP_PADDING, 1),
                              SEQUENCE_TEXT,
                              false,
                              measure,
                          )
                        : [`[${item.title}]`]
                    : [];
                frame.sections.push({ y, title: item.title });
                cursor += 10 * S + Math.max(lines.length * LINE, 20 * S);
                frame.bottom = cursor;
                return;
            }
            case "close": {
                const frame = frames.pop();
                if (!frame) return;
                const padding = BOX_MARGIN;
                const bottom = Math.max(cursor, frame.bottom) + padding;
                if (!Number.isFinite(frame.left)) {
                    frame.left = centers[0];
                    frame.right = centers[centers.length - 1];
                }
                frame.left -= padding;
                frame.right += padding;
                frame.bottom = bottom;
                closed.push(frame);
                cursor = bottom;
                reach(frame.left, frame.right, bottom);
                return;
            }
            case "message": {
                const self = item.from === item.to;
                const text = messageText(item);
                const opens = script.items[position + 1];
                const opensBar =
                    opens?.kind === "activate" && opens.who === item.to ? 1 : 0;
                const rightward = x(item.to) >= x(item.from);
                const from = edges(item.from);
                const to = edges(item.to, opensBar);
                let fromX = self
                    ? from.right
                    : rightward
                      ? from.right
                      : from.left;
                let toX = rightward ? to.left : to.right;
                const creates = script.created[item.to] === item.index;
                if (creates) {
                    const half = width(item.to) / 2;
                    toX = rightward ? x(item.to) - half : x(item.to) + half;
                }
                const span = Math.abs(toX - fromX);
                const lines = item.wrap
                    ? wrapLines(
                          text,
                          Math.max(span + 2 * WRAP_PADDING, NOTE_WIDTH) -
                              2 * WRAP_PADDING,
                          SEQUENCE_TEXT,
                          false,
                          measure,
                      )
                    : split(text);
                const labelHeight = lines.length * LINE;
                const labelWidth = widthOf(lines, measure);
                // +10, a line's height, then the label's: 46 at 16 px for
                // one line, and the line sits at the cursor.
                cursor += BOX_MARGIN + LINE + labelHeight;
                const lineY = cursor;
                const number = counter && {
                    at: { x: fromX, y: lineY },
                    text: String(counter.next),
                };
                if (counter) counter.next += counter.step;
                const dots: Point[] = [];
                if (item.dots === "start" || item.dots === "both")
                    dots.push({ x: x(item.from), y: lineY });
                if (item.dots === "end" || item.dots === "both")
                    dots.push({ x: x(item.to), y: lineY });
                const labelCenter = self ? x(item.from) : (fromX + toX) / 2;
                const label = {
                    lines,
                    box: {
                        x: labelCenter - labelWidth / 2,
                        y: lineY - labelHeight - 5 * S,
                        width: labelWidth,
                        height: labelHeight,
                    },
                };
                if (self) {
                    const loopX = fromX + 1;
                    const route = script.rightAngles
                        ? [
                              { x: loopX, y: lineY },
                              { x: loopX + SELF_LOOP * 0.75, y: lineY },
                              {
                                  x: loopX + SELF_LOOP * 0.75,
                                  y: lineY + 25 * S,
                              },
                              { x: loopX, y: lineY + 25 * S },
                          ]
                        : [
                              { x: loopX, y: lineY },
                              { x: loopX + SELF_LOOP, y: lineY - 10 * S },
                              { x: loopX + SELF_LOOP, y: lineY + 30 * S },
                              { x: loopX, y: lineY + 20 * S },
                          ];
                    const [a, b, c, d] = route;
                    const path = script.rightAngles
                        ? `M${a.x},${a.y}L${b.x},${b.y}L${c.x},${c.y}L${d.x},${d.y}`
                        : `M${a.x},${a.y}C${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`;
                    messages.push({
                        relationship: item.relationship,
                        from: item.from,
                        to: item.to,
                        // The loop's tangents: out to the right, back in from it.
                        route: script.rightAngles
                            ? route
                            : [
                                  a,
                                  { x: a.x + 1, y: a.y },
                                  { x: d.x + 1, y: d.y },
                                  d,
                              ],
                        path,
                        label,
                        start: item.start,
                        end: item.end,
                        ...(number && { number }),
                        dots,
                    });
                    const room = Math.max(labelWidth / 2, SELF_REACH);
                    cursor += SELF_EXTRA;
                    reach(x(item.from) - room, x(item.from) + room, cursor);
                } else {
                    const direction = rightward ? 1 : -1;
                    // The sequence number's circle sits on the line's start.
                    if (number) fromX += direction * NUMBER_RADIUS;
                    const route = [
                        { x: fromX, y: lineY },
                        { x: toX, y: lineY },
                    ];
                    messages.push({
                        relationship: item.relationship,
                        from: item.from,
                        to: item.to,
                        route,
                        path: `M${fromX},${lineY}L${toX},${lineY}`,
                        label,
                        start: item.start,
                        end: item.end,
                        ...(number && { number }),
                        dots,
                    });
                    reach(
                        Math.min(fromX, toX, label.box.x),
                        Math.max(fromX, toX, label.box.x + label.box.width),
                        cursor,
                    );
                }
                if (creates) {
                    const id = item.to;
                    participants.set(id, {
                        head: {
                            x: x(id) - width(id) / 2,
                            y: lineY - ROW / 2,
                            width: width(id),
                            height: ROW,
                        },
                    });
                    lifelineTop.set(id, lineY + ROW / 2);
                    cursor += ROW / 2;
                }
                for (const id of [item.from, item.to]) {
                    if (script.destroyed[id] !== item.index) continue;
                    lifelineBottom.set(id, lineY);
                    const entry = participants.get(id);
                    if (script.mirror && entry)
                        entry.foot = {
                            x: x(id) - width(id) / 2,
                            y: lineY - ROW / 2,
                            width: width(id),
                            height: ROW,
                        };
                    // Mermaid moves down half a row with or without the footer.
                    cursor = Math.max(cursor, lineY + ROW / 2);
                }
                return;
            }
        }
    });
    // A bar nothing closes runs to the last item.
    for (const id of order) while (stacks.get(id)!.length) endActivation(id);

    let bottom: number;
    if (script.mirror) {
        cursor += TAIL;
        for (const id of order) {
            const entry = participants.get(id);
            if (!entry || lifelineBottom.has(id)) continue;
            entry.foot = {
                x: x(id) - width(id) / 2,
                y: cursor,
                width: width(id),
                height: ROW,
            };
            lifelineBottom.set(id, cursor);
        }
        bottom = cursor + ROW;
    } else {
        // Every lifeline ends 30 below the last item (issue 196), in place
        // of Mermaid's run to y 2000.
        cursor += TAIL;
        for (const id of order)
            if (!lifelineBottom.has(id)) lifelineBottom.set(id, cursor);
        bottom = cursor;
    }

    const lifelines = order.flatMap((id) =>
        participants.has(id)
            ? [
                  {
                      id,
                      x: x(id),
                      top: lifelineTop.get(id)!,
                      bottom: lifelineBottom.get(id)!,
                  },
              ]
            : [],
    );

    const fragments: SequenceFragment[] = closed
        .sort((a, b) => a.depth - b.depth)
        .map((frame) => {
            const frameWidth = frame.right - frame.left;
            const titleLines = frame.title
                ? wrapLines(
                      `[${frame.title}]`,
                      Math.max(frameWidth - TAB.width - 2 * WRAP_PADDING, 1),
                      SEQUENCE_TEXT,
                      false,
                      measure,
                  )
                : [];
            const text = (lines: string[], center: number, y: number) => {
                const w = widthOf(lines, measure);
                return {
                    lines,
                    box: {
                        x: center - w / 2,
                        y,
                        width: w,
                        height: lines.length * LINE,
                    },
                };
            };
            return {
                x: frame.left,
                y: frame.top,
                width: frameWidth,
                height: frame.bottom - frame.top,
                fragment: frame.fragment,
                depth: frame.depth,
                ...(titleLines.length && {
                    title: text(
                        titleLines,
                        frame.left + (frameWidth + TAB.width) / 2,
                        frame.top + 5 * S,
                    ),
                }),
                sections: frame.sections.map((section) => {
                    const lines = section.title
                        ? wrapLines(
                              `[${section.title}]`,
                              Math.max(frameWidth - 2 * WRAP_PADDING, 1),
                              SEQUENCE_TEXT,
                              false,
                              measure,
                          )
                        : [];
                    return {
                        y: section.y,
                        ...(lines.length && {
                            title: text(
                                lines,
                                frame.left + frameWidth / 2,
                                section.y + 5 * S,
                            ),
                        }),
                    };
                }),
                ...(frame.color && { color: frame.color }),
            };
        });

    const boxes = script.boxes.map((box) => {
        const heads = box.participants
            .map((id) => participants.get(id)?.head)
            .filter((head): head is Bounds => head !== undefined);
        const left = Math.min(...heads.map((h) => h.x)) - 2 * BOX_MARGIN;
        const right =
            Math.max(...heads.map((h) => h.x + h.width)) + 2 * BOX_MARGIN;
        const boxTop = 0;
        const titleWidth = box.title
            ? measure(box.title, SEQUENCE_TEXT, false)
            : 0;
        return {
            x: left,
            y: boxTop,
            width: right - left,
            height: bottom + GROUP_MARGIN - boxTop,
            ...(box.title && {
                title: {
                    lines: [box.title],
                    box: {
                        x: (left + right) / 2 - titleWidth / 2,
                        y: boxTop + GROUP_MARGIN,
                        width: titleWidth,
                        height: LINE,
                    },
                },
            }),
            ...(box.fill && { fill: box.fill }),
        };
    });

    const all: Bounds[] = [
        ...[...participants.values()].flatMap((p) =>
            p.foot ? [p.head, p.foot] : [p.head],
        ),
        ...notes,
        ...fragments,
        ...boxes,
        ...messages.map((m) => m.label.box),
        ...messages.flatMap((m) =>
            m.route.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 })),
        ),
    ];
    const minX = Math.min(...all.map((b) => b.x));
    const minY = Math.min(...all.map((b) => b.y));
    const maxX = Math.max(...all.map((b) => b.x + b.width));
    const maxY = Math.max(...all.map((b) => b.y + b.height));

    return {
        layout: {
            participants,
            lifelines,
            activations,
            messages,
            notes,
            fragments,
            boxes,
            bounds: {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
            },
        },
        fragments: closed.map((f) => ({
            index: f.index,
            width: f.right - f.left,
        })),
    };
}
