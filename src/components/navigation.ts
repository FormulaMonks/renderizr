import type {
    Decision,
    DocumentationImage,
    DocumentationSection,
} from "../types/structurizr-documentation";

/** What the header and the documentation pages read off the workspace. */
export type WorkspaceSummary = {
    name: string;
    description: string;
    version?: string;
    /** The workspace JSON's ISO string. */
    lastModifiedDate: string;
    documentation: {
        sections: DocumentationSection[];
        decisions: Decision[];
        images: DocumentationImage[];
    };
};
import history from "history/hash";
import type { Logo } from "virtual:renderizr/set";
import Component from "./_component";
import styles from "./navigation.module.css";
import { cycleMode, getMode, onThemeChange, type ThemeMode } from "./theme";
import lightIcon from "bootstrap-icons/icons/sun-fill.svg?raw";
import darkIcon from "bootstrap-icons/icons/moon-fill.svg?raw";
import systemIcon from "bootstrap-icons/icons/circle-half.svg?raw";

const THEME_ICON: Record<ThemeMode, string> = {
    light: lightIcon,
    dark: darkIcon,
    system: systemIcon,
};

/**
 * Named for the page, not the diagram: the diagram toolbar has a toggle of its
 * own and the two are independent preferences.
 */
const THEME_LABEL: Record<ThemeMode, string> = {
    light: "Page theme: light. Switch to dark",
    dark: "Page theme: dark. Follow the system",
    system: "Page theme: system. Switch to light",
};

/**
 * The workspace the header's button leads back to along the workspace
 * trail (ADR 26): its name, and the address path that shows it.
 */
export type ParentWorkspace = { name: string; pathname: string };

/** The address query that opens a workspace at its default view. */
const DEFAULT_VIEW = "?page=diagrams";

export default class Navigation extends Component {
    #workspace: WorkspaceSummary;
    #logo: Logo | null;
    #parent: ParentWorkspace | null;
    #back: HTMLAnchorElement | null = null;
    #unsubscribeTheme: (() => void) | null = null;
    #unlisten: (() => void) | null = null;

    /**
     * `logo` is the branding of the workspace the reader is in (ADR 26):
     * by default the one the page lands on. `parent` is the workspace the
     * header leads back to, off the landscape.
     */
    constructor(
        element: HTMLElement,
        workspace: WorkspaceSummary,
        logo: Logo | null = __RENDERIZR_LOGO__,
        parent: ParentWorkspace | null = null,
    ) {
        super(element);
        this.#workspace = workspace;
        this.#logo = logo;
        this.#parent = parent;
    }

    /** Open the parent workspace at its default view. */
    #goBack = (event: Event) => {
        event.preventDefault();
        if (!this.#parent) return;
        history.push({ pathname: this.#parent.pathname, search: DEFAULT_VIEW });
    };

    #links = () =>
        Array.from(
            this.element?.querySelectorAll<HTMLAnchorElement>("ul > li > a") ??
                [],
        );

    #linkEventHandlers = new Map<HTMLAnchorElement, (evt: Event) => void>();

    #addEvents() {
        for (const link of this.#links()) {
            const handler = (evt: Event) => {
                evt.preventDefault();
                history.push({ search: `page=${link.dataset.page}` });
            };
            link.addEventListener("click", handler);
            this.#linkEventHandlers.set(link, handler);
        }
    }

    #removeEvents() {
        for (const [link, handler] of this.#linkEventHandlers) {
            link.removeEventListener("click", handler);
        }
        this.#back?.removeEventListener("click", this.#goBack);
        this.#back = null;
    }

    get hasDocs() {
        return this.#workspace.documentation.sections?.length > 0;
    }

    get hasDecisions() {
        return this.#workspace.documentation.decisions?.length > 0;
    }

    get hasDocsAndDecisions() {
        return this.hasDocs && this.hasDecisions;
    }

    #paintThemeToggle(mode: ThemeMode) {
        const button =
            this.element?.querySelector<HTMLButtonElement>("#theme-toggle");
        if (!button) return;

