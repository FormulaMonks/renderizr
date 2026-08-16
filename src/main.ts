import { initTheme } from "./components/theme.ts";
import getStructurizr from "./structurizr-runtime.ts";
import DiagramsPage from "./pages/diagrams.ts";
import "./main.css";
import Router from "./components/router.ts";
import Navigation from "./components/navigation.ts";
import type Page from "./pages/_page.ts";

/**
 * Publish the sticky header's height as a custom property.
 *
 * Anything that scrolls something into view has to clear that header, and its
 * height is not a constant: it changes with the viewport, with the page (the
 * diagrams page drops the workspace blurb), and with a logo if one was
 * embedded. A hard-coded offset in the stylesheet is wrong for most of those,
 * which is how heading anchors ended up landing underneath it.
 */
function trackHeaderHeight() {
    const header = document.querySelector(".workspace-header");
    if (!header) return;

    const publish = () =>
        document.documentElement.style.setProperty(
            "--header-height",
            `${Math.round(header.getBoundingClientRect().height)}px`,
        );

    publish();
    new ResizeObserver(publish).observe(header);
}

async function init() {
    // The inline script in index.html has already stamped `data-theme` so the
    // first paint is in the right scheme; this takes ownership of it and keeps
    // it in step with the OS while the reader is on "system".
    initTheme();

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
    trackHeaderHeight();

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
