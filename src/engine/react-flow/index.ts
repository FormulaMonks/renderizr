import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    type EditedLayout,
    isEditable,
    type LayoutChange,
    type ModelView,
    WorkspaceModel,
} from "../../model";
import {
    abortError,
    type Anchor,
    type EditControls,
    type Engine,
    type EngineOptions,
    type SelectionState,
    whenMeasurable,
} from "../contract";
import { AnimationPlayer } from "./animation";
import type { Graph } from "./graph";
import {
    type IslandCommands,
    type IslandProps,
    IslandStore,
    Island,
} from "./island";
import { engineReport } from "./report";
import { removeReport, writeReport } from "./report-script";
import { ShownListeners } from "./shown";

/** Hears that an element or a relationship was activated, and where. */
type ActivationListener = (id: string, anchor: Anchor) => void;

/**
 * Mount the React Flow engine into `target` and resolve once the first view
 * is painted (spec section 5). The island mounts only once `target` has a
 * size. Aborting `signal` before then drops the wait, or unmounts the
 * unpainted root, and the promise rejects with an `AbortError`.
 *
 * The engine owns one animation player (spec 11). Only `showView`, which
 * stops it first, and `stop` end an animation: scheme, label, font and size
 * changes never reach the player, so they keep the step, the play state and
 * the time left on the step. Play holds while the page is hidden.
 */
