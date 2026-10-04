/**
 * Animation in the engine (spec 11): what one step of a view shows, and the
 * player that moves between steps. Both are plain TypeScript over the graph
 * and a clock, so they run under `node --test`; the island only turns a
 * frame into opacity, and `index.ts` owns the one player per engine.
 */

import { isIntegerOrder } from "../../model/index";
import type { AnimationState } from "../contract";
import { type Bounds, boundsOf } from "../geometry/bounds";
import type { Graph } from "./graph";

/**
 * How an item is drawn in a frame: as usual, at real opacity 0.2 with its
 * text and icon (a dynamic step's focus effect), or at opacity 0, inert and
 * out of the tab order (a static step that has not revealed it yet).
 */
export type Presence = "shown" | "faded" | "hidden";

/** What one step shows: each element and boundary by id, each edge by key. */
export type Frame = {
    elements: Record<string, Presence>;
    boundaries: Record<string, Presence>;
    edges: Record<string, Presence>;
    /** The box around the step's elements, which `zoomOnAnimation` fits. */
    focus?: Bounds;
};

/** The opacity each presence is drawn at (spec 11). */
export const PRESENCE_OPACITY: Record<Presence, number> = {
    shown: 1,
    faded: 0.2,
    hidden: 0,
};

/** How long an opacity or viewport change eases for; 0 under reduced motion. */
export const TRANSITION_MS = 200;

/** How long play stays on each step (spec 11). */
export const PLAY_INTERVAL = 2000;

const everything = (ids: string[], presence: Presence) =>
    Object.fromEntries(ids.map((id) => [id, presence]));

/**
 * What `graph` shows at `step` (1-based), or everything when `step` is null
 * or the view does not animate (spec 11).
 *
 * A dynamic step shows its edges and the elements at their ends and fades
 * every other element and every other ordered edge; an edge without an order
 * is always shown. A static step reveals what it and every earlier step list
 * and hides the rest; an edge is revealed only by a step that lists it.
 * Boundaries never fade; in a static animation one appears with its first
 * revealed child. Boundary boxes are derived from all their children either
 * way, so nothing moves from step to step.
 */
export function frameOf(graph: Graph, step: number | null): Frame {
    const elementIds = graph.elements.map((e) => e.id);
    const boundaryIds = graph.boundaries.map((b) => b.id);
    const edgeKeys = graph.edges.map((e) => e.key);
    const current =
        step === null ? undefined : graph.animation?.steps[step - 1];
    if (!graph.animation || !current || step === null) {
        return {
            elements: everything(elementIds, "shown"),
            boundaries: everything(boundaryIds, "shown"),
            edges: everything(edgeKeys, "shown"),
        };
    }

    const focus = focusOf(graph, current.elements, current.relationships);

    if (graph.animation.kind === "dynamic") {
        const inStep = new Set(current.elements);
        const edges: Record<string, Presence> = {};
        for (const edge of graph.edges) {
            const order = edge.order;
            edges[edge.key] =
                order === undefined || !isIntegerOrder(order)
                    ? "shown"
                    : Number(order.trim()) === current.order
                      ? "shown"
                      : "faded";
        }
        return {
            elements: Object.fromEntries(
                elementIds.map((id) => [
                    id,
                    inStep.has(id) ? "shown" : "faded",
                ]),
            ),
            boundaries: everything(boundaryIds, "shown"),
            edges,
            ...(focus && { focus }),
        };
    }

    const revealed = new Set<string>();
    const revealedEdges = new Set<string>();
    for (const earlier of graph.animation.steps.slice(0, step)) {
        for (const id of earlier.elements) revealed.add(id);
        for (const id of earlier.relationships) revealedEdges.add(id);
    }
    const children = new Map(graph.boundaries.map((b) => [b.id, b.children]));
    const anyRevealed = (id: string): boolean =>
        revealed.has(id) || (children.get(id) ?? []).some(anyRevealed);
    const presence = (shown: boolean): Presence => (shown ? "shown" : "hidden");

    return {
        elements: Object.fromEntries(
            elementIds.map((id) => [id, presence(revealed.has(id))]),
        ),
        boundaries: Object.fromEntries(
            boundaryIds.map((id) => [id, presence(anyRevealed(id))]),
        ),
        edges: Object.fromEntries(
            graph.edges.map((e) => [e.key, presence(revealedEdges.has(e.id))]),
        ),
        ...(focus && { focus }),
    };
}

/**
 * The box around the elements a step lists, or around the ends of its
 * relationships when it lists no element; undefined when it has neither.
 */
