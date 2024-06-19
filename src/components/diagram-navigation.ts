import type { Diagram } from "../types/structurizr-diagram";
import type { View } from "../types/structurizr-workspace";
import diagramIcon from "../../submodules/structurizr-ui/src/bootstrap-icons/diagram-2.svg?raw";
import styles from "./diagram-navigation.module.css";

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
                const viewKey = (event.target as HTMLElement).dataset.viewkey;
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
        const ul = document.createElement("ul");

        for (const view of this.#navElements) {
            const li = document.createElement("li");
            const a = document.createElement("a");
            li.dataset.viewkey = view.key;
            a.href = "#";
            a.textContent = view.key;
            li.innerHTML = `${diagramIcon}`;
            li.appendChild(a);
            ul.appendChild(li);
        }

        this.#el.appendChild(ul);
        this.#addEvents();
    }
}
