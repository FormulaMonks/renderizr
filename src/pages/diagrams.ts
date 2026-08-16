import CurrentView, {
    applyDiagramTheme,
    getDiagramTheme,
} from "../components/current-view";
import DiagramNavigation from "../components/diagram-navigation";
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

/** A sliver is unreadable; past a few screens, nothing is findable. */
const MIN_CANVAS_HEIGHT = 220;
const MAX_CANVAS_HEIGHT = 4;

/**
 * How much smaller a diagram may get in exchange for fitting on one screen.
 * Above this, fitting costs too much legibility and the page scrolls instead.
 */
const LEGIBLE_SHRINK = 0.5;

/** One notch of the zoom controls. */
const ZOOM_STEP = 1.2;

/** A hard floor for the degenerate cases; the real floor is "the whole
 * diagram fits", computed per view. */
const MIN_ZOOM_SCALE = 0.02;

/**
 * Run `start` once `element` has a box with size in it — at once if it already
 * has one — and hand back a way to stop waiting.
 *
 * The engine measures the canvas while it lays a view out, and a box of no size
 * takes it through a division by zero: every element lands on
 * `translate(20,NaN)`, the automatic layout gives up, and the canvas is left
 * empty. That is the ordinary state of a document that has been parsed but not
 * yet put on screen, which is exactly how a Claude artifact starts: the payload
 * runs inside the host's page while the viewport the canvas is sized in is
 * still 0x0. Nothing here is specific to that host — a background tab or a
 * collapsed container is the same situation.
 */