function focusOf(
    graph: Graph,
    elements: string[],
    relationships: string[],
): Bounds | undefined {
    const boxes = [...graph.elements, ...graph.boundaries];
    const listed = new Set(elements);
    const own = boxes.filter((box) => listed.has(box.id));
    if (own.length) return boundsOf(own);
    const ends = new Set(
        graph.edges
            .filter((edge) => relationships.includes(edge.id))
            .flatMap((edge) => [edge.sourceId, edge.targetId]),
    );
    return boundsOf(graph.elements.filter((box) => ends.has(box.id)));
}

/** The timers the player runs on; the browser's unless a test hands its own. */
export type Clock = {
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(id: unknown): void;
    now(): number;
};

const BROWSER_CLOCK: Clock = {
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id as number),
    now: () => performance.now(),
};

const NOT_ANIMATING: AnimationState = { steps: 0, step: null, playing: false };

/**
 * The animation state machine behind the engine's `play`, `pause`,
 * `stepForward`, `stepBack` and `stop` (spec 11). It knows only how many
 * steps the view has; drawing a step is the island's business.
 *
 * Play advances every 2 s and stops past the last step; stepping past the
 * last step, or back from step 1, returns to the full view. Pause keeps the
 * step. Only `load` (a new view) and `stop` end an animation; nothing else
 * the engine does reaches the player, so a scheme, label, font or size
 * change keeps the step, the play state and the time left on the step.
 * While the page is hidden the timer is held, and resumes with the time the
 * step had left.
 */
export class AnimationPlayer {
    readonly #clock: Clock;
    readonly #listeners = new Set<(state: AnimationState) => void>();
    #state: AnimationState = NOT_ANIMATING;
    #timer: unknown = null;
    /** When the running timer fires, on the clock's time. */
    #dueAt = 0;
    /** The time the current step has left while the timer is held. */
    #remaining: number | null = null;
    #hidden = false;

    constructor(clock: Clock = BROWSER_CLOCK) {
        this.#clock = clock;
    }

    get state(): AnimationState {
        return this.#state;
    }

    /** Subscribe; the callback hears the current state at once. */
    onChanged(callback: (state: AnimationState) => void): () => void {
        this.#listeners.add(callback);
        callback(this.#state);
        return () => {
            this.#listeners.delete(callback);
        };
    }

    /** A view with `steps` steps is shown: any animation ends. */
    load(steps: number) {
        this.#cancel();
        this.#set({ steps, step: null, playing: false });
    }

    play() {
        const { steps, step, playing } = this.#state;
        if (steps === 0 || playing) return;
        this.#set({ step: step ?? 1, playing: true });
        this.#schedule(PLAY_INTERVAL);
    }

    pause() {
        if (!this.#state.playing) return;
        this.#cancel();
        this.#set({ playing: false });
    }

    stop() {
        this.#cancel();
        this.#set({ step: null, playing: false });
    }

    stepForward() {
        const { steps, step, playing } = this.#state;
        if (steps === 0) return;
        const next = step === null ? 1 : step + 1;
        if (next > steps) return this.stop();
        this.#set({ step: next });
        if (playing) this.#schedule(PLAY_INTERVAL);
    }

    stepBack() {
        const { step, playing } = this.#state;
        if (step === null) return;
        if (step === 1) return this.stop();
        this.#set({ step: step - 1 });
        if (playing) this.#schedule(PLAY_INTERVAL);
    }

    /** Hold the timer while the page is hidden, and resume it after. */
    setHidden(hidden: boolean) {
        if (hidden === this.#hidden) return;
        this.#hidden = hidden;
        if (!this.#state.playing) return;
        if (hidden) {
            if (this.#timer !== null) {
                this.#remaining = Math.max(0, this.#dueAt - this.#clock.now());
                this.#clock.clearTimeout(this.#timer);
                this.#timer = null;
            }
        } else {
            this.#schedule(this.#remaining ?? PLAY_INTERVAL);
        }
    }

    /** Stop every timer and forget every listener. */
    dispose() {
        this.#cancel();
        this.#listeners.clear();
    }

    #schedule(ms: number) {
        this.#cancel();
        this.#remaining = ms;
        if (this.#hidden) return;
        this.#dueAt = this.#clock.now() + ms;
        this.#timer = this.#clock.setTimeout(() => {
            this.#timer = null;
            this.stepForward();
        }, ms);
    }

    #cancel() {
        if (this.#timer !== null) this.#clock.clearTimeout(this.#timer);
        this.#timer = null;
        this.#remaining = null;
    }

    #set(patch: Partial<AnimationState>) {
        const next = { ...this.#state, ...patch };
        const { steps, step, playing } = this.#state;
        if (
            next.steps === steps &&
            next.step === step &&
            next.playing === playing
        ) {
            return;
        }
        this.#state = next;
        for (const listener of this.#listeners) listener(next);
    }
}