        button.innerHTML = THEME_ICON[mode];
        button.title = THEME_LABEL[mode];
        button.setAttribute("aria-label", THEME_LABEL[mode]);
        button.dataset.mode = mode;
    }

    /**
     * Lives in the shared header rather than the diagram toolbar, so the theme
     * is reachable from the documentation and decision pages too.
     */
    #renderThemeToggle() {
        const button =
            this.element?.querySelector<HTMLButtonElement>("#theme-toggle");
        if (!button) return;

        this.#paintThemeToggle(getMode());
        button.addEventListener("click", () => cycleMode());

        this.#unsubscribeTheme?.();
        this.#unsubscribeTheme = onThemeChange((__, mode) =>
            this.#paintThemeToggle(mode),
        );
    }

    render() {
        if (!(this.#workspace && this.element)) return;

        this.element.classList.add(styles.navigation);

        // A real href, so middle-click, cmd-click and "copy link address" all
        // produce a URL that works — a bare "docs" resolves against the host
        // and 404s everywhere the file is published. It keeps the workspace
        // trail, so the copy opens this workspace of a set.
        const { pathname } = history.location;
        const link = (page: string, label: string) =>
            `<li><a href="${history.createHref({ pathname, search: `?page=${page}` })}" data-page="${page}">${label}</a></li>`;

        // Off the landscape, the way back up the workspace trail. The logo
        // stays branding.
        const parent = this.#parent;
        const back = parent
            ? `<a class="${styles.back}" data-back href="${history.createHref({ pathname: parent.pathname, search: DEFAULT_VIEW })}" title="Back to parent workspace">\u2190 ${parent.name}</a>`
            : "";

        const logo = this.#logo;
        const logoImg = logo
            ? `<img class="${styles.logo}" src="${logo.src}" alt="${logo.alt}"${
                  logo.width ? ` width="${logo.width}"` : ""
              }${logo.height ? ` height="${logo.height}"` : ""}>`
            : "";
        const brandMark = logo?.href
            ? `<a href="${logo.href}" target="_blank" rel="noreferrer">${logoImg}</a>`
            : logoImg;

        // A logo whose alt text is the workspace name already says it, so it
        // takes the title's place in the h1 instead of repeating it beside it.
        const name = this.#workspace.name ?? "";
        const logoIsTitle =
            !!logo &&
            logo.alt.trim().toLowerCase() === name.trim().toLowerCase() &&
            name.trim() !== "";

        this.element.innerHTML = `
            <div class="${styles.titleAndDesc}">
                <div class="${styles.brand}">
                    ${back}
                    ${
                        logoIsTitle
                            ? `<h1 class="${styles.logoTitle}">${brandMark}</h1>`
                            : `${brandMark}
                    <h1 class="${styles.workspaceTitle}">${name}</h1>`
                    }
                </div>
                <section>
                    <p>${this.#workspace.description}</p>
                    <p>${this.#workspace.version ? `Version: ${this.#workspace.version} - ` : ""}Last modified: <strong>${new Date(this.#workspace.lastModifiedDate).toLocaleDateString()}</strong></p>
                </section>
            </div>
            <div class="${styles.navActions}">
                <ul>
                    ${!(this.hasDocs || this.hasDecisions) ? "" : link("diagrams", "Diagrams")}
                    ${this.hasDocs ? link("docs", "Documentation") : ""}
                    ${this.hasDecisions ? link("adrs", "Decisions") : ""}
                </ul>
                <button type="button" id="theme-toggle" class="${styles.themeToggle}"></button>
            </div>`;

        this.#renderThemeToggle();

        this.#unlisten?.();
        this.#unlisten = history.listen((update) => {
            for (const link of this.#links()) {
                link.classList.remove(styles.navigationActive);
                const search = new URLSearchParams(update.location.search);
                if (link.dataset.page === search.get("page")) {
                    link.classList.add(styles.navigationActive);
                }
            }
        });

        this.#addEvents();
        this.#back =
            this.element.querySelector<HTMLAnchorElement>("a[data-back]");
        this.#back?.addEventListener("click", this.#goBack);

        return this;
    }

    clear() {
        this.element?.classList.remove(styles.navigation);
        this.#unsubscribeTheme?.();
        this.#unsubscribeTheme = null;
        this.#unlisten?.();
        this.#unlisten = null;
        this.#removeEvents();
        this.#linkEventHandlers.clear();

        const children = this.element?.querySelectorAll("*");
        if (children) {
            for (const child of Array.from(children)) {
                child.remove();
            }
        }
    }
}
