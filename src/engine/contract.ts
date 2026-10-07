/**
 * The engine contract (spec section 5): everything the diagrams page may ask
 * of the engine, and nothing that names React. The island behind it is
 * reached only through `mountEngine` and the `Engine` handle (ADR 3).
 */

import type {
    AutomaticLayoutSettings,
    EditedLayout,
    LayoutChange,
    ModelView,
} from "../model";

export type { EditedLayout, LayoutChange };

/**
 * The options of the "Calculate layout" dialog (spec 15): Structurizr
 * Local's five, with no ranker and no Graphviz.
 */
export type CalculateLayoutOptions = Pick<
    AutomaticLayoutSettings,
    | "rankDirection"
    | "rankSeparation"
    | "nodeSeparation"
    | "edgeSeparation"
    | "vertices"
>;

/** The three canvas commands (spec 14). */
export type CanvasCommand = "decrease" | "increase" | "auto";

export type ColorScheme = "light" | "dark";

/** Visibility of the optional labels drawn inside elements. */
export type Labels = { descriptions: boolean; technologies: boolean };

export type EngineOptions = {
    /**
     * The workspace JSON, as embedded in the page. Spec section 5 calls this
     * `Workspace`; `src/model` exports no type for the raw JSON yet.
     */
    workspace: Record<string, unknown>;
    /** Key of the first view to draw. */
    view: string;
    colorScheme: ColorScheme;
    labels: Labels;
    /** Mount in editing (spec 9.2). Only edit mode sets it. */
    editing?: boolean;
    /**
     * The edited layout of each view to draw from mount, by view key, so a
     * reload of the editing route keeps what the page's edit session holds
     * (spec 9.2, ADR 18).
     */
    layouts?: Readonly<Record<string, EditedLayout>>;
};

/**
 * Where the current view's animation is (spec 11): how many steps it has (0
 * when it does not animate), the step shown (null for the full view) and
 * whether play is advancing it.
 */
export type AnimationState = {
    steps: number;
    step: number | null;
    playing: boolean;
};

/**
 * Where an activation happened, in viewport (client) coordinates: under the
 * pointer, or below the focused item for a key. The target menu opens there.
 */
export type Anchor = { x: number; y: number };

/**
 * The state of a view that does not animate, and of every animation before
 * an engine has said anything: no steps, the full view, not playing. Shared
 * by the player and the toolbar.
 */
export const NOT_ANIMATING: Readonly<AnimationState> = {
    steps: 0,
    step: null,
    playing: false,
};

/** The animation members of the engine, which the toolbar drives. */
export type AnimationControls = {
    /** Advance every 2 s from the step shown, or from step 1. */
    play(): void;
    /** Stop advancing, keeping the step. */
    pause(): void;
    /** The next step: step 1 from the full view, the full view past the last. */
    stepForward(): void;
    /** The previous step: the full view from step 1, nothing from the full view. */
    stepBack(): void;
    /** End the animation and show the full view. */
    stop(): void;
    /** Every change of `AnimationState`, starting with the current one. */
    onAnimationChanged(callback: (state: AnimationState) => void): () => void;
};

/** The engine contract of spec section 5. */
export type Engine = AnimationControls & {
    showView(key: string): void;
    setColorScheme(scheme: ColorScheme): void;
    setLabels(labels: Labels): void;
    getCurrentView(): ModelView;

    fit(): void;
    zoomIn(): void;
    zoomOut(): void;

    onViewShown(
        callback: (view: ModelView, animation: AnimationState) => void,
    ): () => void;
    /**
     * An element, or a boundary drawn for one, was activated. The engine
     * never navigates: the page resolves its targets (spec 6.1).
     */
    onElementActivated(
        callback: (elementId: string, anchor: Anchor) => void,
    ): () => void;
    onRelationshipActivated(
        callback: (relationshipId: string, anchor: Anchor) => void,
    ): () => void;

    /**
     * Switch between reading and editing without a remount, keeping the
     * viewport (spec 9.2). Editing pauses an animation on the step shown
     * (spec 18). Turning editing on does nothing on a view `isEditable`
     * rejects.
     */
    setEditing(on: boolean): void;
    /**
     * Draw `layout` as the edited layout of view `view`, in place of the one
     * it had. The page calls it synchronously in its `onLayoutChanged`
     * handler; a change it doesn't hand back reverts (ADR 18).
     */
    setLayout(view: string, layout: EditedLayout): void;
    /**
     * Once per finished gesture: the fields it changed by element id, with
     * `before` as the engine drew them, computed values included. The first
     * change to a view with no edited layout carries every element.
     */
    onLayoutChanged(callback: (change: LayoutChange) => void): () => void;
    /**
     * Resize the canvas of the view being edited (spec 14): Decrease and
     * Increase by 100 each way, deleting `paperSize`, or Auto, the content
     * plus 400. With `recenter` the content moves to the middle of the new
     * canvas. Answers through `onLayoutChanged`.
     */
    resizeCanvas(command: CanvasCommand, options: { recenter: boolean }): void;
    /**
     * "Bring elements back onto the diagram" (spec 15): clamp every element
     * and vertex into the canvas. Answers through `onLayoutChanged`.
     */
    bringBack(): void;
    /**
     * "Calculate layout" (spec 15): lay the whole view out once as an
     * automatic layout would with `options`, and store it as a calculated
     * layout with the canvas fitted by Auto's rule. Answers through
     * `onLayoutChanged`, as one change.
     */
    calculateLayout(options: CalculateLayoutOptions): void;

    unmount(): void;
};

/** The rejection an aborted `mountEngine` settles with; the page ignores it. */
export const abortError = () =>
    new DOMException("The engine mount was aborted", "AbortError");

export const isAbortError = (error: unknown) =>
    error instanceof DOMException && error.name === "AbortError";

/**
 * Run `start` once `element` has a box with size in it (at once if it already
 * has one) and hand back a way to stop waiting.
 *
 * React Flow recovers its dimensions after a 0×0 mount but not its fit (#26),
 * and a 0×0 box is the ordinary state of a Claude artifact before the host
 * puts it on screen, a background tab or a collapsed container.
 */
export function whenMeasurable(element: HTMLElement, start: () => void) {
    const measurable = () =>
        element.clientWidth > 0 && element.clientHeight > 0;

    if (measurable()) {
        start();
        return () => {};
    }

    const observer = new ResizeObserver(() => {
        if (!measurable()) return;
        observer.disconnect();
        start();
    });

    observer.observe(element);
    return () => observer.disconnect();
}
