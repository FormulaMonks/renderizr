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
    #diagram: Diagram;
    #navElements: View[] = [];
    #eventListeners: Map<
        string,
        (this: HTMLDataListElement, ev: MouseEvent) => unknown
    > = new Map();

    #resizeObserver: ResizeObserver | null = null;

    constructor(element: HTMLElement, diagram: Diagram, navElements: View[]) {
        super(element);
        this.#diagram = diagram;
        this.#navElements = navElements;
    }

    #addEvents() {
        for (const viewLink of Array.from(
            this.element?.querySelectorAll<HTMLDataListElement>("ul > li") ??
                [],
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
            this.element?.querySelectorAll<HTMLDataListElement>("ul > li") ??
                [],
        )) {
            if (!viewLink.dataset.viewkey) continue;
            const callback = this.#eventListeners.get(viewLink.dataset.viewkey);

            if (!callback) continue;

            viewLink.removeEventListener("click", callback);
        }
    }

    #setViewInUrl(viewKey: string) {
        const search = new URLSearchParams(history.location.search);
        search.set("view", viewKey);
        history.push({ search: search.toString() });
    }

    #getViewFromUrl() {
        const search = new URLSearchParams(history.location.search);
        const view = search.get("view");

        if (this.#navElements.find((el) => el.key === view)) {
            return view;
        }
    }

    changeView(viewKey?: string) {
        if (!viewKey) return;

        for (const el of Array.from(
            this.element?.querySelectorAll<HTMLDataListElement>("ul > li") ??
                [],
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

    render() {
        if (!this.element) return;
        this.clear();
        this.element.classList.add(styles.diagramNavigation);

        this.#resizeObserver = new ResizeObserver(() => {
            if (!this.element) return;
            if (this.element.clientWidth >= this.element.scrollWidth) {
                this.element.classList.add(styles.centered);
            } else {
                this.element.classList.remove(styles.centered);
            }
        });
        this.#resizeObserver.observe(this.element);
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

        this.element.appendChild(ul);

        const startingViewKey =
            this.#getViewFromUrl() ?? this.#navElements?.[0]?.key;

        if (startingViewKey) {
            this.#diagram.changeView(startingViewKey);
            this.element
                ?.querySelector<HTMLDataListElement>(
                    `ul > li[data-viewkey="${startingViewKey}"]`,
                )
                ?.classList.add(styles.active);
        }
        this.#addEvents();
    }

    clear() {
        this.#removeEvents();
        if (this.#resizeObserver) {
            this.#resizeObserver.disconnect();
        }
        const ul = this.element?.querySelector("ul");
        if (ul) {
            this.element?.removeChild(ul);
        }
    }
}
