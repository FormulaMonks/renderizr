import getStructurizr from "./structurizr.ts";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";

import "./styles/main.css";
import "./styles/navbar.css";

const structurizr = await getStructurizr();

// Load workspace from global variable
structurizr.workspace = new structurizr.Workspace(workspaceData);

const diagramsAndDocs =
    structurizr.workspace.hasDocumentation() &&
    structurizr.workspace.hasDecisions();

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main>
        <h1 class="workspace-title">${structurizr.workspace.name}</h1>
        <p class="workspace-description">${structurizr.workspace.description}</p>
        <nav id="structurizr-docs-navigation">
            <ul>
                ${!diagramsAndDocs ? "" : '<li><a href="#" class="active">Diagrams</a></li>'}
                ${structurizr.workspace.hasDocumentation() ? `<li><a href="#">Documentation</a></li>` : ""}
                ${structurizr.workspace.hasDecisions() ? `<li><a href="#">Decisions</a></li>` : ""}
            </ul>
        </nav>
        <div id="structurizr-diagram-target"></div>
        <div id="structurizr-diagram-navigation">
            <ul>
                ${
                    structurizr.workspace.hasViews()
                        ? structurizr.workspace
                              .getViews()
                              .map(
                                  (view) => `
                <li>
                    <a href="#" data-viewkey="${view.key}">${view.key}</a>
                </li>
                `,
                              )
                              .join("")
                        : ""
                }
            </ul>
        </div>
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
            );

            if (!el) return;

            panzoom = Panzoom(el as HTMLElement, { canvas: true });

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

            diagram.setDarkMode(
                window?.matchMedia("(prefers-color-scheme: dark)").matches,
            );

            const startingViewKey = structurizr.workspace.getViews()?.[0]?.key;
            if (startingViewKey) {
                diagram.changeView(startingViewKey);

                draggableZone.resetZoom();
            }

            const diagramNavigation = document.querySelector<HTMLDivElement>(
                "#structurizr-diagram-navigation",
            );

            for (const d of Array.from(
                diagramNavigation?.querySelectorAll<HTMLDataListElement>(
                    "ul > li > a",
                ) ?? [],
            )) {
                d.addEventListener("click", (event) => {
                    event.preventDefault();
                    const viewKey = (event.target as HTMLElement).dataset
                        .viewkey;
                    if (viewKey) {
                        diagram.changeView(viewKey);
                    }
                });
            }

            diagram.onViewChanged(() => {
                // TODO: Check if current view has animations
                // Set button controls for animations
                // TODO: Toggle descriptions/technologies
                // TODO: reset zoom controls
            });

            // router.setDiagram(structurizr.workspace.getViews()[0].key)
            // router.syncDiagramWithURL()

            // new PNGExporter(diagram, window.joint)
        },
    );
});
