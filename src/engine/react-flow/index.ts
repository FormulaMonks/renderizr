import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceModel } from "../../model";
import {
    abortError,
    type AnimationState,
    type Engine,
    type EngineOptions,
    whenMeasurable,
} from "../contract";
import { type IslandCommands, IslandStore, Island } from "./island";

const NO_ANIMATION: AnimationState = { steps: 0, step: null, playing: false };

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
        const shown = new Set<
            (
                view: ReturnType<Engine["getCurrentView"]>,
                a: AnimationState,
            ) => void
        >();
        let root: Root | null = null;
        let mounted = false;

        const getCurrentView = () => {
            const view = model.findViewByKey(store.get().key);
            if (!view) throw new Error(`No view ${store.get().key}`);
            return view;
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
                shown.add(callback);
                // A late subscriber still hears about the view already shown.
                if (mounted) callback(getCurrentView(), NO_ANIMATION);
                return () => shown.delete(callback);
            },
            unmount() {
                stopWaiting();
                shown.clear();
                root?.unmount();
                root = null;
            },
        };

        const onPainted = () => {
            if (!mounted) {
                mounted = true;
                resolve(engine);
                return;
            }
            const view = getCurrentView();
            for (const callback of shown) callback(view, NO_ANIMATION);
        };

        const stopWaiting = whenMeasurable(target, () => {
            target.replaceChildren();
            root = createRoot(target);
            root.render(
                createElement(Island, { model, store, commands, onPainted }),
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
