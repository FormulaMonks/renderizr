/**
 * A Mermaid sequence diagram's layout (spec: Sequence diagrams): our own,
 * with no Dagre and no router. One pass over the sequence script with a
 * vertical cursor, a fragment stack and an activation stack per
 * participant, the way Mermaid's `sequenceRenderer.ts` walks its message
 * list. A first pass finds each fragment's width, so the second can wrap
 * its title to that width minus the tab.
 *
 * Every length is Mermaid's `classic` one at 16 px, scaled by 1.5 for the
 * 24 px Renderizr draws Mermaid diagrams at; the participant row is
 * `neo`'s, so every lifeline starts on one line. Text draws at 20 (16
 * scaled by 1.25), a little smaller than the lengths.
 *
 * Pure: the caller hands in each participant's width and the text measure.
 * Notes are items like any other, so a caller that hides them filters them
 * out of the script first and lays it out again.
 */

import type {
    MermaidMessage,
    MermaidSequence,
    MermaidSequenceItem,
} from "../../model/types";
import type { MeasureText } from "./boundary";
import { wrapLines } from "./boundary";
import type { Bounds } from "./bounds";
import type { Point } from "./shapes/types";

/** How much bigger Renderizr draws a sequence diagram than Mermaid does. */
const S = 1.5;
/** The size sequence text draws at: Mermaid's 16 px, scaled by 1.25. */
export const SEQUENCE_TEXT = 16 * 1.25;
/**
 * One line of text, as a multiple of the text's size: Mermaid's 18 at 16
 * px, scaled by 1.5 like every other length, so a message's pitch is
 * Mermaid's 46 scaled, 69, though the text draws smaller.
 */
const LINE_SCALE = (18 * S) / SEQUENCE_TEXT;
/** A participant's least width, and the least distance between two. */
export const PARTICIPANT_WIDTH = 150 * S;
/** `neo`'s participant row: max(65, 44 + 6 + label + 6) at 16 px. */
export const PARTICIPANT_ROW = Math.max(65, 44 + 6 + 18 + 6) * S;
/** The participant row, under the short name the layout uses throughout. */
const ROW = PARTICIPANT_ROW;
/** The least gap between two participants' boxes: Mermaid's `actorMargin`. */
const ACTOR_MARGIN = 50 * S;
/** The room around a note, a fragment and a box: Mermaid's `boxMargin`. */
const BOX_MARGIN = 10 * S;
/** The padding either side of wrapped text: Mermaid's `wrapPadding`. */
const WRAP_PADDING = 10 * S;
/** The padding above and below a note's text: Mermaid's `noteMargin`. */
const NOTE_MARGIN = 10 * S;
/** A note's least width: Mermaid's `noteWidth`. */
const NOTE_WIDTH = 150 * S;
/** How far a note left or right of a participant sits from its lifeline. */
const NOTE_OFFSET = 25 * S;
/** An activation bar's width; each nested bar steps right by half of it. */
export const ACTIVATION_WIDTH = 10 * S;
/** How far right of its lifeline a message to the same participant loops. */
const SELF_LOOP = 60 * S;
/** The extra height a message to the same participant takes below its line. */
const SELF_EXTRA = 30 * S;
/** The least room a message to the same participant claims either side. */
const SELF_REACH = 75 * S;
/** A fragment's keyword tab: 50 × 20 with a 7 px cut corner. */
export const TAB = { width: 50 * S, height: 20 * S, cut: 7 * S };
/** `box … end`: the margin around its participants, and its title's. */
const GROUP_MARGIN = 5 * S;
/** The room below the last item, before the footer or where lifelines end. */
const TAIL = 20 * S;
/** A sequence number's circle: Mermaid 12 draws about 11 at 16 px, where its source reads 6. */
export const NUMBER_RADIUS = 11 * S;
/** A central connection's dot: 5 at 16 px. */
export const DOT_RADIUS = 5 * S;

/** Lines of text and the box they fill, top-left first. */
export type SequenceText = { lines: string[]; box: Bounds };

