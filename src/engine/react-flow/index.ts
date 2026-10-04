import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type ModelView, WorkspaceModel } from "../../model";
import {
    abortError,
    type Anchor,
    type AnimationState,
    type Engine,
    type EngineOptions,
    whenMeasurable,
} from "../contract";
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

const NO_ANIMATION: AnimationState = { steps: 0, step: null, playing: false };

/** Hears that an element or a relationship was activated, and where. */
type ActivationListener = (id: string, anchor: Anchor) => void;

/**
 * Mount the React Flow engine into `target` and resolve once the first view
 * is painted (spec section 5). The island mounts only once `target` has a
 * size. Aborting `signal` before then drops the wait, or unmounts the
 * unpainted root, and the promise rejects with an `AbortError`.
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
        const store = new IslandStore({
            key: options.view,
            scheme: options.colorScheme,
            labels: { ...options.labels },
        });
        const commands: IslandCommands = {
            fit: () => {},
            zoomIn: () => {},
            zoomOut: () => {},
        };
        let root: Root | null = null;
        let mounted = false;

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

        const engine: Engine = {
            showView(key) {
                if (key === store.get().key) return;
                if (!model.findViewByKey(key)) return;
                store.set({ key });
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
            onViewShown(callback) {
                // A late subscriber still hears about the view already shown.
                return shown.add((view) => callback(view, NO_ANIMATION));
            },
            onElementActivated: (callback) =>
                listen(activated.element, callback),
            onRelationshipActivated: (callback) =>
                listen(activated.relationship, callback),
            unmount() {
                stopWaiting();
                shown.clear();
                activated.element.clear();
                activated.relationship.clear();
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
                    onActivate,
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
