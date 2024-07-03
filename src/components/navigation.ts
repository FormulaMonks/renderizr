import type { Workspace } from "../types/structurizr-workspace";
import history from "history/browser";
import Component from "./_component";
import styles from "./navigation.module.css";

export default class Navigation extends Component {
    #workspace: Workspace;

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
                history.push({ search: `page=${link.getAttribute("href")!}` });
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

    render() {
        if (!(this.#workspace && this.element)) return;

        this.element.classList.add(styles.navigation);

        const diagramsAndDocs =
            this.#workspace.documentation.sections?.length &&
            this.#workspace.documentation.decisions?.length;

        this.element.innerHTML = `
            <section>
                <p>${this.#workspace.description}</p>
                <p>${this.#workspace.version ? `Version: ${this.#workspace.version} - ` : ""}Last modified: <strong>${new Date(this.#workspace.lastModifiedDate).toLocaleDateString()}</strong></p>
            </section>
            <ul>
                ${!diagramsAndDocs ? "" : '<li><a href="diagrams">Diagrams</a></li>'}
                ${this.#workspace.documentation.sections?.length ? `<li><a href="docs">Documentation</a></li>` : ""}
                ${this.#workspace.documentation.decisions?.length ? `<li><a href="adrs">Decisions</a></li>` : ""}
            </ul>`;

        history.listen((update) => {
            for (const link of this.#links()) {
                link.classList.remove(styles.navigationActive);
                const search = new URLSearchParams(update.location.search);
                if (link.getAttribute("href") === search.get("page")) {
                    link.classList.add(styles.navigationActive);
                }
            }
        });

        this.#addEvents();
    }

    clear() {
        this.element?.classList.remove(styles.navigation);
        this.#removeEvents();

        const children = this.element?.querySelectorAll("*");
        if (children) {
            for (const child of Array.from(children)) {
                child.remove();
            }
        }
    }
}
