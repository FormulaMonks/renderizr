import { readSetting, writeSetting } from "../storage";
import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import collapseIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/arrow-bar-left.svg?raw";
import expandIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/arrow-bar-right.svg?raw";
import componentIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/box-seam.svg?raw";
import containerIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/boxes.svg?raw";
import dynamicIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/collection-play-fill.svg?raw";
import imageIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/file-earmark-image.svg?raw";
import filteredIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/funnel.svg?raw";
import systemLandscapeIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/globe2.svg?raw";
import systemContextIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/layout-wtf.svg?raw";
import customIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/pentagon.svg?raw";
import deploymentIcon from "../../submodules/structurizr/structurizr-application/src/main/resources/static/static/bootstrap-icons/rocket-takeoff.svg?raw";
import history from "history/hash";
import Component from "./_component";
import styles from "./diagram-navigation.module.css";

/** Every view type the model can produce carries its own mark. */
const DiagramIcon = new Map([
    ["SystemLandscape", systemLandscapeIcon],
    ["SystemContext", systemContextIcon],
    ["Container", containerIcon],
    ["Component", componentIcon],
    ["Dynamic", dynamicIcon],
    ["Deployment", deploymentIcon],
    ["Image", imageIcon],
    ["Custom", customIcon],
    ["Filtered", filteredIcon],
]);

const COLLAPSED_KEY = "renderizr:diagramDrawerCollapsed";
const SCROLL_KEY = "renderizr:diagramDrawerScroll";

export default class DiagramNavigation extends Component {
    #diagram: Diagram;
    #navElements: View[] = [];
    #eventListeners: Map<string, (event: Event) => void> = new Map();
    #unlisten: (() => void) | null = null;
    #collapsed = readSetting(COLLAPSED_KEY) === "true";
    #list: HTMLElement | null = null;

    constructor(element: HTMLElement, diagram: Diagram, navElements: View[]) {
        super(element);
        this.#diagram = diagram;
        this.#navElements = navElements;
    }

