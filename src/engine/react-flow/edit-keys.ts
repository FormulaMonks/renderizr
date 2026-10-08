/**
 * The island's keys in editing (spec 13.3, 17.2): align, distribute, nudge,
 * select all and a tap on Space, by physical key, so Option's characters on
 * macOS don't get in the way. They work while the canvas has focus. The
 * island reaches this module only behind `__RENDERIZR_EDIT_MODE__`, so
 * builds compile it out (ADR 15). The hooks that wire these keys to the
 * canvas live in the island, which owns React (ADR 3).
 */

import type { AlignEdge, DistributeAxis } from "../geometry/arrange";
import type { Point } from "../geometry/shapes/types";

/** How far an arrow key nudges the selection (spec 13.3). */
export const NUDGE_STEP = 5;

/** How far an arrow key nudges the selection with Shift held (spec 13.3). */
export const NUDGE_STEP_LARGE = 50;

/** What an island key does in editing. */
export type EditKey =
    | { command: "align"; edge: AlignEdge }
    | { command: "distribute"; axis: DistributeAxis }
    | { command: "selectAll" }
    | { command: "nudge"; step: Point };

const ALIGN_KEYS: Partial<Record<string, AlignEdge>> = {
    KeyA: "left",
    KeyH: "center",
    KeyD: "right",
    KeyW: "top",
    KeyV: "middle",
    KeyS: "bottom",
};

const DISTRIBUTE_KEYS: Partial<Record<string, DistributeAxis>> = {
    KeyH: "horizontal",
    KeyV: "vertical",
};

/** Each arrow key as the way it moves the selection. */
const NUDGE_KEYS: Partial<Record<string, Point>> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
};

/** The parts of a key press the island's keys read. */
export type KeyPress = Pick<
    KeyboardEvent,
    "code" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey"
>;

/**
 * The island key `event` presses in editing, or `null` (spec 17.2):
 * Alt+A/H/D/W/V/S align, Alt+Shift+H/V distribute, Cmd/Ctrl+A selects every
 * element and the arrow keys nudge, by 50 with Shift.
 */
export function editKey(event: KeyPress): EditKey | null {
    const mod = event.ctrlKey || event.metaKey;
    if (event.altKey) {
        if (mod) return null;
        if (event.shiftKey) {
            const axis = DISTRIBUTE_KEYS[event.code];
            return axis ? { command: "distribute", axis } : null;
        }
        const edge = ALIGN_KEYS[event.code];
        return edge ? { command: "align", edge } : null;
    }
    if (mod)
        return event.code === "KeyA" && !event.shiftKey
            ? { command: "selectAll" }
            : null;
    const way = NUDGE_KEYS[event.code];
    if (!way) return null;
    const by = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    return { command: "nudge", step: { x: way.x * by, y: way.y * by } };
}

/** What the island's keys drive. */
export type EditKeyCommands = {
    align?(edge: AlignEdge): void;
    distribute?(axis: DistributeAxis): void;
    nudge?(step: Point): void;
    selectAll?(): void;
};
