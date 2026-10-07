import history from "history/hash";
import workspaceData from "virtual:renderizr/workspace";
import CurrentView, {
    applyDiagramTheme,
    getDiagramTheme,
    readLabelState,
} from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
import { isEditingRoute, readingSearch } from "../components/editing-route";
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
import {
    editingRoute,
    editSession,
    flushEdits,
    leave,
    liveWorkspace,
    onWorkspace,
    startEditing,
    swapWorkspace,
} from "./diagrams-edit";
import styles from "./diagrams.module.css";

/** Whether the page shows the editing route now (spec 4.6). */
const editing = () =>
    __RENDERIZR_EDIT_MODE__ && isEditingRoute(history.location.search);

/**
 * Go where `target` leads (spec 6.1): a view through the drawer's
 * `changeView`, the documentation or decisions through the hash router, and
 * anything else in a new tab. Leaving the view goes through `guard` first,
 * which edit mode holds while changes wait for a save (spec 7.5).
 */
function follow(
    target: Target,
    changeView: (key: string) => void,
    guard: (proceed: () => void) => void,
) {
    switch (target.kind) {
        case "view":
            guard(() => changeView(target.key));
            return;
        case "documentation":
        case "decisions":
            guard(() => history.push({ search: target.search }));
            return;
        case "link":
            window.open(target.url, "_blank", "noopener,noreferrer");
            return;
    }
}

/**
 * Whether the URL may open view `key` of `model` though the drawer doesn't
 * list it: the editing route of a filtered view's base view (spec 4.6).
 */
const reachableIn = (model: WorkspaceModel) => (key: string | null) => {
    if (!key || !editing()) return false;
    const view = model.findViewByKey(key);
    return view ? isEditable(view) : false;
};

/** What a view switch goes through when nothing guards it: straight on. */
const goOn = (proceed: () => void) => proceed();

/**
 * The diagrams page: a full-viewport shell (ADR 6)
 * whose canvas is the island, reached only through `mountEngine` and the
 * `Engine` handle (ADR 3). Edit mode's part lives in `diagrams-edit.ts`,
 * reached only behind `__RENDERIZR_EDIT_MODE__` (ADR 15).
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

        // Edit mode draws the last workspace from disk (spec 6.1).
        const workspace = __RENDERIZR_EDIT_MODE__
            ? liveWorkspace(workspaceData)
            : workspaceData;
        const model = new WorkspaceModel(workspace);
        const views = model.getViews();
        const requested = new URLSearchParams(history.location.search).get(
            "view",
        );
        const reachable = reachableIn(model);
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
                workspace,
                view: first,
                colorScheme: getDiagramTheme(),
                labels: readLabelState(),
                // The edit session's layouts, so a page render keeps them.
                ...(__RENDERIZR_EDIT_MODE__
                    ? { editing: editing(), layouts: editSession().layouts() }
                    : {}),
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
        // A workspace from disk swaps in in place, with the drawer and the
        // toolbar drawn again from it (spec 6.1).
        const swap = __RENDERIZR_EDIT_MODE__
            ? onWorkspace((arrival) => {
                  const after = new WorkspaceModel(arrival.workspace);
                  this.#stop();
                  swapWorkspace(
                      engine,
                      model,
                      after,
                      arrival,
                      document.getElementById(
                          "structurizr-diagram-target",
                      ) as HTMLElement,
                  );
                  this.#start(engine, after, reachableIn(after));
              })
            : null;

        const guard = __RENDERIZR_EDIT_MODE__
            ? (proceed: () => void) => void leave(engine, model, proceed)
            : goOn;

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
                guard,
            ),
        );

        const currentView = this.addComponent(
            new CurrentView(
                document.getElementById(
                    "structurizr-current-view",
                ) as HTMLElement,
                engine,
                model,
                __RENDERIZR_EDIT_MODE__ ? editingRoute(engine, model) : null,
            ),
        );

        this.renderAllComponents();

        // The engine reports activations; the page resolves where they lead
        // and follows one target or offers several (spec 6.1).
        const menu = new TargetMenu(this.container as HTMLElement, (target) =>
            follow(target, (key) => navigation.changeView(key), guard),
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

        if (__RENDERIZR_EDIT_MODE__ && swap)
            this.#unsubscribe.push(
                swap,
                ...startEditing(
                    engine,
                    currentView,
                    this.container as HTMLElement,
                    model,
                ),
            );
    }

    /** Stop what `#start` started, keeping the engine. */
    #stop() {
        for (const unsubscribe of this.#unsubscribe) unsubscribe();
        this.#unsubscribe = [];
        this.#targetMenu?.clear();
        this.#targetMenu = null;
        this.removeAllComponents();
        this.components.clear();
    }

    clear() {
        if (__RENDERIZR_EDIT_MODE__) flushEdits();
        // The island goes before the router replaces the page.
        this.#abort?.abort();
        this.#abort = null;
        this.#stop();
        this.#engine?.unmount();
        this.#engine = null;
        delete document.documentElement.dataset.diagramShell;
        if (this.container) this.container.innerHTML = "";
    }
}
