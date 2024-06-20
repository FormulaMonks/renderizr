import getStructurizr from "./structurizr.ts";

import "./main.css";
import DiagramNavigation from "./components/diagram-navigation.ts";
import CurrentView from "./components/current-view.ts";
import DraggableZone from "./components/draggable-zone.ts";
import type {
    StructurizrElement,
    View,
} from "./types/structurizr-workspace.ts";

async function init() {
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

    structurizr.ui.loadThemes(() => {
        const diagram = new structurizr.ui.Diagram(
            "structurizr-diagram-target",
            false,
            () => {
                diagram.setNavigationEnabled(true);

                function navigateToContainer(id?: string) {
                    if (!id) return;
                    const views =
                        structurizr.workspace.findComponentViewsForContainer(
                            id,
                        );
                    if (views.length) diagram.changeView(views[0].key);
                }

                function navigateToSoftwareSystem(element: StructurizrElement) {
                    // TODO: Display a spinner while rendering
                    const view = diagram.getCurrentView();
                    let views: View[] = [];

                    if (
                        view.type ===
                            structurizr.constants.SYSTEM_LANDSCAPE_VIEW_TYPE ||
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
                        view.type ===
                        structurizr.constants.SYSTEM_CONTEXT_VIEW_TYPE
                    ) {
                        views =
                            structurizr.workspace.findContainerViewsForSoftwareSystem(
                                element.id,
                            );
                    }

                    if (views.length) diagram.changeView(views[0].key);
                }

                function handleElementDoubleClick(_: Event, elementId: string) {
                    const element =
                        structurizr.workspace.findElementById(elementId);

                    if (!element) return;
                    if (element.url) window.open(element.url, "_blank");

                    switch (element.type) {
                        case structurizr.constants.SOFTWARE_SYSTEM_ELEMENT_TYPE:
                            navigateToSoftwareSystem(element);
                            break;
                        case structurizr.constants.CONTAINER_ELEMENT_TYPE:
                            navigateToContainer(element.id);
                            break;
                        case structurizr.constants
                            .CONTAINER_INSTANCE_ELEMENT_TYPE:
                            navigateToContainer(element.containerId);
                            break;
                    }
                }

                const draggableZone = new DraggableZone(
                    document.querySelector(
                        "#structurizr-diagram-target-canvas",
                    ) as HTMLElement,
                );

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

                const nav = new DiagramNavigation(
                    document.querySelector<HTMLDivElement>(
                        "#structurizr-diagram-navigation",
                    ) as HTMLElement,
                    diagram,
                    structurizr.workspace.getViews(),
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
                    nav.changeView(viewKey);
                    // TODO: Check if current view has animations
                    // Set button controls for animations
                    // TODO: Toggle descriptions/technologies
                    // TODO: reset zoom controls
                });

                diagram.onElementDoubleClicked(handleElementDoubleClick);

                // new PNGExporter(diagram, window.joint)
            },
        );
    });
}

init();
