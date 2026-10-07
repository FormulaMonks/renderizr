import history from "history/hash";
import workspaceData from "virtual:renderizr/workspace";
import CurrentView, {
    applyDiagramTheme,
    getDiagramTheme,
    readLabelState,
} from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
import type { EditingRoute } from "../components/edit-buttons";
import {
    editingSearch,
    isEditingRoute,
    readingSearch,
} from "../components/editing-route";
import TargetMenu from "../components/target-menu";
import { type Engine, isAbortError, mountEngine } from "../engine";
import {
    elementTargets,
    isEditable,
    relationshipTargets,
    type Target,
    WorkspaceModel,
} from "../model";
import Page from "./_page";
import styles from "./diagrams.module.css";

/** Whether the page shows the editing route now (spec 4.6). */
const editing = () =>
    __RENDERIZR_EDIT_MODE__ && isEditingRoute(history.location.search);

/**
 * The editing route as the toolbar drives it: the pencil pushes the view's
 * editing route and Done pushes its reading route, so Back undoes either.
 */
const EDITING_ROUTE: EditingRoute = {
    isEditing: editing,
    edit: (key) =>
        history.push({ search: editingSearch(history.location.search, key) }),
    done: () =>
        history.push({ search: readingSearch(history.location.search) }),
    href: (key) =>
        history.createHref({
            search: `?${editingSearch(history.location.search, key)}`,
        }),
};

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
        const reachable = (key: string | null) => {
            if (!key || !editing()) return false;
            const view = model.findViewByKey(key);
            return view ? isEditable(view) : false;
        };
        const first =
            views.find((view) => view.key === requested)?.key ??
            (requested && reachable(requested) ? requested : undefined) ??
            views[0]?.key;

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
                this.#start(engine, model, reachable);
            },
            (error) => {
                if (!isAbortError(error)) throw error;
            },
        );
    }

    #start(
        engine: Engine,
        model: WorkspaceModel,
        reachable: (key: string) => boolean,
    ) {
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
                reachable,
            ),
        );

        const currentView = this.addComponent(
            new CurrentView(
                document.getElementById(
                    "structurizr-current-view",
                ) as HTMLElement,
                engine,
                model,
                __RENDERIZR_EDIT_MODE__ ? EDITING_ROUTE : null,
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
            engine.onViewShown((view) => {
                // A view edit mode can't edit has no editing route: the page
                // drops to reading (spec 7.5).
                if (editing() && !isEditable(view)) {
                    history.replace({
                        search: readingSearch(history.location.search),
                    });
                }
                currentView.render(view);
            }),
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

        if (__RENDERIZR_EDIT_MODE__)
            this.#followEditingRoute(engine, currentView);
    }

    /**
     * Keep the toolbar and `<html data-editing>` in step with the editing
     * route. The pencil, Done and Back change the route without changing the
     * view, so the engine shows nothing new and the toolbar has to hear it
     * from history.
     */
    #followEditingRoute(engine: Engine, currentView: CurrentView) {
        const root = document.documentElement;
        let shown = editing();
        root.toggleAttribute("data-editing", shown);

        this.#unsubscribe.push(
            history.listen(() => {
                if (editing() === shown) return;
                shown = editing();
                root.toggleAttribute("data-editing", shown);
                currentView.render(engine.getCurrentView());
            }),
            () => root.removeAttribute("data-editing"),
        );
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
