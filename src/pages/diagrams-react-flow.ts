import history from "history/hash";
import CurrentView, {
    applyDiagramTheme,
    getDiagramTheme,
    readLabelState,
    STRUCTURIZR_LABEL_DEFAULTS,
    type ToolbarDiagram,
} from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
import {
    type ColorScheme,
    type Engine,
    isAbortError,
} from "../engine/contract";
import { mountEngine } from "../engine/react-flow";
import { WorkspaceModel } from "../model";
import Page from "./_page";
import styles from "./diagrams-shell.module.css";

/**
 * The toolbar still speaks the Structurizr `Diagram`'s toggles; this turns
 * them into the engine's idempotent setters. Animation arrives with its own
 * ticket, so for now no view offers one.
 */
function toolbarFor(engine: Engine, scheme: ColorScheme): ToolbarDiagram {
    let current = scheme;
    // The toolbar reconciles from Structurizr's defaults, so start there.
    const labels = { ...STRUCTURIZR_LABEL_DEFAULTS };

    return {
        isDarkMode: () => current === "dark",
        setDarkMode: (dark) => {
            current = dark ? "dark" : "light";
            engine.setColorScheme(current);
        },
        toggleDescription: () => {
            labels.descriptions = !labels.descriptions;
            engine.setLabels({ ...labels });
        },
        toggleMetadata: () => {
            labels.technologies = !labels.technologies;
            engine.setLabels({ ...labels });
        },
        getCurrentView: () =>
            engine.getCurrentView() as unknown as ReturnType<
                ToolbarDiagram["getCurrentView"]
            >,
        animationStarted: () => false,
        currentViewHasAnimation: () => false,
        currentViewIsDynamic: () => false,
        onAnimationStarted: () => {},
        onAnimationStopped: () => {},
        startAnimation: () => {},
        stepBackwardInAnimation: () => {},
        stepForwardInAnimation: () => {},
        stopAnimation: () => {},
    };
}

/**
 * The diagrams page on the React Flow engine: a full-viewport shell (ADR 6)
 * whose canvas is the island, reached only through `mountEngine` and the
 * `Engine` handle (ADR 3).
 */
export default class ReactFlowDiagrams extends Page {
    #engine: Engine | null = null;
    #abort: AbortController | null = null;
    #unsubscribe: (() => void) | null = null;

    render() {
        if (!this.container) return;
        this.clear();

        applyDiagramTheme(getDiagramTheme());
        document.documentElement.dataset.diagramShell = "";

        const model = new WorkspaceModel(workspaceData);
        const views = model.getViews();
        const requested = new URLSearchParams(history.location.search).get(
            "view",
        );
        const first =
            views.find((view) => view.key === requested)?.key ?? views[0]?.key;

        this.container.classList.add(styles.pageContent);
        this.container.innerHTML = `
            <div class="${styles.layout}">
                <nav id="structurizr-diagram-navigation" aria-label="Views"></nav>
                <div class="${styles.main}">
                    <section id="structurizr-current-view"></section>
                    <div id="structurizr-diagram-target" class="${styles.diagramTarget}">
                        <div class="loading">Loading workspace...</div>
                    </div>
                </div>
            </div>
        `;

        if (!first) return;

        const target = this.container.querySelector<HTMLElement>(
            "#structurizr-diagram-target",
        ) as HTMLElement;
        const scheme = getDiagramTheme();
        const abort = new AbortController();
        this.#abort = abort;

        mountEngine(
            target,
            {
                workspace: workspaceData,
                view: first,
                colorScheme: scheme,
                labels: readLabelState(),
            },
            abort.signal,
        ).then(
            (engine) => {
                if (abort.signal.aborted) {
                    engine.unmount();
                    return;
                }
                this.#engine = engine;
                this.#start(engine, model, scheme);
            },
            (error) => {
                if (!isAbortError(error)) throw error;
            },
        );
    }

    #start(engine: Engine, model: WorkspaceModel, scheme: ColorScheme) {
        // The drawer is the one funnel for choosing a view: URL, highlight,
        // then `showView`.
        this.addComponent(
            new DiagramNavigation(
                document.getElementById(
                    "structurizr-diagram-navigation",
                ) as HTMLElement,
                {
                    getCurrentView: () => engine.getCurrentView(),
                    changeView: (key) => engine.showView(key),
                },
                model,
            ),
        );

        const currentView = this.addComponent(
            new CurrentView(
                document.getElementById(
                    "structurizr-current-view",
                ) as HTMLElement,
                toolbarFor(engine, scheme),
                {
                    fit: () => engine.fit(),
                    zoomIn: () => engine.zoomIn(),
                    zoomOut: () => engine.zoomOut(),
                },
                model,
            ),
        );

        this.renderAllComponents();

        // The toolbar follows what the engine has painted, not what was asked;
        // subscribing replays the view already on screen.
        this.#unsubscribe = engine.onViewShown((view) =>
            currentView.render(view),
        );
    }

    clear() {
        // The island goes before the router replaces the page.
        this.#abort?.abort();
        this.#abort = null;
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        this.#engine?.unmount();
        this.#engine = null;
        this.removeAllComponents();
        this.components.clear();
        delete document.documentElement.dataset.diagramShell;
        if (this.container) this.container.innerHTML = "";
    }
}
