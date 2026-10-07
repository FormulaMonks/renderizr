import workspaceData from "virtual:renderizr/workspace";
import { initTheme } from "./components/theme.ts";
import "./main.css";
import Router from "./components/router.ts";
import Navigation from "./components/navigation.ts";
import { createLinkResolver } from "./components/doc-links.ts";
import { takeSessionToken } from "./components/session-token.ts";
import { summarizeWorkspace } from "./engine/workspace-summary";
import type Page from "./pages/_page.ts";
import DiagramsPage from "./pages/diagrams";

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
    // Edit mode's token leaves the address bar before the router writes its
    // first route there (spec 4.5). Builds compile this out (ADR 15).
    if (__RENDERIZR_EDIT_MODE__) takeSessionToken();

    // The inline script in index.html has already stamped `data-theme` so the
    // first paint is in the right scheme; this takes ownership of it and keeps
    // it in step with the OS while the reader is on "system".
    initTheme();

    const workspace = summarizeWorkspace(workspaceData);

    // Which Renderizr produced this page. A site outlives the version that
    // built it, and the first question about a stale-looking render is which
    // one that was. Omitted rather than faked when the manifest was unreadable.
    const version = __RENDERIZR_VERSION__ ? ` v${__RENDERIZR_VERSION__}` : "";

    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
        <main>
            <section class="workspace-header">
                <nav id="workspace-navigation"></nav>
                <hr />
            </section>
            <section id="page-content"></section>
            <footer id="disclaimer">Diagrams from a <a href="https://structurizr.com/" target="_blank">Structurizr</a> workspace, in <a href="https://c4model.com/" target="_blank">C4 notation</a>, drawn with <a href="https://reactflow.dev/" target="_blank">React Flow</a>. Created with <a href="https://github.com/FormulaMonks/renderizr" target="_blank">Renderizr</a>${version}.</footer>
        </main>
    `;

    const nav = new Navigation(
        document.getElementById("workspace-navigation")!,
        workspace,
    );

    nav.render();
    trackHeaderHeight();

    const routes: Page[] = [new DiagramsPage(null, "diagrams")];

    // Links between sections and decisions are written as relative file
    // paths; this maps them onto the routes below.
    const { sections, decisions } = workspace.documentation;
    const resolveLink = createLinkResolver({
        docs: nav.hasDocs ? { page: "docs", sections } : null,
        decisions: nav.hasDecisions ? { page: "adrs", decisions } : null,
    });

    if (nav.hasDocs) {
        const DocsPage = (await import("./pages/docs.ts")).default;
        routes.push(new DocsPage(null, "docs", sections, resolveLink("docs")));
    }

    if (nav.hasDecisions) {
        const DecisionsPage = (await import("./pages/adrs.ts")).default;
        routes.push(
            new DecisionsPage(
                null,
                "adrs",
                decisions,
                resolveLink("decisions"),
            ),
        );
    }

    new Router(document.getElementById("page-content")!, routes);
}

init();
