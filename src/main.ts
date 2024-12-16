import getStructurizr from "./structurizr.ts";
import DiagramsPage from "./pages/diagrams.ts";
import "./main.css";
import Router from "./components/router.ts";
import Navigation from "./components/navigation.ts";
import type Page from "./pages/_page.ts";

async function init() {
    const structurizr = await getStructurizr();

    // Load workspace from global variable
    structurizr.workspace = new structurizr.Workspace(workspaceData);

    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
        <main>
            <section class="workspace-header">
                <nav id="workspace-navigation"></nav>
                <hr />
            </section>
            <section id="page-content"></section>
            <footer id="disclaimer">Diagrams rendered using <a href="https://structurizr.com/" target="_blank">Structurizr</a> and <a href="https://c4model.com/" target="_blank">C4 notation.</a> Created with <a href="https://github.com/FormulaMonks/renderizr" target="_blank">Renderizr</a>.</footer>
        </main>
    `;

    const nav = new Navigation(
        document.getElementById("workspace-navigation")!,
        structurizr.workspace,
    );

    nav.render();

    const routes: Page[] = [new DiagramsPage(null, "diagrams")];

    if (nav.hasDocs) {
        const DocsPage = (await import("./pages/docs.ts")).default;
        routes.push(
            new DocsPage(
                null,
                "docs",
                structurizr.workspace.documentation.sections,
            ),
        );
    }

    if (nav.hasDecisions) {
        const DecisionsPage = (await import("./pages/adrs.ts")).default;
        routes.push(
            new DecisionsPage(
                null,
                "adrs",
                structurizr.workspace.documentation.decisions,
            ),
        );
    }

    new Router(document.getElementById("page-content")!, routes);
}

init();
