import { disclaimerHtml } from "./components/disclaimer.ts";
import { initTheme } from "./components/theme.ts";
import { applyBranding } from "./components/branding.ts";
import "./main.css";
import Router from "./components/router.ts";
import Navigation, { type WorkspaceSummary } from "./components/navigation.ts";
import { createImageResolver } from "./components/doc-images.ts";
import { createLinkResolver } from "./components/doc-links.ts";
import { takeSessionToken } from "./components/session-token.ts";
import history from "history/hash";
import {
    currentWorkspace,
    followWorkspaceTrail,
    onWorkspaceEntered,
    parentWorkspace,
} from "./current-workspace.ts";
import type { SetWorkspace } from "./workspace-set.ts";
import { inOtherWorkspace } from "./workspace-trail.ts";
import { summarizeWorkspace } from "./engine/workspace-summary";
import type Page from "./pages/_page.ts";
import DiagramsPage from "./pages/diagrams";
import { startLiveReload } from "./pages/diagrams-edit";

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

/**
 * The pages of a workspace: its diagrams, through the one `diagrams` page,
 * and its documentation and decisions when it has any.
 */
async function pagesOf(
    workspace: WorkspaceSummary,
    nav: Navigation,
    diagrams: Page,
): Promise<Page[]> {
    const routes: Page[] = [diagrams];

    // Links between sections and decisions are written as relative file
    // paths; this maps them onto the routes below.
    const { sections, decisions, images } = workspace.documentation;
    const resolveLink = createLinkResolver({
        docs: nav.hasDocs ? { page: "docs", sections } : null,
        decisions: nav.hasDecisions ? { page: "adrs", decisions } : null,
    });
    // Images they show come from the copies Structurizr embedded.
    const resolveImage = createImageResolver(images);

    if (nav.hasDocs) {
        const DocsPage = (await import("./pages/docs.ts")).default;
        routes.push(
            new DocsPage(
                null,
                "docs",
                sections,
                resolveLink("docs"),
                resolveImage,
            ),
        );
    }

    if (nav.hasDecisions) {
        const DecisionsPage = (await import("./pages/adrs.ts")).default;
        routes.push(
            new DecisionsPage(
                null,
                "adrs",
                decisions,
                resolveLink("decisions"),
                resolveImage,
            ),
        );
    }

    return routes;
}

async function init() {
    // Edit mode's token leaves the address bar before the router writes its
    // first route there (spec 4.5). Builds compile this out (ADR 15).
    if (__RENDERIZR_EDIT_MODE__) {
        takeSessionToken();
        // Changes to workspace.json reach the page from here on (spec 6.1).
        startLiveReload();
    }

    // The inline script in index.html has already stamped `data-theme` so the
    // first paint is in the right scheme; this takes ownership of it and keeps
    // it in step with the OS while the reader is on "system".
    initTheme();

    document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
        <main>
            <section class="workspace-header">
                <nav id="workspace-navigation"></nav>
                <hr />
            </section>
            <section id="page-content"></section>
            <footer id="disclaimer">${disclaimerHtml("c4", __RENDERIZR_VERSION__)}</footer>
        </main>
    `;

    const header = document.getElementById("workspace-navigation")!;
    const content = document.getElementById("page-content")!;
    const diagrams = new DiagramsPage(null, "diagrams");
    let nav: Navigation | null = null;
    let router: Router | null = null;
    /** Counts the workspaces shown, so a slow one never overrides a later one. */
    let shown = 0;
    /** The address path the header leads back from. */
    let headerPath: string | null = null;

    /** The header of `entered`, leading back up the address's trail. */
    const headerOf = (entered: SetWorkspace) => {
        headerPath = history.location.pathname;
        return new Navigation(
            header,
            summarizeWorkspace(entered.workspace),
            entered.branding.logo,
            parentWorkspace(headerPath),
        );
    };

    /** Draw the header and the page the address names from `entered`. */
    const show = async (entered: SetWorkspace) => {
        shown += 1;
        const showing = shown;
        const next = headerOf(entered);
        const routes = await pagesOf(
            summarizeWorkspace(entered.workspace),
            next,
            diagrams,
        );
        if (showing !== shown) return;

        nav?.clear();
        nav = next;
        nav.render();
        if (router) router.replacePages(routes);
        else router = new Router(content, routes);
    };

    // The page lands branded and titled by the build; each other workspace
    // of a set brings its own when the reader enters it (ADR 26).
    onWorkspaceEntered((entered) => {
        applyBranding(entered.branding);
        document.title = `${entered.name} | Structurizr`;
        if (router) void show(entered);
    });

    // An authored trail that ends at the workspace on screen changes only
    // where the header leads back to.
    history.listen(({ location }) => {
        const entered = currentWorkspace();
        if (!router || location.pathname === headerPath) return;
        if (inOtherWorkspace(location.pathname, entered.slug)) return;
        nav?.clear();
        nav = headerOf(entered);
        nav.render();
    });

    // An address on a workspace trail opens that workspace of the set
    // before anything is drawn from the landscape.
    await followWorkspaceTrail();
    await show(currentWorkspace());
    trackHeaderHeight();
}

init();
