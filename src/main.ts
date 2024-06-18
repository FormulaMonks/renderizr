import getStructurizr from "./structurizr.ts";
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

structurizr.ui.loadThemes(() => {
    const diagram = new structurizr.ui.Diagram(
        "structurizr-diagram-target",
        false,
        () => {
            console.log("🦊", "diagram", diagram);
            diagram.setNavigationEnabled(true);

            const observer = new ResizeObserver(() => {
                diagram.resize();
                diagram.zoomToWidthOrHeight();
            });
            observer.observe(document.body);

            const startingViewKey = structurizr.workspace.getViews()?.[0]?.key;
            if (startingViewKey) {
                diagram.changeView(startingViewKey);
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
            });

            // router.setDiagram(structurizr.workspace.getViews()[0].key)
            // router.syncDiagramWithURL()

            // new PNGExporter(diagram, window.joint)
        },
    );
});
