import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import systemLandscapeIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/globe2.svg?raw";
import systemContextIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/layout-wtf.svg?raw";
import dynamicIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/collection-play-fill.svg?raw";
import containerIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/boxes.svg?raw";
import componentIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/box-seam.svg?raw";
import deploymentIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/rocket-takeoff.svg?raw";
import styles from "./diagram-navigation.module.css";
import history from "history/browser";
import Component from "./_component";

const DiagramIcon = new Map([
    ["SystemLandscape", systemLandscapeIcon],
    ["SystemContext", systemContextIcon],
    ["Container", containerIcon],
    ["Component", componentIcon],
    ["Dynamic", dynamicIcon],
    ["Deployment", deploymentIcon],
]);

export default class DiagramNavigation extends Component {
    #el: HTMLElement | null = null;
    #diagram: Diagram;
    #navElements: View[] = [];
    #eventListeners: Map<
        string,
        (this: HTMLDataListElement, ev: MouseEvent) => unknown
    > = new Map();

    constructor(el: HTMLElement, diagram: Diagram, navElements: View[]) {
        super();
        this.#el = el;
        this.#diagram = diagram;
        this.#navElements = navElements;
    }

    changeView(viewKey?: string) {
        if (!viewKey) return;

        for (const el of Array.from(
            this.#el?.querySelectorAll<HTMLDataListElement>("ul > li") ?? [],
        )) {
            if (el.dataset.viewkey === viewKey) {
                el.classList.add(styles.active);
            } else {
                el.classList.remove(styles.active);
            }
        }

        if (viewKey) {
            this.#setViewInUrl(viewKey);
            this.#diagram.changeView(viewKey);
        }
    }

    #addEvents() {
        for (const viewLink of Array.from(
            this.#el?.querySelectorAll<HTMLDataListElement>("ul > li") ?? [],
        )) {
            if (!viewLink.dataset.viewkey) continue;
            const callback = (event: Event) => {
                event.preventDefault();

                this.changeView(viewLink.dataset.viewkey);
            };

            this.#eventListeners.set(viewLink.dataset.viewkey, callback);
            viewLink.addEventListener("click", callback);
        }
    }

    #removeEvents() {
        for (const viewLink of Array.from(
            this.#el?.querySelectorAll<HTMLDataListElement>("ul > li") ?? [],
        )) {
            if (!viewLink.dataset.viewkey) continue;
            const callback = this.#eventListeners.get(viewLink.dataset.viewkey);

            if (!callback) continue;

            viewLink.removeEventListener("click", callback);
        }
    }

    clear() {
        this.#removeEvents();
        const ul = this.#el?.querySelector("ul");
        if (ul) {
            this.#el?.removeChild(ul);
        }
    }

    #setViewInUrl(viewKey: string) {
        const search = new URLSearchParams(history?.location.search);
        search.set("view", viewKey);
        history.push({ search: search.toString() });
    }

    #getViewFromUrl() {
        const search = new URLSearchParams(window.location.search);
        const view = search.get("view");

        if (this.#navElements.find((el) => el.key === view)) {
            return view;
        }
    }

    render() {
        if (!this.#el) return;
        this.clear();

        this.#el.classList.add(styles.diagramNavigation);
        const observer = new ResizeObserver(() => {
            if (!this.#el) return;
            if (this.#el.clientWidth >= this.#el.scrollWidth) {
                this.#el.classList.add(styles.centered);
            } else {
                this.#el.classList.remove(styles.centered);
            }
        });
        observer.observe(this.#el);
        const ul = document.createElement("ul");

        for (const view of this.#navElements) {
            const li = document.createElement("li");
            const a = document.createElement("a");
            li.dataset.viewkey = view.key;
            a.href = "#";
            a.textContent = view.key;
            li.innerHTML = `${DiagramIcon.get(view.type) ?? ""}`;
            li.appendChild(a);
            ul.appendChild(li);
        }

        this.#el.appendChild(ul);

        const startingViewKey =
            this.#getViewFromUrl() ?? this.#navElements?.[0]?.key;

        if (startingViewKey) {
            this.#diagram.changeView(startingViewKey);
            this.#el
                ?.querySelector<HTMLDataListElement>(
                    `ul > li[data-viewkey="${startingViewKey}"]`,
                )
                ?.classList.add(styles.active);
        }
        this.#addEvents();
    }
}
