import type { Workspace } from "../types/structurizr-workspace";
import history from "history/hash";
import Component from "./_component";
import styles from "./navigation.module.css";
import { cycleMode, getMode, onThemeChange, type ThemeMode } from "./theme";
import lightIcon from "../../vendor/structurizr/bootstrap-icons/sun-fill.svg?raw";
import darkIcon from "../../vendor/structurizr/bootstrap-icons/moon-fill.svg?raw";
import systemIcon from "../../vendor/structurizr/bootstrap-icons/circle-half.svg?raw";

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

export default class Navigation extends Component {
    #workspace: Workspace;
    #unsubscribeTheme: (() => void) | null = null;

    constructor(element: HTMLElement, workspace: Workspace) {
        super(element);
        this.#workspace = workspace;
    }

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
        // and 404s everywhere the file is published.
        const link = (page: string, label: string) =>
            `<li><a href="${history.createHref({ search: `?page=${page}` })}" data-page="${page}">${label}</a></li>`;

        const logo = __RENDERIZR_LOGO__;
        const logoImg = logo
            ? `<img class="${styles.logo}" src="${logo.src}" alt="${logo.alt}"${
                  logo.width ? ` width="${logo.width}"` : ""
              }${logo.height ? ` height="${logo.height}"` : ""}>`
            : "";

        this.element.innerHTML = `
            <div class="${styles.titleAndDesc}">
                <div class="${styles.brand}">
                    ${
                        logo
                            ? logo.href
                                ? `<a href="${logo.href}" target="_blank" rel="noreferrer">${logoImg}</a>`
                                : logoImg
                            : ""
                    }
                    <h1 class="${styles.workspaceTitle}">${structurizr.workspace.name}</h1>
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

        history.listen((update) => {
            for (const link of this.#links()) {
                link.classList.remove(styles.navigationActive);
                const search = new URLSearchParams(update.location.search);
                if (link.dataset.page === search.get("page")) {
                    link.classList.add(styles.navigationActive);
                }
            }
        });

        this.#addEvents();

        return this;
    }

    clear() {
        this.element?.classList.remove(styles.navigation);
        this.#unsubscribeTheme?.();
        this.#unsubscribeTheme = null;
        this.#removeEvents();

        const children = this.element?.querySelectorAll("*");
        if (children) {
            for (const child of Array.from(children)) {
                child.remove();
            }
        }
    }
}