export type SequenceMessage = {
    /** The message's id in the script. */
    id: string;
    from: string;
    to: string;
    /**
     * The points the line passes through, its start first: two for a
     * straight message; a self-message's cubic loop (`loop`) or its four
     * right-angled corners.
     */
    route: Point[];
    /** Whether `route` is a cubic Bézier's start, two controls and end. */
    loop: boolean;
    label: SequenceText;
    start: MermaidMessage["start"];
    end: MermaidMessage["end"];
    line: MermaidMessage["line"];
    /** Its sequence number's circle, centered on the line's start. */
    number?: { at: Point; text: string };
    /** Central connections' dots, on the lifelines. */
    dots: Point[];
};

/**
 * The messages something holds, as indexes into the layout's `messages`:
 * from `from` up to `to`, not including it, so a range that holds no
 * message has `from` equal to `to`. An animation steps once per message, so
 * this is also the steps it shows at.
 */
export type MessageRange = { from: number; to: number };

export type SequenceFragment = Bounds & {
    fragment: string;
    depth: number;
    title?: SequenceText;
    /** Every message inside the fragment, in any of its sections. */
    messages: MessageRange;
    /**
     * The sections after the first (`else`, `and`, `option`), each with the
     * messages it holds; the first section's condition is the title.
     */
    sections: { y: number; title?: SequenceText; messages: MessageRange }[];
    color?: string;
};

export type SequenceLayout = {
    /** Each participant's header box, and its footer box when one draws, by id. */
    participants: Map<string, { head: Bounds; foot?: Bounds }>;
    lifelines: { id: string; x: number; top: number; bottom: number }[];
    /** Each bar holds the messages from the one that opens it to the last before it closes. */
    activations: (Bounds & {
        id: string;
        depth: number;
        messages: MessageRange;
    })[];
    messages: SequenceMessage[];
    /** Each note holds the message written after it, or the last one. */
    notes: (Bounds & { lines: string[]; messages: MessageRange })[];
    fragments: SequenceFragment[];
    boxes: (Bounds & { title?: SequenceText; fill?: string })[];
    /** The size and line height its text was laid out at. */
    text: { size: number; line: number };
    bounds: Bounds;
};

/**
 * Lay the sequence script out. `widths` holds each participant's width as
 * the page measured its name, by participant id; `text` is the size every
 * label draws at.
 */
export function layOutSequence(
    script: MermaidSequence,
    widths: ReadonlyMap<string, number>,
    measure: MeasureText,
    text: number = SEQUENCE_TEXT,
): SequenceLayout {
    const first = pass(script, widths, measure, text, new Map());
    return pass(script, widths, measure, text, first.fragmentWidths).layout;
}

type Frame = {
    position: number;
    fragment: string;
    title: string;
    color?: string;
    top: number;
    depth: number;
    left: number;
    right: number;
    bottom: number;
    /** The first message placed after the fragment opens. */
    from: number;
    sections: { y: number; title: string; from: number }[];
};

