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

/**
 * The renderer's own defaults, not ours — a view with no layout of its own
 * should come out looking the way Structurizr would have drawn it.
 */
const defaultAutomaticLayout = (): AutomaticLayout => ({
    implementation: "Dagre",
    rankDirection: structurizr.ui
        .DEFAULT_AUTOLAYOUT_RANK_DIRECTION as AutomaticLayout["rankDirection"],
    rankSeparation: structurizr.ui.DEFAULT_AUTOLAYOUT_RANK_SEPARATION,
    nodeSeparation: structurizr.ui.DEFAULT_AUTOLAYOUT_NODE_SEPARATION,
    edgeSeparation: structurizr.ui.DEFAULT_AUTOLAYOUT_EDGE_SEPARATION,
    vertices: structurizr.ui.DEFAULT_AUTOLAYOUT_VERTICES,
});

const DARK_MODE_KEY = "structurizr_cooper:darkModeDiagrams";

/** A sliver is unreadable; past a few screens, nothing is findable. */
const MIN_CANVAS_HEIGHT = 220;
const MAX_CANVAS_HEIGHT = 4;

/**
 * How much smaller a diagram may get in exchange for fitting on one screen.
 * Above this, fitting costs too much legibility and the page scrolls instead.
 */
const LEGIBLE_SHRINK = 0.5;

/** The margin zoomFitContent leaves around the drawing, in diagram units. */
const CONTENT_MARGIN = 50;

/** One notch of the zoom controls. */
const ZOOM_STEP = 1.2;

/** Far enough out to take in a diagram of any size. */
const MIN_ZOOM_SCALE = 0.02;

/** Breathing room under the canvas when it is sized to the screen. */
const CANVAS_BOTTOM_MARGIN = 24;

/** Whether a view already carries coordinates worth rendering. */
const hasStoredPositions = (view: View) =>
    Boolean(
        view.elements?.some((element) => {
            const { x, y } = element as { x?: number; y?: number };
            return x !== undefined && y !== undefined && (x !== 0 || y !== 0);
        }),
    );

export default class Diagrams extends Page {
    #diagram: Diagram | null = null;
    #resizeObserver: ResizeObserver | null = null;
    #lastWidth = 0;

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
    /** The bounding box of what is drawn, in the diagram's own coordinates. */
    #contentSize(): { width: number; height: number } | null {
        const layer = document.querySelector<SVGGraphicsElement>(
            "#structurizr-diagram-target .joint-cells-layer",
        );
        if (!layer) return null;

        try {
            const box = layer.getBBox();
            return box.width > 0 && box.height > 0
                ? { width: box.width, height: box.height }
                : null;
        } catch {
            return null;
        }
    }

    /**
     * Size the canvas from the diagram's own proportions.
     *
     * A diagram that fits the screen gets exactly the height it needs — no
     * letterbox above and below it. One too tall for that has two options, and
     * legibility decides between them: if fitting it to the screen would cost
     * less than a third of its size, it is fitted; if it would shrink to
     * something nobody can read, the canvas keeps full width and the page
     * simply gets longer, to be scrolled like any other long page.
     */
    #fitDiagram = () => {
        const target = document.getElementById("structurizr-diagram-target");
        if (!target || !this.#diagram) return;

        // zoomFitContent scales to the drawing rather than to the paper, so
        // there is no need to repaginate a view whose paper is oversized.
        const settle = () => {
            this.#diagram?.resize();
            this.#diagram?.zoomFitContent();
        };

        settle();

        const content = this.#contentSize();
        const width = content?.width ?? this.#diagram.getWidth();
        const height = content?.height ?? this.#diagram.getHeight();
        const available = target.clientWidth;

        if (width > 0 && height > 0 && available > 0) {
            // zoomFitContent leaves a margin around the drawing; counting it
            // here is what stops the diagram spilling past the box it is given.
            const atFullWidth =
                (available * (height + CONTENT_MARGIN * 2)) /
                (width + CONTENT_MARGIN * 2);
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
            const worthFitting = onScreen / atFullWidth >= LEGIBLE_SHRINK;

            target.style.height = `${Math.round(
                fits || worthFitting
                    ? Math.min(atFullWidth, onScreen)
                    : Math.min(
                          atFullWidth,
                          window.innerHeight * MAX_CANVAS_HEIGHT,
                      ),
            )}px`;
        }

        // The engine reads the viewport's offset when it centres, so it can
        // only be correct once the height above has been laid out.
        requestAnimationFrame(settle);
    };

    /**
     * The engine pins its own minimum zoom to whatever scale made the diagram
     * fit, which means a diagram taller than the screen can never be zoomed out
     * far enough to be seen whole. Driving zoomTo directly lifts that floor —
     * the reader decides how far out is far enough.
     */
    #currentScale() {
        const canvas = document.getElementById(
            "structurizr-diagram-target-canvas",
        );
        const width = this.#diagram?.getWidth() ?? 0;
        return canvas && width > 0 ? canvas.clientWidth / width : 1;
    }

    #zoomBy(factor: number) {
        if (!this.#diagram) return;
        this.#diagram.zoomTo(
            Math.max(MIN_ZOOM_SCALE, this.#currentScale() * factor),
        );
        this.#diagram.scrollToCentre();
    }

    zoomIn = () => this.#zoomBy(ZOOM_STEP);
    zoomOut = () => this.#zoomBy(1 / ZOOM_STEP);

    /** Plain wheel scrolls the page; only a deliberate modifier zooms. */
    #handleWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;

        event.preventDefault();
        event.stopPropagation();

        this.#zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
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
            if (!hasStoredPositions(view)) {
                (view as View).automaticLayout = defaultAutomaticLayout();
            }
        }

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

        structurizr.ui.loadThemes(() => {
            this.#diagram = new structurizr.ui.Diagram(
                "structurizr-diagram-target",
                false,
                // Deferred by a microtask so that both `this.#diagram` and the
                // `structurizr.diagram` the renderer looks itself up by are
                // assigned before anything asks the diagram to do work.
                () =>
                    queueMicrotask(() => {
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
                        // The canvas itself, not the page: collapsing the view
                        // drawer changes the width available to the diagram
                        // without the page changing size at all.
                        this.#resizeObserver.observe(
                            document.getElementById(
                                "structurizr-diagram-target",
                            ) as HTMLElement,
                        );

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
                                {
                                    fit: this.#fitDiagram,
                                    zoomIn: this.zoomIn,
                                    zoomOut: this.zoomOut,
                                },
                            ),
                        );

                        this.#diagram.onViewChanged((viewKey) => {
                            const view =
                                structurizr.workspace.findViewByKey(viewKey);
                            const parentId =
                                view?.containerId ??
                                view?.softwareSystemId ??
                                view?.parentId;

                            // The renderer applies the view's automatic layout
                            // itself while rendering, exactly as the Structurizr
                            // server does — there is nothing to re-run here.
                            this.#fitDiagram();
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
                    }),
            );

            // The renderer reaches for itself here when it applies a view's
            // automatic layout, exactly as Structurizr's own pages set it.
            structurizr.diagram = this.#diagram;
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
