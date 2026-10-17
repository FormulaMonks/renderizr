/**
 * Turns Mermaid's parsed sequence diagram (`SequenceDB`) into the plain
 * model the page lays out (spec: Sequence diagrams): its participants, its
 * boxes and the ordered list of what happens between them, every label as
 * plain text lines. The list is the sequence script the page's own layout
 * walks; nothing here measures or places anything.
 *
 * What it leaves out goes to `ignored`: participant types it draws as the
 * participant box, and half arrows, which fall back to whole ones.
 */

import { plainLabel } from "./flowchart.js";

/**
 * Mermaid's line types (`SequenceDB.LINETYPE`) onto a message's start and
 * end markers and its line. Half arrows (41 to 58) fall back: a solid half
 * head draws as an arrow and a barb as an open arrow, at the end the syntax
 * puts it.
 */
const LINES = {
    0: ["none", "arrow", "solid"],
    1: ["none", "arrow", "dotted"],
    3: ["none", "cross", "solid"],
    4: ["none", "cross", "dotted"],
    5: ["none", "none", "solid"],
    6: ["none", "none", "dotted"],
    24: ["none", "openArrow", "solid"],
    25: ["none", "openArrow", "dotted"],
    33: ["arrow", "arrow", "solid"],
    34: ["arrow", "arrow", "dotted"],
    41: ["none", "arrow", "solid"],
    42: ["none", "arrow", "solid"],
    43: ["none", "openArrow", "solid"],
    44: ["none", "openArrow", "solid"],
    45: ["arrow", "none", "solid"],
    46: ["arrow", "none", "solid"],
    47: ["openArrow", "none", "solid"],
    48: ["openArrow", "none", "solid"],
    51: ["none", "arrow", "dotted"],
    52: ["none", "arrow", "dotted"],
    53: ["none", "openArrow", "dotted"],
    54: ["none", "openArrow", "dotted"],
    55: ["arrow", "none", "dotted"],
    56: ["arrow", "none", "dotted"],
    57: ["openArrow", "none", "dotted"],
    58: ["openArrow", "none", "dotted"],
};

/** The first half arrow line type; every one from here on falls back. */
const HALF_ARROWS = 41;

/** Fragment line types: what each opens, splits or closes. */
const FRAGMENTS = {
    10: ["open", "loop"],
    11: ["close"],
    12: ["open", "alt"],
    13: ["section"],
    14: ["close"],
    15: ["open", "opt"],
    16: ["close"],
    19: ["open", "par"],
    20: ["section"],
    21: ["close"],
    22: ["open", "rect"],
    23: ["close"],
    27: ["open", "critical"],
    28: ["section"],
    29: ["close"],
    30: ["open", "break"],
    31: ["close"],
    // `par_over` draws as a `par`.
    32: ["open", "par"],
};

const NOTE = 2;
const ACTIVE_START = 17;
const ACTIVE_END = 18;
const AUTONUMBER = 26;
/** A central connection's own entry: an activation on its lifeline. */
const CENTRAL = [59, 60];

/** Where a message's central connection draws its dot. */
const DOTS = { 59: "end", 60: "start", 61: "both" };

const PLACEMENTS = ["left", "right", "over"];

/** The participant types Renderizr draws a shape of its own for. */
const DRAWN_TYPES = new Set(["participant", "actor", "database", "queue"]);

/** A label as plain text lines, whatever Mermaid kept it as. */
const text = (value) => plainLabel(value?.text ?? value ?? "");

/**
 * The page's model of the sequence diagram `db` parsed, under `config`
 * (spec: The view model). Participants keep Mermaid's names as ids;
 * messages keep Mermaid's index in its list.
 */
export function readSequence(db, config, ignored) {
    const sequence = config.sequence ?? {};
    const wraps = Boolean(config.wrap || sequence.wrap);

    // Participant menus (`link`, `links`, `properties`, `details`) drop:
    // a participant never becomes an activation target.
    const participants = [...db.getActors()].map(([id, actor]) => {
        let type = actor.type ?? "participant";
        if (!DRAWN_TYPES.has(type)) {
            ignored.add(`participant type "${type}"`);
            type = "participant";
        }
        return { id, label: text(actor.description) || id, type };
    });

    const created = new Map(
        [...db.getCreatedActors()].map(([id, index]) => [index, id]),
    );
    const destroyed = new Map();
    for (const [id, index] of db.getDestroyedActors())
        destroyed.set(index, [...(destroyed.get(index) ?? []), id]);

    const items = [];
    for (const [index, message] of db.getMessages().entries()) {
        const { type } = message;
        const fragment = FRAGMENTS[type];
        if (fragment) {
            const [kind, name] = fragment;
            if (kind === "open" && name === "rect") {
                const color = text(message.message);
                items.push({
                    kind,
                    fragment: name,
                    title: "",
                    ...(color && { color }),
                });
            } else if (kind === "open") {
                items.push({
                    kind,
                    fragment: name,
                    title: text(message.message),
                });
            } else if (kind === "section") {
                items.push({ kind, title: text(message.message) });
            } else {
                items.push({ kind });
            }
            continue;
        }
        if (type === NOTE) {
            items.push({
                kind: "note",
                placement: PLACEMENTS[message.placement] ?? "over",
                from: message.from,
                to: message.to ?? message.from,
                text: text(message.message),
                wrap: Boolean(message.wrap) || wraps,
            });
            continue;
        }
        if (type === ACTIVE_START || CENTRAL.includes(type)) {
            items.push({ kind: "activate", who: message.from });
            continue;
        }
        if (type === ACTIVE_END) {
            items.push({ kind: "deactivate", who: message.from });
            continue;
        }
        if (type === AUTONUMBER) {
            const { start, step, visible } = message.message ?? {};
            items.push({
                kind: "autonumber",
                ...(typeof start === "number" && { start }),
                ...(typeof step === "number" && { step }),
                visible: visible !== false,
            });
            continue;
        }
        const line = LINES[type];
        if (!line) continue;
        if (type >= HALF_ARROWS) ignored.add("half arrows");
        const [start, end, pattern] = line;
        const dots = DOTS[message.centralConnection];
        items.push({
            kind: "message",
            id: String(message.id ?? index),
            from: message.from,
            to: message.to,
            label: text(message.message),
            line: pattern,
            start,
            end,
            wrap: Boolean(message.wrap) || wraps,
            ...(dots && { dots }),
            ...(created.has(index) && { creates: created.get(index) }),
            ...(destroyed.has(index) && { destroys: destroyed.get(index) }),
        });
    }

    return {
        kind: "sequence",
        participants,
        boxes: db.getBoxes().map((box) => ({
            title: text(box.name),
            ...(box.fill &&
                box.fill !== "transparent" && { fill: String(box.fill) }),
            participants: [...box.actorKeys],
        })),
        items,
        numbers: Boolean(sequence.showSequenceNumbers),
        mirror: sequence.mirrorActors !== false,
        rightAngles: sequence.rightAngles === true,
    };
}
