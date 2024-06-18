import getStructurizr from "./structurizr.ts";
import "./main.css";

const structurizr = await getStructurizr();

// Load workspace from global variable
structurizr.workspace = new structurizr.Workspace(workspaceData);

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <h1>Structurizr Static Page</h1>
    <div id="structurizr-diagram-target"></div>
  </div>
`;

structurizr.ui.loadThemes(() => {
    const diagram = new structurizr.ui.Diagram(
        "structurizr-diagram-target",
        false,
        () => {
            diagram.setNavigationEnabled(true);
            diagram.resize();
            diagram.zoomToWidthOrHeight();

            // const router = new Router(diagram)
            diagram.changeView(structurizr.workspace.getViews()[0].key);
            // router.setDiagram(structurizr.workspace.getViews()[0].key)
            // router.syncDiagramWithURL()

            // new QuickNav()
            // new PNGExporter(diagram, window.joint)
            // new WindowResizeHandler(diagram)
        },
    );
});