    #items() {
        return Array.from(
            this.element?.querySelectorAll<HTMLElement>("li[data-viewkey]") ??
                [],
        );
    }

    #addEvents() {
        for (const item of this.#items()) {
            const key = item.dataset.viewkey;
            if (!key) continue;

            const callback = (event: Event) => {
                event.preventDefault();
                this.changeView(key);
            };

            this.#eventListeners.set(key, callback);
            item.addEventListener("click", callback);
        }
    }

    #removeEvents() {
        for (const item of this.#items()) {
            const key = item.dataset.viewkey;
            const callback = key ? this.#eventListeners.get(key) : undefined;
            if (callback) item.removeEventListener("click", callback);
        }
        this.#eventListeners.clear();
    }

    #setViewInUrl(viewKey: string) {
        const search = new URLSearchParams(history.location.search);
        if (search.get("view") === viewKey) return;
        search.set("view", viewKey);
        history.push({ search: search.toString() });
    }

    /**
     * Back, forward, and a link pasted into an already-open tab all arrive
     * here. Without this the URL and the diagram on screen drift apart.
     */
    #followUrl = (search: string) => {
        const viewKey = new URLSearchParams(search).get("view");
        if (!viewKey) return;
        if (this.#diagram.getCurrentView()?.key === viewKey) return;
        if (!this.#navElements.some((el) => el.key === viewKey)) return;

        this.changeView(viewKey);
    };

    #getViewFromUrl() {
        const view = new URLSearchParams(history.location.search).get("view");
        return this.#navElements.find((el) => el.key === view)?.key;
    }

    /** The drawer's scroll position, kept across view changes and reloads. */
    #rememberScroll = () => {
        if (this.#list) writeSetting(SCROLL_KEY, String(this.#list.scrollTop));
    };

    #restoreScroll() {
        if (!this.#list) return;
        const saved = Number(readSetting(SCROLL_KEY) ?? "0");
        if (Number.isFinite(saved) && saved > 0) this.#list.scrollTop = saved;
    }

    /** Only scrolls when the selected view is actually out of sight. */
    #revealActive(viewKey: string) {
        const item = this.element?.querySelector(
            `li[data-viewkey="${viewKey}"]`,
        );
        if (!item || !this.#list) return;

        const list = this.#list.getBoundingClientRect();
        const box = item.getBoundingClientRect();
        if (box.top < list.top || box.bottom > list.bottom) {
            item.scrollIntoView({ block: "nearest" });
        }
    }

    #setCollapsed(collapsed: boolean) {
        this.#collapsed = collapsed;
        this.element?.classList.toggle(styles.collapsed, collapsed);
        writeSetting(COLLAPSED_KEY, String(collapsed));

        const toggle = this.element?.querySelector<HTMLButtonElement>(
            `.${styles.toggle}`,
        );
        if (!toggle) return;

        toggle.innerHTML = collapsed ? expandIcon : collapseIcon;
        toggle.title = collapsed ? "Show view names" : "Collapse to icons";
        toggle.setAttribute("aria-label", toggle.title);
        toggle.setAttribute("aria-expanded", String(!collapsed));
    }

    #handleToggle = () => this.#setCollapsed(!this.#collapsed);

    changeView(viewKey?: string) {
        if (!viewKey) return;

        for (const item of this.#items()) {
            const active = item.dataset.viewkey === viewKey;
            item.classList.toggle(styles.active, active);
            const button = item.querySelector("button");
            if (active) button?.setAttribute("aria-current", "true");
            else button?.removeAttribute("aria-current");
        }

        this.#setViewInUrl(viewKey);
        this.#revealActive(viewKey);
        this.#diagram.changeView(viewKey);
    }

    render() {
        if (!this.element) return;
        this.clear();
        this.element.classList.add(styles.drawer);

        this.element.innerHTML = `
            <button type="button" class="${styles.toggle}"></button>
            <div class="${styles.list}">
                <ul>
                    ${this.#navElements
                        .map((view) => {
                            // getTitleForView prefixes a bracketed kind when a
                            // view has no title of its own; the icon already
                            // says which kind it is.
                            const title = structurizr.ui.getTitleForView(view);
                            const name =
                                title.replace(/^\[([^\]]+)\]\s*/, "").trim() ||
                                title.replace(/[[\]]/g, "");
                            const label = `${name} (#${view.key})`;

                            return `
                        <li data-viewkey="${view.key}">
                            <button type="button" title="${label}" aria-label="${label}">
                                <span class="${styles.icon}">${DiagramIcon.get(view.type) ?? customIcon}</span>
                                <span class="${styles.label}">
                                    <span class="${styles.name}">${name}</span>
                                    <span class="${styles.key}">#${view.key}</span>
                                </span>
                            </button>
                        </li>`;
                        })
                        .join("")}
                </ul>
            </div>
        `;

        this.#list = this.element.querySelector(`.${styles.list}`);
        this.#list?.addEventListener("scroll", this.#rememberScroll, {
            passive: true,
        });

        this.element
            .querySelector(`.${styles.toggle}`)
            ?.addEventListener("click", this.#handleToggle);
        this.#setCollapsed(this.#collapsed);
        this.#restoreScroll();
        this.#addEvents();

        const startingViewKey =
            this.#getViewFromUrl() ?? this.#navElements[0]?.key;
        if (startingViewKey) this.changeView(startingViewKey);

        this.#unlisten?.();
        this.#unlisten = history.listen((update) =>
            this.#followUrl(update.location.search),
        );
    }

    clear() {
        this.#removeEvents();
        this.#unlisten?.();
        this.#unlisten = null;
        this.#list?.removeEventListener("scroll", this.#rememberScroll);
        this.element
            ?.querySelector(`.${styles.toggle}`)
            ?.removeEventListener("click", this.#handleToggle);
        this.#list = null;
        if (this.element) this.element.innerHTML = "";
    }
}
