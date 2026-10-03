/**
 * The engine contract (spec section 5): everything the diagrams page may ask
 * of the engine, and nothing that names React. The island behind it is
 * reached only through `mountEngine` and the `Engine` handle (ADR 3).
 */

import type { ModelView } from "../model";

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
};

export type AnimationState = {
    steps: number;
    step: number | null;
    playing: boolean;
};

/**
 * Only part of spec section 5 so far: the animation and activation members
 * arrive with their own tickets.
 */
export type Engine = {
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
