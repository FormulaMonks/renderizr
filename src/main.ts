import getStructurizr from "./structurizr.ts";
import DiagramsPage from "./pages/diagrams.ts";
import DocsPage from "./pages/docs.ts";
import DecisionsPage from "./pages/adrs.ts";
import "./main.css";
import Router from "./components/router.ts";
import Navigation from "./components/navigation.ts";

async function init() {
    const structurizr = await getStructurizr();

    // Load workspace from global variable
    structurizr.workspace = new structurizr.Workspace(workspaceData);

    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
        <main>
            <h1 class="workspace-title">${structurizr.workspace.name}</h1>
            <nav id="structurizr-docs-navigation"></nav>
            <hr />
            <section id="page-content"></section>
        </main>
    `;

    new Navigation(
        document.getElementById("structurizr-docs-navigation")!,
        structurizr.workspace,
    ).render();

    new Router(document.getElementById("page-content")!, [
        new DiagramsPage(null, "diagrams"),
        new DocsPage(null, "docs"),
        new DecisionsPage(null, "adrs"),
    ]);
}

init();
