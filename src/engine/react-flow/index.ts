import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type ModelView, WorkspaceModel } from "../../model";
import {
    abortError,
    type Engine,
    type EngineOptions,
    whenMeasurable,
} from "../contract";
import { AnimationPlayer } from "./animation";
import type { Graph } from "./graph";
import { type IslandCommands, IslandStore, Island } from "./island";
import { engineReport } from "./report";
import { removeReport, writeReport } from "./report-script";
import { ShownListeners } from "./shown";

/**
 * Mount the React Flow engine into `target` and resolve once the first view
 * is painted (spec section 5). The island mounts only once `target` has a
 * size. Aborting `signal` before then drops the wait, or unmounts the
 * unpainted root, and the promise rejects with an `AbortError`.
 *
 * The engine owns one animation player (spec 11). Only `showView`, which
 * stops it first, and `stop` end an animation: scheme, label, font and size
 * changes never reach the player, so they keep the step, the play state and
 * the time left on the step. Playback holds while the page is hidden.
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
            step: null,
        });
        const commands: IslandCommands = {
            fit: () => {},
            zoomIn: () => {},
            zoomOut: () => {},
        };
        let root: Root | null = null;
        let mounted = false;

        const player = new AnimationPlayer();
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

        const engine: Engine = {
            showView(key) {
                if (key === store.get().key) return;
                if (!model.findViewByKey(key)) return;
                // The animation ends with the view it belongs to; the new
                // view's steps load once it is painted.
                player.load(0);
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
            unmount() {
                stopWaiting();
                shown.clear();
                player.dispose();
                document.removeEventListener("visibilitychange", onVisibility);
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
            player.load(graph.animation?.steps.length ?? 0);
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
