import getStructurizr from "./structurizr.ts";
import Panzoom, {
    type PanzoomObject,
    type PanzoomEventDetail,
} from "@panzoom/panzoom";

import "./main.css";
import DiagramNavigation from "./components/diagram-navigation.ts";
import CurrentView from "./components/current-view.ts";

const structurizr = await getStructurizr();

// Load workspace from global variable
structurizr.workspace = new structurizr.Workspace(workspaceData);

const diagramsAndDocs =
    structurizr.workspace.hasDocumentation() &&
    structurizr.workspace.hasDecisions();

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main>
        <h1 class="workspace-title">${structurizr.workspace.name}</h1>
        <nav id="structurizr-docs-navigation">
            <section class="workspace-description">
                <p>${structurizr.workspace.description}</p>
                <p>${structurizr.workspace.version ? `Version: ${structurizr.workspace.version} - ` : ""}Last modified: <strong>${new Date(structurizr.workspace.lastModifiedDate).toLocaleDateString()}</strong></p>
            </section>
            <ul>
                ${!diagramsAndDocs ? "" : '<li><a href="#" class="active">Diagrams</a></li>'}
                ${structurizr.workspace.hasDocumentation() ? `<li><a href="#">Documentation</a></li>` : ""}
                ${structurizr.workspace.hasDecisions() ? `<li><a href="#">Decisions</a></li>` : ""}
            </ul>
        </nav>
        <hr />
        <section id="structurizr-current-view"></section>
        <div id="structurizr-diagram-target"></div>
        <div id="structurizr-diagram-navigation"></div>
    </main>
`;

function createDraggableZone() {
    let panzoom: PanzoomObject | null = null;

    return {
        resetZoom() {
            if (panzoom) {
                panzoom.destroy();
            }

            const el = document.querySelector(
                "#structurizr-diagram-target-canvas",
            ) as HTMLElement;

            if (!el) return;

            panzoom = Panzoom(el, {
                canvas: true,
                panOnlyWhenZoomed: true,
                minScale: 1,
            });

            el.addEventListener("panzoomzoom", (event: Event) => {
                const detail: PanzoomEventDetail = (event as CustomEvent)
                    .detail;

                if (detail.scale <= 1.03) {
                    panzoom?.reset();
                }
            });

            const handleWheel = (event: WheelEvent) => {
                event.stopPropagation();
                event.preventDefault();
                // Mousewheel scrolls and trackpad scrolls result in wildly different zoom speeds
                // if using panzoom's default zoomWithWheel
                // https://github.com/timmywil/panzoom/issues/586
                const delta =
                    event.deltaY === 0 && event.deltaX
                        ? event.deltaX
                        : event.deltaY;
                const scale = panzoom?.getScale() ?? 0;
                const toScale = scale * Math.exp((delta * 0.3 * -1) / 300);
                panzoom?.zoomToPoint(toScale, event);
            };

            el.parentElement?.addEventListener("wheel", handleWheel);
        },
    };
}

structurizr.ui.loadThemes(() => {
    const diagram = new structurizr.ui.Diagram(
        "structurizr-diagram-target",
        false,
        () => {
            diagram.setNavigationEnabled(true);
            const draggableZone = createDraggableZone();

            const observer = new ResizeObserver(() => {
                diagram.resize();
                diagram.zoomToWidthOrHeight();
            });
            observer.observe(document.body);

            const darkModePreference = window?.matchMedia(
                "(prefers-color-scheme: dark)",
            );

            diagram.setDarkMode(darkModePreference.matches);

            darkModePreference.addEventListener("change", (e) =>
                diagram.setDarkMode(e.matches),
            );

            const currentView = new CurrentView(
                document.querySelector<HTMLDivElement>(
                    "#structurizr-current-view",
                ) as HTMLElement,
            );

            diagram.onViewChanged((viewKey) => {
                const view = structurizr.workspace.findViewByKey(viewKey);
                const parentId =
                    view?.containerId ??
                    view?.softwareSystemId ??
                    view?.parentId;

                currentView.render(
                    view,
                    parentId
                        ? structurizr.workspace.findElementById(parentId)
                        : undefined,
                );
                draggableZone.resetZoom();
                // TODO: Check if current view has animations
                // Set button controls for animations
                // TODO: Toggle descriptions/technologies
                // TODO: reset zoom controls
            });

            new DiagramNavigation(
                document.querySelector<HTMLDivElement>(
                    "#structurizr-diagram-navigation",
                ) as HTMLElement,
                diagram,
                structurizr.workspace.getViews(),
            );
            // router.setDiagram(structurizr.workspace.getViews()[0].key)
            // router.syncDiagramWithURL()

            // new PNGExporter(diagram, window.joint)
        },
    );
});
