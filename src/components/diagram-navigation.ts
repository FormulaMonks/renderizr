import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import systemLandscapeIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/globe2.svg?raw";
import systemContextIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/layout-wtf.svg?raw";
import dynamicIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/collection-play-fill.svg?raw";
import containerIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/boxes.svg?raw";
import componentIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/box-seam.svg?raw";
import deploymentIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/rocket-takeoff.svg?raw";
import styles from "./diagram-navigation.module.css";

const DiagramIcon = new Map([
    ["SystemLandscape", systemLandscapeIcon],
    ["SystemContext", systemContextIcon],
    ["Container", containerIcon],
    ["Component", componentIcon],
    ["Dynamic", dynamicIcon],
    ["Deployment", deploymentIcon],
]);

export default class DiagramNavigation {
    #el: HTMLElement | null = null;
    #diagram: Diagram;
    #navElements: View[] = [];
    #eventListeners: Map<
        string,
        (this: HTMLDataListElement, ev: MouseEvent) => unknown
    > = new Map();

    constructor(el: HTMLElement, diagram: Diagram, navElements: View[]) {
        this.#el = el;
        this.#diagram = diagram;
        this.#navElements = navElements;
        this.render();
    }

    #addEvents() {
        for (const viewLink of Array.from(
            this.#el?.querySelectorAll<HTMLDataListElement>("ul > li") ?? [],
        )) {
            if (!viewLink.dataset.viewkey) continue;
            const callback = (event: Event) => {
                event.preventDefault();

                for (const el of Array.from(
                    this.#el?.querySelectorAll<HTMLDataListElement>(
                        "ul > li",
                    ) ?? [],
                )) {
                    el.classList.remove(styles.active);
                }

                const target = event.target as HTMLElement;
                target.classList.add(styles.active);
                const viewKey = target.dataset.viewkey;
                if (viewKey) {
                    this.#diagram.changeView(viewKey);
                }
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

        const startingViewKey = this.#navElements?.[0]?.key;
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