function whenMeasurable(element: HTMLElement, start: () => void) {
    const measurable = () =>
        element.clientWidth > 0 && element.clientHeight > 0;

    if (measurable()) {
        start();
        return () => {};
    }

    const observer = new ResizeObserver(() => {
        if (!measurable()) return;
        observer.disconnect();
        start();
    });

    observer.observe(element);
    return () => observer.disconnect();
}

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
    #stopWaiting: (() => void) | null = null;
    #resizeObserver: ResizeObserver | null = null;
    #refitTimer = 0;
    #lastWidth = 0;

    /**
     * Size the canvas from the diagram's own proportions.
     *
     * A diagram that fits the screen gets exactly the height it needs — no
     * letterbox above and below it. One too tall for that has two options, and
     * legibility decides between them: if fitting it to the screen would cost
     * less than half its size, it is fitted; if it would shrink to something
     * nobody can read, the canvas keeps full width and the page simply gets
     * longer, to be scrolled like any other long page.
     */
    #fitDiagram = (final = false) => {
        const target = document.getElementById("structurizr-diagram-target");
        if (!target || !this.#diagram) return;

        // Shrink the paper to what is drawn on it first. Deployment views in
        // particular carry a paper several times their content, and the engine
        // scales the paper: left alone, the diagram is sized for a page far
        // bigger than the box and everything outside the middle is clipped.
        this.#diagram.autoPageSize();

        // With the paper tight, box and paper share a ratio, so fitting the
        // paper fills the box exactly — no dead space, nothing cut off.
        const settle = () => {
            this.#diagram?.resize();
            this.#diagram?.zoomToWidthOrHeight();
        };

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
                    footer,
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

        // The engine reads the viewport's offset when it centers, so it can
        // only be correct once the height above has been laid out.
        requestAnimationFrame(settle);

        // Layout can still be moving after that — the drawer's own transition,
        // an embedded font arriving, a phone's address bar sliding away — and a
        // measurement taken mid-flight leaves the diagram at the wrong scale.
        // One late second pass costs nothing and removes the whole class of
        // race.
        if (final) return;
        window.clearTimeout(this.#refitTimer);
        this.#refitTimer = window.setTimeout(() => this.#fitDiagram(true), 260);
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

    /**
     * The scale at which the entire diagram sits inside its box. Zooming out
     * stops here: further out is just a smaller speck of the same picture, and
     * the engine's own floor — whatever scale the page chose — stops short of
     * ever showing the whole thing.
     */
    #wholeDiagramScale() {
        const viewport = this.#viewport();
        const width = this.#diagram?.getWidth() ?? 0;
        const height = this.#diagram?.getHeight() ?? 0;
        if (!viewport || width <= 0 || height <= 0) return MIN_ZOOM_SCALE;

        return Math.max(
            MIN_ZOOM_SCALE,
            Math.min(
                viewport.clientWidth / width,
                viewport.clientHeight / height,
            ),
        );
    }

    #zoomBy(factor: number) {
        if (!this.#diagram) return;
        this.#diagram.zoomTo(
            Math.max(this.#wholeDiagramScale(), this.#currentScale() * factor),
        );
        this.#diagram.scrollToCenter();
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

    /*
     * Touch. Two fingers pinch the diagram itself rather than the whole page,
     * and once it is larger than its box one finger drags it around; below
     * that a swipe is left alone so the page still scrolls. The engine's own
     * panning is bound to mouse events only, so none of this comes for free.
     */
    #pointers = new Map<number, { x: number; y: number }>();
    #pinch: { distance: number; scale: number } | null = null;
    #pan: { x: number; y: number; left: number; top: number } | null = null;

    #viewport() {
        return document.getElementById("structurizr-diagram-target-viewport");
    }

    #pinchDistance() {
        const [a, b] = [...this.#pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    #handlePointerDown = (event: PointerEvent) => {
        if (event.pointerType === "mouse") return;

        this.#pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
        });

        if (this.#pointers.size === 2) {
            this.#pan = null;
            this.#pinch = {
                distance: this.#pinchDistance(),
                scale: this.#currentScale(),
            };
            return;
        }

        const viewport = this.#viewport();
        // Only claim the gesture when there is somewhere to pan to; otherwise
        // the swipe belongs to the page.
        if (
            this.#pointers.size === 1 &&
            viewport &&
            (viewport.scrollHeight > viewport.clientHeight ||
                viewport.scrollWidth > viewport.clientWidth)
        ) {
            this.#pan = {
                x: event.clientX,
                y: event.clientY,
                left: viewport.scrollLeft,
                top: viewport.scrollTop,
            };
        }
    };

    #handlePointerMove = (event: PointerEvent) => {
        if (!this.#pointers.has(event.pointerId)) return;

        this.#pointers.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
        });

        if (this.#pinch && this.#pointers.size === 2) {
            event.preventDefault();
            const distance = this.#pinchDistance();
            if (this.#pinch.distance <= 0) return;

            this.#diagram?.zoomTo(
                Math.max(
                    this.#wholeDiagramScale(),
                    (this.#pinch.scale * distance) / this.#pinch.distance,
                ),
            );
            return;
        }

        const viewport = this.#viewport();
        if (!this.#pan || !viewport) return;

        event.preventDefault();
        viewport.scrollLeft = this.#pan.left - (event.clientX - this.#pan.x);
        viewport.scrollTop = this.#pan.top - (event.clientY - this.#pan.y);
    };

    #handlePointerUp = (event: PointerEvent) => {
        this.#pointers.delete(event.pointerId);
        if (this.#pointers.size < 2) this.#pinch = null;
        if (this.#pointers.size === 0) this.#pan = null;
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

        // Stamped before the canvas exists, let alone before the engine is
        // constructed, so the backdrop is never painted in the wrong scheme
        // and then corrected. `CurrentView` owns the preference from here on;
        // this only puts it on the page early. Note it is deliberately *not*
        // the page theme: diagrams keep their own.
        applyDiagramTheme(getDiagramTheme());

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

        this.#stopWaiting = whenMeasurable(
            document.getElementById(
                "structurizr-diagram-target",
            ) as HTMLElement,
            () => {
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

                                const canvas = document.getElementById(
                                    "structurizr-diagram-target",
                                );
                                canvas?.addEventListener(
                                    "wheel",
                                    this.#handleWheel,
                                    {
                                        passive: false,
                                    },
                                );
                                canvas?.addEventListener(
                                    "pointerdown",
                                    this.#handlePointerDown,
                                );
                                canvas?.addEventListener(
                                    "pointermove",
                                    this.#handlePointerMove,
                                    { passive: false },
                                );
                                for (const type of [
                                    "pointerup",
                                    "pointercancel",
                                    "pointerleave",
                                ]) {
                                    canvas?.addEventListener(
                                        type,
                                        this.#handlePointerUp as EventListener,
                                    );
                                }

                                // Width only: the canvas height is derived from the width,
                                // so observing height as well would feed back on itself.
                                this.#resizeObserver = new ResizeObserver(
                                    ([entry]) => {
                                        const width = Math.round(
                                            entry.contentRect.width,
                                        );
                                        if (width === this.#lastWidth) return;
                                        this.#lastWidth = width;
                                        this.#fitDiagram();
                                    },
                                );
                                // The canvas itself, not the page: collapsing the view
                                // drawer changes the width available to the diagram
                                // without the page changing size at all.
                                this.#resizeObserver.observe(
                                    document.getElementById(
                                        "structurizr-diagram-target",
                                    ) as HTMLElement,
                                );

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
                                        structurizr.workspace.findViewByKey(
                                            viewKey,
                                        );
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
            },
        );
    }

    clear() {
        this.removeAllComponents();
        this.#stopWaiting?.();
        this.#stopWaiting = null;
        this.#resizeObserver?.disconnect();
        window.clearTimeout(this.#refitTimer);
        this.#lastWidth = 0;
        const canvas = document.getElementById("structurizr-diagram-target");
        canvas?.removeEventListener("wheel", this.#handleWheel);
        canvas?.removeEventListener("pointerdown", this.#handlePointerDown);
        canvas?.removeEventListener("pointermove", this.#handlePointerMove);
        for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
            canvas?.removeEventListener(
                type,
                this.#handlePointerUp as EventListener,
            );
        }
        this.#pointers.clear();
        this.container!.innerHTML = "";
    }
}
