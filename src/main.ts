import getStructurizr from "./structurizr.ts";
import DiagramsPage from "./pages/diagrams.ts";
import DocsPage from "./pages/docs.ts";
import DecisionsPage from "./pages/adrs.ts";
import "./main.css";
import Router from "./components/router.ts";
import history from "history/browser";

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
            <!--TODO: work on a "Main Navigation" component that is in charge of rendering the pages below-->
            <nav id="structurizr-docs-navigation">
                <section class="workspace-description">
                    <p>${structurizr.workspace.description}</p>
                    <p>${structurizr.workspace.version ? `Version: ${structurizr.workspace.version} - ` : ""}Last modified: <strong>${new Date(structurizr.workspace.lastModifiedDate).toLocaleDateString()}</strong></p>
                </section>
                <ul>
                    ${!diagramsAndDocs ? "" : '<li><a href="/diagrams" class="active">Diagrams</a></li>'}
                    ${structurizr.workspace.hasDocumentation() ? `<li><a href="/docs">Documentation</a></li>` : ""}
                    ${structurizr.workspace.hasDecisions() ? `<li><a href="/adrs">Decisions</a></li>` : ""}
                </ul>
            </nav>
            <hr />
            <section id="page-content"></section>
        </main>
    `;

    new Router(document.getElementById("page-content")!, [
        new DiagramsPage(null),
        new DocsPage(null),
        new DecisionsPage(null, "adrs"),
    ]);

    const links = () =>
        Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
                "#structurizr-docs-navigation > ul > li > a",
            ),
        );

    for (const link of links()) {
        link.addEventListener("click", (evt: Event) => {
            evt.preventDefault();

            for (const l of links()) {
                l.classList.remove("active");
            }

            history.push(link.getAttribute("href")!);
            link.classList.add("active");
        });
    }
}

init();
