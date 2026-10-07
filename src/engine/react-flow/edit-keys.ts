/**
 * The island's keys in editing (spec 13.3, 17.2): align, distribute, nudge,
 * select all and a tap on Space, by physical key, so Option's characters on
 * macOS don't get in the way. They work while the canvas has focus. The
 * island reaches this module only behind `__RENDERIZR_EDIT_MODE__`, so
 * builds compile it out (ADR 15).
 */

import {
    type KeyboardEvent as ReactKeyboardEvent,
    type RefObject,
    useEffect,
    useRef,
} from "react";
import type { EditedLayout, LayoutChange } from "../../model/index";
import type { AlignEdge, DistributeAxis } from "../geometry/arrange";
import type { Point } from "../geometry/shapes/types";
import type { StepState } from "./animation";
import { type Arrangement, arrangeChange } from "./arrange";
import type { Graph } from "./graph";
import { clickSelection, type SelectionOrder } from "./selection";

/** How far an arrow key nudges the selection, and with Shift (spec 13.3). */
export const NUDGE_STEP = 5;
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

/** The element a focus item names, as `data-focus-item` holds it. */
const focusedElement = (target: EventTarget | null) => {
    const item =
        target instanceof HTMLElement ? target.dataset.focusItem : undefined;
    return item?.startsWith("element:") ? item.slice(8) : undefined;
};

/** What the island hands its arranging commands and keys. */
export type EditKeysOptions = {
    wrapper: RefObject<HTMLElement | null>;
    /** Where the engine's handle finds `align` and `distribute`. */
    commands: EditKeyCommands;
    /** The view being edited as drawn, or null when nothing can be. */
    view: Graph | null;
    viewKey: string;
    edited: EditedLayout | undefined;
    selected: SelectionOrder;
    select(ids: SelectionOrder): void;
    /** The animation step shown, whose hidden elements select all skips. */
    stepState: StepState | undefined;
    onLayoutChanged?(change: LayoutChange): void;
};

/**
 * Align, distribute, nudge and select all on the view being edited, for
 * the engine's handle and the island's keys, and the keys themselves as a
 * key-down handler that says whether it took the key. Each arranging
 * command measures the selection as drawn, the reference element first,
 * and is one layout change (spec 13). A nudge with nothing selected is
 * left to pan (spec 13.3). A tap on Space, a press and release with no
 * pointer press between, adds the focused element to the selection or
 * takes it out; held while dragging, Space still pans.
 */
export function useEditKeys({
    wrapper,
    commands,
    view,
    viewKey,
    edited,
    selected,
    select,
    stepState,
    onLayoutChanged,
}: EditKeysOptions): (event: ReactKeyboardEvent) => boolean {
    const tap = useRef<string | undefined>(undefined);
    const latest = useRef({ selected, select });
    latest.current = { selected, select };

    useEffect(() => {
        const arrange = (arrangement: Arrangement) => {
            const change =
                view &&
                arrangeChange(viewKey, view, edited, selected, arrangement);
            if (change) onLayoutChanged?.(change);
        };
        commands.align = (edge) => arrange({ align: edge });
        commands.distribute = (axis) => arrange({ distribute: axis });
        commands.nudge = (step) => arrange({ nudge: step });
        // Every element the view draws now: a step's hidden ones aren't.
        commands.selectAll = () => {
            if (!view) return;
            select(
                view.elements
                    .filter(({ id }) => stepState?.elements[id] !== "hidden")
                    .map(({ id }) => id),
            );
        };
    }, [
        commands,
        view,
        viewKey,
        edited,
        selected,
        select,
        stepState,
        onLayoutChanged,
    ]);

    useEffect(() => {
        const element = wrapper.current;
        if (!element) return;
        const cancel = () => {
            tap.current = undefined;
        };
        const onKeyUp = (event: KeyboardEvent) => {
            const id = tap.current;
            tap.current = undefined;
            if (event.code !== "Space" || id === undefined) return;
            const { selected, select } = latest.current;
            select(clickSelection(selected, id, true));
        };
        element.addEventListener("pointerdown", cancel, true);
        element.addEventListener("keyup", onKeyUp);
        return () => {
            element.removeEventListener("pointerdown", cancel, true);
            element.removeEventListener("keyup", onKeyUp);
        };
    }, [wrapper]);

    return (event) => {
        if (event.code === "Space") {
            const id = focusedElement(event.target);
            if (id === undefined) return false;
            event.preventDefault();
            if (!event.repeat) tap.current = id;
            return true;
        }
        const key = editKey(event);
        if (!key) return false;
        if (key.command === "nudge") {
            if (selected.length === 0) return false;
            commands.nudge?.(key.step);
        } else if (key.command === "align") commands.align?.(key.edge);
        else if (key.command === "distribute") commands.distribute?.(key.axis);
        else commands.selectAll?.();
        event.preventDefault();
        return true;
    };
}

/**
 * Keep the viewport where it is when the edited layout of the view shown
 * changes (spec 10.1): a drop, a command, undo and redo draw through
 * `setLayout` and never refit the canvas. A workspace swapped in keeps it
 * too (spec 6.3), and paints the view again, so the page hears it from the
 * new workspace. A new view still fits.
 */
export function useKeepViewport(
    viewKey: string,
    edited: unknown,
    model: unknown,
    moved: { current: boolean },
    painted: { current: string | null },
) {
    const last = useRef({ viewKey, edited, model });
    useEffect(() => {
        const before = last.current;
        last.current = { viewKey, edited, model };
        if (before.viewKey !== viewKey) return;
        if (before.edited !== edited || before.model !== model)
            moved.current = true;
        if (before.model !== model) painted.current = null;
    }, [viewKey, edited, model, moved, painted]);
}
