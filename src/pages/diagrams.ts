import CurrentView from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
import DraggableZone from "../components/draggable-zone";
import type { Diagram } from "../types/structurizr-diagram";
import type {
    AutomaticLayout,
    StructurizrElement,
    View,
} from "../types/structurizr-workspace";
import Page from "./_page";
import styles from "./diagrams.module.css";

const DEFAULT_AUTOMATIC_LAYOUT: AutomaticLayout = {
    implementation: "Dagre",
    rankDirection: "TopBottom",
    rankSeparation: 300,
    nodeSeparation: 300,
    edgeSeparation: 100,
    vertices: false,
};

export default class Diagrams extends Page {
    #diagram: Diagram | null = null;
    #resizeObserver: ResizeObserver | null = null;

    #applyAutoLayoutIfNeeded(viewKey: string) {
        const view = structurizr.workspace.findViewByKey(viewKey);
        if (!view?.automaticLayout) return;

        const layout = view.automaticLayout;
        this.#diagram?.runDagre(
            layout.rankDirection ?? DEFAULT_AUTOMATIC_LAYOUT.rankDirection,
            layout.rankSeparation < DEFAULT_AUTOMATIC_LAYOUT.rankSeparation
                ? DEFAULT_AUTOMATIC_LAYOUT.rankSeparation
                : layout.rankSeparation,
            layout.nodeSeparation < DEFAULT_AUTOMATIC_LAYOUT.nodeSeparation
                ? DEFAULT_AUTOMATIC_LAYOUT.nodeSeparation
                : layout.nodeSeparation,
            layout.edgeSeparation < DEFAULT_AUTOMATIC_LAYOUT.edgeSeparation
                ? DEFAULT_AUTOMATIC_LAYOUT.edgeSeparation
                : layout.edgeSeparation,
            layout.vertices ?? DEFAULT_AUTOMATIC_LAYOUT.vertices,
            50,
            true,
        );
    }

    #navigateToContainer(id?: string) {
        if (!id) return;
        const views = structurizr.workspace.findComponentViewsForContainer(id);
        if (views.length) {
            this.#diagram?.changeView(views[0].key);
        }
    }

    #navigateToSoftwareSystem(element: StructurizrElement) {
        const view = this.#diagram?.getCurrentView();
        let views: View[] = [];

        if (!view) return;

        if (
            view.type === structurizr.constants.SYSTEM_LANDSCAPE_VIEW_TYPE ||
            view.softwareSystemId !== element.id
        ) {
            views =
                structurizr.workspace.findSystemContextViewsForSoftwareSystem(
                    element.id,
                );
            if (!views.length)
                views =
                    structurizr.workspace.findContainerViewsForSoftwareSystem(
                        element.id,
                    );
        } else if (
            view.type === structurizr.constants.SYSTEM_CONTEXT_VIEW_TYPE
        ) {
            views = structurizr.workspace.findContainerViewsForSoftwareSystem(
                element.id,
            );
        }

        if (views.length) this.#diagram?.changeView(views[0].key);
    }

    #handleElementDoubleClick(_: Event, elementId: string) {
        const element = structurizr.workspace.findElementById(elementId);

        if (!element) return;
        if (element.url) window.open(element.url, "_blank");

        switch (element.type) {
            case structurizr.constants.SOFTWARE_SYSTEM_ELEMENT_TYPE:
                this.#navigateToSoftwareSystem(element);
                break;
            case structurizr.constants.CONTAINER_ELEMENT_TYPE:
                this.#navigateToContainer(element.id);
                break;
            case structurizr.constants.CONTAINER_INSTANCE_ELEMENT_TYPE:
                this.#navigateToContainer(element.containerId);
                break;
        }
    }

    render() {
        if (!this.container) return;
        this.clear();

        for (const view of structurizr.workspace.getViews()) {
            if (view.automaticLayout || !view.elements?.length) continue;
            const hasPositions = view.elements.some(
                (element) => (element as { x?: number }).x !== undefined,
            );
            if (!hasPositions) {
                (view as View).automaticLayout = DEFAULT_AUTOMATIC_LAYOUT;
            }
        }

        this.container.classList.add(styles.pageContent);

        this.container.innerHTML = `
            <section id="structurizr-current-view"></section>
            <div id="structurizr-diagram-target" class="${styles.diagramTarget}">
                <div class="loading">Loading workspace...</div>
            </div>
            <div id="structurizr-diagram-navigation"></div>
        `;

        structurizr.ui.loadThemes(() => {
            this.#diagram = new structurizr.ui.Diagram(
                "structurizr-diagram-target",
                false,
                () => {
                    if (!this.#diagram) return;
                    document.querySelector(".loading")?.remove();
                    this.#diagram.setNavigationEnabled(true);

                    const draggableZone = new DraggableZone(
                        document.querySelector(
                            "#structurizr-diagram-target-canvas",
                        ) as HTMLElement,
                    );

                    this.#resizeObserver = new ResizeObserver(() => {
                        this.#diagram?.resize();
                        this.#diagram?.zoomToWidthOrHeight();
                    });
                    this.#resizeObserver.observe(document.body);

                    const storedDarkModePreference =
                        window.localStorage.getItem(
                            "structurizr_cooper:darkModeDiagrams",
                        );
                    const darkModePreference = storedDarkModePreference
                        ? storedDarkModePreference === "dark"
                        : window?.matchMedia("(prefers-color-scheme: dark)")
                              .matches;

                    this.#diagram.setDarkMode(darkModePreference);

                    window
                        ?.matchMedia("(prefers-color-scheme: dark)")
                        .addEventListener("change", (e) => {
                            this.#diagram?.setDarkMode(e.matches);
                        });

                    const nav = this.addComponent(
                        new DiagramNavigation(
                            document.querySelector<HTMLDivElement>(
                                "#structurizr-diagram-navigation",
                            ) as HTMLElement,
                            this.#diagram,
                            structurizr.workspace.getViews(),
                        ),
                    );

                    const currentView = this.addComponent(
                        new CurrentView(
                            document.querySelector<HTMLDivElement>(
                                "#structurizr-current-view",
                            ) as HTMLElement,
                            this.#diagram,
                            draggableZone,
                        ),
                    );

                    this.#diagram.onViewChanged((viewKey) => {
                        const view =
                            structurizr.workspace.findViewByKey(viewKey);
                        const parentId =
                            view?.containerId ??
                            view?.softwareSystemId ??
                            view?.parentId;

                        this.#applyAutoLayoutIfNeeded(viewKey);
                        draggableZone.render();
                        nav.changeView(viewKey);
                        currentView.render(
                            view,
                            parentId
                                ? structurizr.workspace.findElementById(
                                      parentId,
                                  )
                                : undefined,
                        );
                    });

                    this.#diagram.onElementDoubleClicked(
                        this.#handleElementDoubleClick.bind(this),
                    );

                    this.renderAllComponents();
                },
            );
        });
    }

    clear() {
        this.removeAllComponents();
        if (this.#resizeObserver) this.#resizeObserver.disconnect();
        this.container!.innerHTML = "";
    }
}