export function mountEngine(
    target: HTMLElement,
    options: EngineOptions,
    signal: AbortSignal,
): Promise<Engine> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(abortError());
            return;
        }

        const model = new WorkspaceModel(options.workspace);
        const editableKey = (key: string) => {
            const view = model.findViewByKey(key);
            return view !== undefined && isEditable(view);
        };
        const store = new IslandStore({
            key: options.view,
            scheme: options.colorScheme,
            labels: { ...options.labels },
            step: null,
            editing:
                __RENDERIZR_EDIT_MODE__ &&
                options.editing === true &&
                editableKey(options.view),
            layouts: new Map(Object.entries(options.layouts ?? {})),
        });
        const layoutChanged = new Set<(change: LayoutChange) => void>();
        const selectionChanged = new Set<(selection: SelectionState) => void>();
        const commands: IslandCommands = {
            fit: () => {},
            zoomIn: () => {},
            zoomOut: () => {},
        };
        let root: Root | null = null;
        let mounted = false;

        const player = new AnimationPlayer();
        /**
         * The view last painted and how many steps it plays. The island
         * paints only a view it has not painted last, so a view shown again
         * before another one paints takes its steps back from here.
         */
        let painted: { key: string; steps: number } | null = null;
        player.onChanged(({ step }) => {
            if (step !== store.get().step) store.set({ step });
        });
        const onVisibility = () => player.setHidden(document.hidden);
        onVisibility();
        document.addEventListener("visibilitychange", onVisibility);

        const getCurrentView = () => {
            const view = model.findViewByKey(store.get().key);
            if (!view) throw new Error(`No view ${store.get().key}`);
            return view;
        };
        const shown = new ShownListeners<ModelView>();
        const activated = {
            element: new Set<ActivationListener>(),
            relationship: new Set<ActivationListener>(),
        };
        const listen = (
            listeners: Set<ActivationListener>,
            callback: ActivationListener,
        ) => {
            listeners.add(callback);
            return () => {
                listeners.delete(callback);
            };
        };
        const onActivate: IslandProps["onActivate"] = (type, id, anchor) => {
            for (const callback of activated[type]) callback(id, anchor);
        };

        const editControls = (): EditControls => ({
            setEditing(on) {
                if (on && !editableKey(store.get().key)) return;
                // Editing holds the step shown and stops playback (spec 18).
                if (on) player.pause();
                if (on !== store.get().editing) store.set({ editing: on });
            },
            setLayout(view: string, layout: EditedLayout) {
                const layouts = new Map(store.get().layouts);
                layouts.set(view, layout);
                store.set({ layouts });
            },
            resizeCanvas(command, { recenter }) {
                commands.resizeCanvas?.(command, recenter);
            },
            bringBack() {
                commands.bringBack?.();
            },
            calculateLayout(options) {
                commands.calculateLayout?.(options);
            },
            align(edge) {
                commands.align?.(edge);
            },
            distribute(axis) {
                commands.distribute?.(axis);
            },
            setRouting(mode) {
                commands.setRouting?.(mode);
            },
            onLayoutChanged(callback) {
                layoutChanged.add(callback);
                return () => {
                    layoutChanged.delete(callback);
                };
            },
            onSelectionChanged(callback) {
                selectionChanged.add(callback);
                return () => {
                    selectionChanged.delete(callback);
                };
            },
        });

        const engine: Engine = {
            showView(key) {
                if (key === store.get().key) return;
                if (!model.findViewByKey(key)) return;
                // The animation ends with the view it belongs to; the new
                // view's steps load once it is painted, or at once for the
                // view painted last, which paints nothing new. The key and
                // the full view arrive together: a step cleared on the
                // outgoing view first would refit it under zoomOnAnimation
                // just before the new view paints.
                store.set({ key, step: null });
                player.load(painted?.key === key ? painted.steps : 0);
            },
            setColorScheme(scheme) {
                if (scheme !== store.get().scheme) store.set({ scheme });
            },
            setLabels(labels) {
                const current = store.get().labels;
                if (
                    labels.descriptions === current.descriptions &&
                    labels.technologies === current.technologies
                ) {
                    return;
                }
                store.set({ labels: { ...labels } });
            },
            getCurrentView,
            fit: () => commands.fit(),
            zoomIn: () => commands.zoomIn(),
            zoomOut: () => commands.zoomOut(),
            play: () => player.play(),
            pause: () => player.pause(),
            stepForward: () => player.stepForward(),
            stepBack: () => player.stepBack(),
            stop: () => player.stop(),
            onAnimationChanged: (callback) => player.onChanged(callback),
            onViewShown(callback) {
                // A late subscriber still hears about the view already shown.
                return shown.add((view) => callback(view, player.state));
            },
            onElementActivated: (callback) =>
                listen(activated.element, callback),
            onRelationshipActivated: (callback) =>
                listen(activated.relationship, callback),
            // Builds, which never edit, leave these out (ADR 15).
            ...(__RENDERIZR_EDIT_MODE__
                ? editControls()
                : ({} as EditControls)),
            unmount() {
                stopWaiting();
                shown.clear();
                player.dispose();
                document.removeEventListener("visibilitychange", onVisibility);
                activated.element.clear();
                activated.relationship.clear();
                if (__RENDERIZR_EDIT_MODE__) {
                    layoutChanged.clear();
                    selectionChanged.clear();
                }
                root?.unmount();
                root = null;
                if (__RENDERIZR_ENGINE_REPORT__) removeReport(document);
            },
        };

        const onPainted = (key: string, graph: Graph) => {
            // Compiled out of every build but the acceptance harness's (spec 15.1).
            if (__RENDERIZR_ENGINE_REPORT__) {
                writeReport(document, engineReport(graph));
            }
            painted = { key, steps: graph.animation?.steps.length ?? 0 };
            player.load(painted.steps);
            const view = model.findViewByKey(key);
            if (view) shown.paint(view);
            if (!mounted) {
                mounted = true;
                resolve(engine);
            }
        };

        const onRedrawn = (graph: Graph) => {
            if (__RENDERIZR_ENGINE_REPORT__) {
                writeReport(document, engineReport(graph));
            }
        };

        const stopWaiting = whenMeasurable(target, () => {
            target.replaceChildren();
            root = createRoot(target);
            root.render(
                createElement(Island, {
                    model,
                    store,
                    commands,
                    font: __RENDERIZR_FONT__,
                    onPainted,
                    onRedrawn,
                    onEscape: () => player.stop(),
                    onActivate,
                    ...(__RENDERIZR_EDIT_MODE__ && {
                        onLayoutChanged: (change: LayoutChange) => {
                            for (const callback of layoutChanged)
                                callback(change);
                        },
                        onSelectionChanged: (selection: SelectionState) => {
                            for (const callback of selectionChanged)
                                callback(selection);
                        },
                    }),
                }),
            );
        });

        signal.addEventListener(
            "abort",
            () => {
                if (mounted) return;
                engine.unmount();
                reject(abortError());
            },
            { once: true },
        );
    });
}
