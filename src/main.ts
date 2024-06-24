import getStructurizr from "./structurizr.ts";
import DiagramsPage from "./pages/diagrams.ts";
import "./main.css";

async function init() {
    const structurizr = await getStructurizr();

    // Load workspace from global variable
    structurizr.workspace = new structurizr.Workspace(workspaceData);

    const diagramsAndDocs =
        structurizr.workspace.hasDocumentation() &&
        structurizr.workspace.hasDecisions();

    // TODO: create a "Documentation" page
    // TODO: create a "Decisions" page
    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
        <main>
            <h1 class="workspace-title">${structurizr.workspace.name}</h1>
            <!--TODO: work on a "Main Navigation" component that is in charge of rendering the pages below-->
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
            <section id="page-content"></section>
        </main>
    `;

    const diagramsPage = new DiagramsPage(
        document.getElementById("page-content")!,
    );
    diagramsPage.render();
}

init();
