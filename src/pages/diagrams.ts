import CurrentView from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
import { applyTheme, readSetting } from "../storage";
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

/** Enough to keep relationship labels from colliding, and no more. */
const MIN_SEPARATION = 150;
const MIN_EDGE_SEPARATION = 40;

const DARK_MODE_KEY = "structurizr_cooper:darkModeDiagrams";

/** A sliver is unreadable; beyond a dozen screens, nothing is findable. */
const MIN_CANVAS_HEIGHT = 220;
const MAX_CANVAS_HEIGHT = 12;

/**
 * How much smaller a diagram may get in exchange for fitting on one screen.
 * Above this, fitting costs too much legibility and the page scrolls instead.
 */
const LEGIBLE_SHRINK = 0.62;

/** Breathing room under the canvas when it is sized to the screen. */
const CANVAS_BOTTOM_MARGIN = 24;

export default class Diagrams extends Page {
    #diagram: Diagram | null = null;
    #resizeObserver: ResizeObserver | null = null;
    #lastWidth = 0;

    #applyAutoLayoutIfNeeded(viewKey: string) {
        const view = structurizr.workspace.findViewByKey(viewKey);
        if (!view?.automaticLayout) return;

        const layout = view.automaticLayout;
        // A workspace that states its own separations means them. Overriding
        // them upwards is what turned four boxes into three screens of
        // scrolling; the floor below only catches values low enough to overlap.
        this.#diagram?.runDagre(
            layout.rankDirection ?? DEFAULT_AUTOMATIC_LAYOUT.rankDirection,
            Math.max(layout.rankSeparation ?? 0, MIN_SEPARATION),
            Math.max(layout.nodeSeparation ?? 0, MIN_SEPARATION),
            Math.max(layout.edgeSeparation ?? 0, MIN_EDGE_SEPARATION),
            layout.vertices ?? DEFAULT_AUTOMATIC_LAYOUT.vertices,
            50,
            true,
        );
    }

    /**
     * Size the canvas from the diagram's own aspect ratio.
     *
     * A diagram that fits the screen at full width gets exactly the height it
     * needs — no letterbox. A diagram too tall for that has two options, and
     * legibility decides between them: if squeezing it onto one screen would
     * cost less than a third of its size, it is squeezed; if it would shrink
     * to something nobody can read, the canvas keeps full width and the page
     * simply gets longer, to be scrolled like any other long page.
     */
    #fitDiagram = (repaginate = false) => {
        const target = document.getElementById("structurizr-diagram-target");
        if (!target || !this.#diagram) return;

        // Views with fixed element positions carry a paper far larger than
        // their content, which would otherwise become dead space above and
        // below the diagram. Shrink the paper to the content first.
        if (repaginate) this.#diagram.autoPageSize();

        const width = this.#diagram.getWidth();
        const height = this.#diagram.getHeight();
        const available = target.clientWidth;

        if (width > 0 && height > 0 && available > 0) {
            const atFullWidth = (available * height) / width;
            const footer =
                document.getElementById("disclaimer")?.offsetHeight ?? 0;
            const onScreen = Math.max(
                MIN_CANVAS_HEIGHT,
                window.innerHeight -
                    (target.getBoundingClientRect().top + window.scrollY) -
                    footer -
                    CANVAS_BOTTOM_MARGIN,
            );

            const fits = atFullWidth <= onScreen;
            const worthSqueezing = onScreen / atFullWidth >= LEGIBLE_SHRINK;

            target.style.height = `${Math.round(
                fits || worthSqueezing
                    ? Math.min(atFullWidth, onScreen)
                    : Math.min(
                          atFullWidth,
                          window.innerHeight * MAX_CANVAS_HEIGHT,
                      ),
            )}px`;
        }

        // zoomFitWidth ends by reading the viewport's offset, which is only
        // correct once the height above has been laid out.
        requestAnimationFrame(() => {
            this.#diagram?.resize();
            this.#diagram?.zoomToWidthOrHeight();
        });
    };

    /** Plain wheel scrolls the page; only a deliberate modifier zooms. */
    #handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;

        event.preventDefault();
        event.stopPropagation();

        if (event.deltaY < 0) {
            this.#diagram?.zoomIn(event);
        } else {
            this.#diagram?.zoomOut(event);
        }
    };

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
            const hasPositions = view.elements.some((element) => {
                const el = element as { x?: number; y?: number };
                return el.x !== undefined && el.x !== 0 && el.y !== 0;
            });
            if (!hasPositions) {
                (view as View).automaticLayout = DEFAULT_AUTOMATIC_LAYOUT;
            }
        }

        this.container.classList.add(styles.pageContent);

        this.container.innerHTML = `
            <section id="structurizr-current-view"></section>
            <div id="structurizr-diagram-navigation"></div>
            <div id="structurizr-diagram-target" class="${styles.diagramTarget}">
                <div class="loading">Loading workspace...</div>
            </div>
        `;

        structurizr.ui.loadThemes(() => {
            this.#diagram = new structurizr.ui.Diagram(
                "structurizr-diagram-target",
                false,
                () => {
                    if (!this.#diagram) return;
                    document.querySelector(".loading")?.remove();
                    this.#diagram.setNavigationEnabled(true);

                    document
                        .getElementById("structurizr-diagram-target")
                        ?.addEventListener("wheel", this.#handleWheel, {
                            passive: false,
                        });

                    // Width only: the canvas height is derived from the width,
                    // so observing height as well would feed back on itself.
                    this.#resizeObserver = new ResizeObserver(([entry]) => {
                        const width = Math.round(entry.contentRect.width);
                        if (width === this.#lastWidth) return;
                        this.#lastWidth = width;
                        this.#fitDiagram();
                    });
                    this.#resizeObserver.observe(this.container!);

                    const stored = readSetting(DARK_MODE_KEY);
                    const prefersDark = window?.matchMedia(
                        "(prefers-color-scheme: dark)",
                    );

                    const dark = stored
                        ? stored === "dark"
                        : prefersDark.matches;
                    this.#diagram.setDarkMode(dark);
                    applyTheme(dark);

                    prefersDark.addEventListener("change", (e) => {
                        if (readSetting(DARK_MODE_KEY)) return;
                        this.#diagram?.setDarkMode(e.matches);
                        applyTheme(e.matches);
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
                            this.#fitDiagram,
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
                        this.#fitDiagram(true);
                        nav.changeView(viewKey);
                        currentView.render(
                            view,
                            parentId
                                ? structurizr.workspace.findElementById(
                                      parentId,
                                  )
                                : undefined,
                        );
                        // A previous view may have left the page scrolled a
                        // few thousand pixels down.
                        window.scrollTo({ top: 0 });
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
        this.#resizeObserver?.disconnect();
        this.#lastWidth = 0;
        document
            .getElementById("structurizr-diagram-target")
            ?.removeEventListener("wheel", this.#handleWheel);
        this.container!.innerHTML = "";
    }
}