function pass(
    script: MermaidSequence,
    widths: ReadonlyMap<string, number>,
    measure: MeasureText,
    size: number,
    fragmentWidths: ReadonlyMap<number, number>,
): { layout: SequenceLayout; fragmentWidths: Map<number, number> } {
    const LINE = size * LINE_SCALE;
    const order = script.participants.map((p) => p.id);
    const at = new Map(order.map((id, i) => [id, i]));
    const width = (id: string) =>
        Math.max(PARTICIPANT_WIDTH, widths.get(id) ?? 0);
    const widthOf = (lines: string[]) =>
        Math.max(0, ...lines.map((line) => measure(line, size, false)));
    const wrapped = (value: string, wrap: boolean, within: number) =>
        wrap
            ? wrapLines(value, Math.max(within, 1), size, false, measure)
            : value.split("\n");
    const created = new Map<string, number>();
    const destroyed = new Map<string, number>();
    for (const [position, item] of script.items.entries()) {
        if (item.kind !== "message") continue;
        if (item.creates !== undefined) created.set(item.creates, position);
        for (const id of item.destroys ?? []) destroyed.set(id, position);
    }

    // --- Columns: what sits between two neighbors widens the gap between them.
    const need = order.map(() => 0);
    const widen = (i: number | undefined, room: number) => {
        if (i !== undefined && i >= 0 && i < need.length - 1)
            need[i] = Math.max(need[i], room);
    };
    for (const item of script.items) {
        if (item.kind === "message") {
            const lines = wrapped(
                item.label,
                item.wrap,
                NOTE_WIDTH - 2 * WRAP_PADDING,
            );
            const room = widthOf(lines) + 2 * WRAP_PADDING;
            const a = at.get(item.from);
            const b = at.get(item.to);
            if (a === undefined || b === undefined) continue;
            if (a === b) widen(a, room / 2);
            else if (Math.abs(a - b) === 1) widen(Math.min(a, b), room);
        } else if (item.kind === "note" && item.placement !== "over") {
            const lines = wrapped(
                item.text,
                item.wrap,
                NOTE_WIDTH - 2 * WRAP_PADDING,
            );
            const room =
                Math.max(NOTE_WIDTH, widthOf(lines) + 2 * WRAP_PADDING) +
                NOTE_OFFSET;
            const i = at.get(item.from);
            if (i === undefined) continue;
            widen(item.placement === "right" ? i : i - 1, room);
        }
    }
    const boxOf = new Map<string, number>();
    for (const [b, box] of script.boxes.entries()) {
        for (const id of box.participants) boxOf.set(id, b);
    }
    const centers: number[] = [];
    for (const [i, id] of order.entries()) {
        if (i === 0) {
            centers.push(width(id) / 2 + (boxOf.has(id) ? GROUP_MARGIN : 0));
            continue;
        }
        const previous = order[i - 1];
        let distance = Math.max(
            width(previous) / 2 + width(id) / 2 + ACTOR_MARGIN,
            need[i - 1] + ACTOR_MARGIN,
        );
        // Entering a box, and leaving one, moves the participant over.
        if (boxOf.get(id) !== boxOf.get(previous)) {
            if (boxOf.has(id)) distance += GROUP_MARGIN;
            if (boxOf.has(previous)) distance += BOX_MARGIN + GROUP_MARGIN;
        }
        // A participant drawn later, at the message that creates it, moves
        // over by half its width.
        if (created.has(id)) distance += width(id) / 2;
        centers.push(centers[i - 1] + distance);
    }
    const x = (id: string) => centers[at.get(id) ?? 0] ?? 0;
    const headAt = (id: string, y: number): Bounds => ({
        x: x(id) - width(id) / 2,
        y,
        width: width(id),
        height: ROW,
    });

    // --- Rows: one cursor down the list.
    const titled = script.boxes.some((box) => box.title);
    const top = titled ? BOX_MARGIN + LINE : 0;
    const participants = new Map<string, { head: Bounds; foot?: Bounds }>();
    const lifelineTop = new Map<string, number>();
    const lifelineBottom = new Map<string, number>();
    for (const id of order) {
        if (created.has(id)) continue;
        participants.set(id, { head: headAt(id, top) });
        lifelineTop.set(id, top + ROW);
    }
    let cursor = top + ROW;

    /** Each participant's open bars: where each starts, and its first message. */
    const stacks = new Map<string, { y: number; from: number }[]>(
        order.map((id) => [id, []]),
    );
    const activations: SequenceLayout["activations"] = [];
    const messages: SequenceMessage[] = [];
    const notes: SequenceLayout["notes"] = [];
    const frames: Frame[] = [];
    const closed: (Frame & { to: number })[] = [];
    // Mermaid numbers every message, shown or not, and an `autonumber`
    // without a start or step goes on from where it was.
    const counter = { next: 1, step: 1, visible: false };

    /** The left and right edges of a participant's activation bars, or its lifeline. */
    const edges = (id: string, extra = 0) => {
        const n = (stacks.get(id)?.length ?? 0) + extra;
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
    /** Every open fragment grows to hold what was just placed. */
    const reach = (left: number, right: number, bottom: number) => {
        for (const frame of frames) {
            frame.left = Math.min(frame.left, left);
            frame.right = Math.max(frame.right, right);
            frame.bottom = Math.max(frame.bottom, bottom);
        }
    };
    const endActivation = (id: string) => {
        const stack = stacks.get(id);
        const open = stack?.pop();
        if (!stack || open === undefined) return;
        let start = open.y;
        // A bar that would be shorter than a line grows to one.
        if (cursor - start < LINE) {
            start = cursor - 6 * S;
            cursor += 12 * S;
        }
        const depth = stack.length;
        const box = {
            id,
            depth,
            x: x(id) - ACTIVATION_WIDTH / 2 + (ACTIVATION_WIDTH / 2) * depth,
            y: start,
            width: ACTIVATION_WIDTH,
            height: cursor - start,
            messages: { from: open.from, to: messages.length },
        };
        activations.push(box);
        reach(box.x, box.x + box.width, cursor);
    };

    const place = (item: MermaidSequenceItem, position: number) => {
        switch (item.kind) {
            case "autonumber":
                if (item.start !== undefined) counter.next = item.start;
                if (item.step !== undefined) counter.step = item.step;
                counter.visible = item.visible;
                return;
            case "activate":
                // A bar opened right after a message starts on its line,
                // so it holds that message.
                stacks.get(item.who)?.push({
                    y: cursor,
                    from:
                        script.items[position - 1]?.kind === "message"
                            ? messages.length - 1
                            : messages.length,
                });
                return;
            case "deactivate":
                endActivation(item.who);
                return;
            case "note": {
                cursor += BOX_MARGIN;
                const lines = wrapped(
                    item.text,
                    item.wrap,
                    NOTE_WIDTH - 2 * WRAP_PADDING,
                );
                const textWidth = widthOf(lines) + 2 * WRAP_PADDING;
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
                    // Mermaid's span, widened round its middle for text
                    // that wouldn't fit it.
                    noteWidth = Math.max(
                        Math.abs(b - a) + 2 * NOTE_OFFSET,
                        textWidth,
                    );
                    left = (a + b) / 2 - noteWidth / 2;
                }
                notes.push({
                    x: left,
                    y: cursor,
                    width: noteWidth,
                    height,
                    lines,
                    // The message after it; the last one is settled below.
                    messages: {
                        from: messages.length,
                        to: messages.length + 1,
                    },
                });
                cursor += height;
                reach(left, left + noteWidth, cursor);
                return;
            }
            case "open": {
                cursor += BOX_MARGIN;
                const frameTop = cursor;
                const known = fragmentWidths.get(position);
                const title = item.title ? `[${item.title}]` : "";
                const titleLines = !title
                    ? []
                    : known !== undefined
                      ? wrapped(
                            title,
                            true,
                            known - TAB.width - 2 * WRAP_PADDING,
                        )
                      : [title];
                if (item.fragment === "rect") cursor += BOX_MARGIN;
                else
                    cursor +=
                        15 * S + Math.max(titleLines.length * LINE, 20 * S);
                frames.push({
                    position,
                    fragment: item.fragment,
                    title: item.title,
                    ...(item.color && { color: item.color }),
                    top: frameTop,
                    depth: frames.length,
                    left: Number.POSITIVE_INFINITY,
                    right: Number.NEGATIVE_INFINITY,
                    bottom: cursor,
                    from: messages.length,
                    sections: [],
                });
                return;
            }
            case "section": {
                const frame = frames[frames.length - 1];
                if (!frame) return;
                cursor = Math.max(cursor, frame.bottom) + 15 * S;
                const y = cursor;
                const known = fragmentWidths.get(frame.position);
                const title = item.title ? `[${item.title}]` : "";
                const lines = !title
                    ? []
                    : known !== undefined
                      ? wrapped(title, true, known - 2 * WRAP_PADDING)
                      : [title];
                frame.sections.push({
                    y,
                    title: item.title,
                    from: messages.length,
                });
                cursor += 10 * S + Math.max(lines.length * LINE, 20 * S);
                frame.bottom = cursor;
                return;
            }
            case "close": {
                const frame = frames.pop();
                if (!frame) return;
                const bottom = Math.max(cursor, frame.bottom) + BOX_MARGIN;
                // A fragment that holds nothing spans every participant.
                if (!Number.isFinite(frame.left)) {
                    frame.left = centers[0] ?? 0;
                    frame.right = centers[centers.length - 1] ?? 0;
                }
                frame.left -= BOX_MARGIN;
                frame.right += BOX_MARGIN;
                frame.bottom = bottom;
                closed.push({ ...frame, to: messages.length });
                cursor = bottom;
                reach(frame.left, frame.right, bottom);
                return;
            }
            case "message":
                placeMessage(item, position);
                return;
        }
    };

    const placeMessage = (item: MermaidMessage, position: number) => {
        const self = item.from === item.to;
        const next = script.items[position + 1];
        // A message that activates its target ends at the bar it opens.
        const opensBar =
            next?.kind === "activate" && next.who === item.to ? 1 : 0;
        const rightward = x(item.to) >= x(item.from);
        const from = edges(item.from);
        const to = edges(item.to, opensBar);
        let fromX = self || rightward ? from.right : from.left;
        let toX = rightward ? to.left : to.right;
        const creates = item.creates === item.to;
        // A message that creates its target, or ends a lifeline whose
        // footer draws on it, stops at that box, as in Mermaid.
        const destroysTo = script.mirror && item.destroys?.includes(item.to);
        if (creates || destroysTo) {
            const half = width(item.to) / 2 + 3 * S;
            toX = rightward ? x(item.to) - half : x(item.to) + half;
        }
        if (script.mirror && !self && item.destroys?.includes(item.from)) {
            const half = width(item.from) / 2;
            fromX = rightward ? x(item.from) + half : x(item.from) - half;
        }
        const span = Math.abs(toX - fromX);
        const lines = wrapped(
            item.label,
            item.wrap,
            Math.max(span + 2 * WRAP_PADDING, NOTE_WIDTH) - 2 * WRAP_PADDING,
        );
        const labelHeight = lines.length * LINE;
        const labelWidth = widthOf(lines);
        // A box margin and a line's height, then the label's: 46 at 16 px
        // for one line, and the line sits at the cursor.
        cursor += BOX_MARGIN + LINE + labelHeight;
        const lineY = cursor;
        const numbered = counter.visible || script.numbers;
        const number = numbered
            ? { at: { x: fromX, y: lineY }, text: String(counter.next) }
            : undefined;
        counter.next = Math.round((counter.next + counter.step) * 100) / 100;
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
        const shared = {
            id: item.id,
            from: item.from,
            to: item.to,
            label,
            start: item.start,
            end: item.end,
            line: item.line,
            ...(number && { number }),
            dots,
        };
        if (self) {
            const loopX = fromX + 1;
            const route = script.rightAngles
                ? [
                      { x: loopX, y: lineY },
                      { x: loopX + SELF_LOOP * 0.75, y: lineY },
                      { x: loopX + SELF_LOOP * 0.75, y: lineY + 25 * S },
                      { x: loopX, y: lineY + 25 * S },
                  ]
                : [
                      { x: loopX, y: lineY },
                      { x: loopX + SELF_LOOP, y: lineY - 10 * S },
                      { x: loopX + SELF_LOOP, y: lineY + 30 * S },
                      { x: loopX, y: lineY + 20 * S },
                  ];
            messages.push({ ...shared, route, loop: !script.rightAngles });
            const room = Math.max(labelWidth / 2, SELF_REACH);
            cursor += SELF_EXTRA;
            reach(x(item.from) - room, x(item.from) + room, cursor);
        } else {
            // The sequence number's circle sits on the line's start.
            if (number) fromX += (rightward ? 1 : -1) * NUMBER_RADIUS;
            const route = [
                { x: fromX, y: lineY },
                { x: toX, y: lineY },
            ];
            messages.push({ ...shared, route, loop: false });
            reach(
                Math.min(fromX, toX, label.box.x),
                Math.max(fromX, toX, label.box.x + label.box.width),
                cursor,
            );
        }
        if (creates) {
            // A created participant's box centers on the line, and its
            // lifeline starts below it.
            participants.set(item.to, {
                head: headAt(item.to, lineY - ROW / 2),
            });
            lifelineTop.set(item.to, lineY + ROW / 2);
            cursor += ROW / 2;
        }
        for (const id of item.destroys ?? []) {
            lifelineBottom.set(id, lineY);
            const entry = participants.get(id);
            if (script.mirror && entry)
                entry.foot = headAt(id, lineY - ROW / 2);
            // Mermaid moves down half a row with or without the footer.
            cursor = Math.max(cursor, lineY + ROW / 2);
        }
    };

    for (const [position, item] of script.items.entries())
        place(item, position);
    // A note with no message after it steps with the last one.
    const last = Math.max(0, messages.length - 1);
    for (const note of notes)
        if (note.messages.from > last)
            note.messages = { from: last, to: last + 1 };
    // A bar nothing closes draws nothing, as in Mermaid: a central
    // connection's never closes.

    cursor += TAIL;
    for (const id of order) {
        const entry = participants.get(id);
        if (!entry || lifelineBottom.has(id)) continue;
        if (script.mirror) entry.foot = headAt(id, cursor);
        lifelineBottom.set(id, cursor);
    }
    // Without the footer, every lifeline ends 30 below the last item, in
    // place of Mermaid's run to y 2000.
    const bottom = script.mirror ? cursor + ROW : cursor;

    const lifelines = order.flatMap((id) =>
        participants.has(id)
            ? [
                  {
                      id,
                      x: x(id),
                      top: lifelineTop.get(id) ?? top + ROW,
                      bottom: lifelineBottom.get(id) ?? bottom,
                  },
              ]
            : [],
    );

    const textAt = (lines: string[], center: number, y: number) => {
        const w = widthOf(lines);
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
    const fragments: SequenceFragment[] = [...closed]
        .sort((a, b) => a.depth - b.depth)
        .map((frame) => {
            const frameWidth = frame.right - frame.left;
            const titleLines = frame.title
                ? wrapped(
                      `[${frame.title}]`,
                      true,
                      frameWidth - TAB.width - 2 * WRAP_PADDING,
                  )
                : [];
            return {
                x: frame.left,
                y: frame.top,
                width: frameWidth,
                height: frame.bottom - frame.top,
                fragment: frame.fragment,
                depth: frame.depth,
                ...(titleLines.length && {
                    title: textAt(
                        titleLines,
                        frame.left + (frameWidth + TAB.width) / 2,
                        frame.top + 5 * S,
                    ),
                }),
                messages: { from: frame.from, to: frame.to },
                sections: frame.sections.map((section, i) => {
                    const lines = section.title
                        ? wrapped(
                              `[${section.title}]`,
                              true,
                              frameWidth - 2 * WRAP_PADDING,
                          )
                        : [];
                    const next = frame.sections[i + 1]?.from ?? frame.to;
                    return {
                        y: section.y,
                        messages: { from: section.from, to: next },
                        ...(lines.length && {
                            title: textAt(
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

    const boxes = script.boxes.flatMap((box) => {
        const heads = box.participants.flatMap((id) => {
            const head = participants.get(id)?.head;
            return head ? [head] : [];
        });
        if (!heads.length) return [];
        const left = Math.min(...heads.map((h) => h.x)) - 2 * BOX_MARGIN;
        const right =
            Math.max(...heads.map((h) => h.x + h.width)) + 2 * BOX_MARGIN;
        return [
            {
                x: left,
                y: 0,
                width: right - left,
                height: bottom + GROUP_MARGIN,
                ...(box.title && {
                    title: textAt(
                        [box.title],
                        (left + right) / 2,
                        GROUP_MARGIN,
                    ),
                }),
                ...(box.fill && { fill: box.fill }),
            },
        ];
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
        ...lifelines.map((l) => ({
            x: l.x,
            y: l.top,
            width: 0,
            height: l.bottom - l.top,
        })),
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
            text: { size, line: LINE },
            bounds: all.length
                ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
                : { x: 0, y: 0, width: 0, height: 0 },
        },
        fragmentWidths: new Map(
            closed.map((f) => [f.position, f.right - f.left]),
        ),
    };
}
