import history from "history/hash";
import CurrentView, {
    applyDiagramTheme,
    getDiagramTheme,
    readLabelState,
} from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
import TargetMenu from "../components/target-menu";
import { type Engine, isAbortError, mountEngine } from "../engine";
import {
    elementTargets,
    relationshipTargets,
    type Target,
    WorkspaceModel,
} from "../model";
import Page from "./_page";
import styles from "./diagrams.module.css";

/**
 * Go where `target` leads (spec 6.1): a view through the drawer's
 * `changeView`, the documentation or decisions through the hash router, and
 * anything else in a new tab.
 */
function follow(target: Target, changeView: (key: string) => void) {
    switch (target.kind) {
        case "view":
            changeView(target.key);
            return;
        case "documentation":
        case "decisions":
            history.push({ search: target.search });
            return;
        case "link":
            window.open(target.url, "_blank", "noopener,noreferrer");
            return;
    }
}

/**
 * The diagrams page: a full-viewport shell (ADR 6)
 * whose canvas is the island, reached only through `mountEngine` and the
 * `Engine` handle (ADR 3).
 */
export default class Diagrams extends Page {
    #engine: Engine | null = null;
    #abort: AbortController | null = null;
    #unsubscribe: (() => void)[] = [];
    #targetMenu: TargetMenu | null = null;

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

        const target = this.container.querySelector<HTMLElement>(
            "#structurizr-diagram-target",
        ) as HTMLElement;

        // A workspace of documentation and decisions only has nothing to
        // mount, so nothing would ever replace the loading message.
        if (!first) {
            target.innerHTML = `<p class="${styles.empty}">This workspace has no views.</p>`;
            return;
        }
        const abort = new AbortController();
        this.#abort = abort;

        mountEngine(
            target,
            {
                workspace: workspaceData,
                view: first,
                colorScheme: getDiagramTheme(),
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
                this.#start(engine, model);
            },
            (error) => {
                if (!isAbortError(error)) throw error;
            },
        );
    }

    #start(engine: Engine, model: WorkspaceModel) {
        // The drawer is the one funnel for choosing a view: URL, highlight,
        // then `showView`.
        const navigation = this.addComponent(
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
                engine,
                model,
            ),
        );

        this.renderAllComponents();

        // The engine reports activations; the page resolves where they lead
        // and follows one target or offers several (spec 6.1).
        const menu = new TargetMenu(this.container as HTMLElement, (target) =>
            follow(target, (key) => navigation.changeView(key)),
        );
        menu.render();
        this.#targetMenu = menu;
        const current = () => engine.getCurrentView().key;

        // The toolbar follows what the engine has painted, not what was asked;
        // subscribing replays the view already on screen.
        this.#unsubscribe = [
            engine.onViewShown((view) => currentView.render(view)),
            engine.onElementActivated((id, anchor) => {
                const element = model.findElementById(id);
                if (!element) return;
                menu.activate(
                    elementTargets(model, element, current()),
                    anchor,
                );
            }),
            engine.onRelationshipActivated((id, anchor) => {
                const relationship = model.findRelationshipById(id);
                if (!relationship) return;
                menu.activate(
                    relationshipTargets(model, relationship, current()),
                    anchor,
                );
            }),
        ];
    }

    clear() {
        // The island goes before the router replaces the page.
        this.#abort?.abort();
        this.#abort = null;
        for (const unsubscribe of this.#unsubscribe) unsubscribe();
        this.#unsubscribe = [];
        this.#targetMenu?.clear();
        this.#targetMenu = null;
        this.#engine?.unmount();
        this.#engine = null;
        this.removeAllComponents();
        this.components.clear();
        delete document.documentElement.dataset.diagramShell;
        if (this.container) this.container.innerHTML = "";
    }
}
