import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    type EditedLayout,
    isEditable,
    type LayoutChange,
    type ModelView,
    storedCanvasOf,
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
import { exportFrame } from "../geometry/canvas";
import { AnimationPlayer, stepStateOf } from "./animation";
import { exportBlob, textSetting, titleBlockText } from "./export-file";
import { exportSvg } from "./export-svg";
import type { Graph } from "./graph";
import {
    type IslandCommands,
    type IslandProps,
    IslandStore,
    Island,
} from "./island";
import { engineReport } from "./report";
import {
    exposeExport,
    removeExport,
    removeReport,
    writeReport,
} from "./report-script";
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

        // Edit mode swaps the workspace in place (`setWorkspace`).
        let model = new WorkspaceModel(options.workspace);
        /**
         * The workspace as last saved, whose `lastModifiedUser` and
         * `lastModifiedDate` the title block gives, which the model drops.
         * Edit mode swaps it only on a save, so unsaved changes keep the
         * saved date.
         */
        let workspace = options.workspace;
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
        /**
         * Set by `setWorkspace` while the view it kept waits to be painted
         * again, which keeps the step shown when the view still has it.
         */
        let reloading = false;
        /**
         * The graph the island last drew, edited layout, scheme and labels
         * included, which an export serializes (ADR 21).
         */
        let drawn: Graph | null = null;
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
            setWorkspace(saved) {
                workspace = saved;
                model = new WorkspaceModel(saved);
                const { key, editing } = store.get();
                const kept = model.findViewByKey(key) !== undefined;
                const shownKey = kept ? key : model.getViews()[0]?.key ?? key;
                reloading = kept;
                // One store change, so the island never draws the new
                // workspace with the view or edited layouts of the old one.
                store.set({
                    model,
                    key: shownKey,
                    ...(!kept && { step: null }),
                    editing: editing && editableKey(shownKey),
                    layouts: new Map(),
                });
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
                    labels.technologies === current.technologies &&
                    labels.entitiesCollapsed === current.entitiesCollapsed
                ) {
                    return;
                }
                store.set({ labels: { ...labels } });
            },
            getCurrentView,
            async exportView(format) {
                const graph = drawn;
                if (!graph || graph.image || graph.error) {
                    throw new Error("The view has nothing drawn to export");
                }
                const view = model.findViewByKey(graph.key);
                if (!view) throw new Error(`No view ${graph.key}`);
                const { step, layouts } = store.get();
                // The canvas frames the export, as edited and unsaved in
                // edit mode; a view that stores none takes Auto's frame.
                const edited = __RENDERIZR_EDIT_MODE__
                    ? layouts.get(graph.key)
                    : undefined;
                const frame = exportFrame(
                    storedCanvasOf(view, edited),
                    graph.bounds,
                );
                const exported = exportSvg({
                    graph,
                    step: step === null ? undefined : stepStateOf(graph, step),
                    frame,
                    titleBlock: titleBlockText(
                        workspace,
                        graph.title,
                        view.description,
                    ),
                    text: textSetting(__RENDERIZR_FONT__),
                });
                return exportBlob(exported, format);
            },
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
                drawn = null;
                if (__RENDERIZR_ENGINE_REPORT__) {
                    removeReport(document);
                    removeExport(window);
                }
            },
        };

        const onPainted = (key: string, graph: Graph) => {
            drawn = graph;
            // Compiled out of every build but the acceptance harness's (spec 15.1).
            if (__RENDERIZR_ENGINE_REPORT__) {
                writeReport(document, engineReport(graph));
                exposeExport(window, engine.exportView);
            }
            painted = { key, steps: graph.animation?.steps.length ?? 0 };
            if (__RENDERIZR_EDIT_MODE__ && reloading) {
                // The same view from a workspace swapped in: the step shown
                // stays while the view still has it (spec 6.3).
                reloading = false;
                const { steps, step } = player.state;
                const kept = step !== null && step <= painted.steps;
                if (steps !== painted.steps || !kept) {
                    // A step that's gone falls back to the full view.
                    player.load(painted.steps);
                    while (kept && (player.state.step ?? 0) < (step ?? 0))
                        player.stepForward();
                }
            } else player.load(painted.steps);
            const view = model.findViewByKey(key);
            if (view) shown.paint(view);
            if (!mounted) {
                mounted = true;
                resolve(engine);
            }
        };

        const onRedrawn = (graph: Graph) => {
            drawn = graph;
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
