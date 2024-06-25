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
                history.push(link.getAttribute("href")!);
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
            this.#workspace.hasDocumentation() &&
            this.#workspace.hasDecisions();

        this.element.innerHTML = `
            <section class="workspace-description">
                <p>${this.#workspace.description}</p>
                <p>${this.#workspace.version ? `Version: ${this.#workspace.version} - ` : ""}Last modified: <strong>${new Date(this.#workspace.lastModifiedDate).toLocaleDateString()}</strong></p>
            </section>
            <ul>
                ${!diagramsAndDocs ? "" : '<li><a href="/diagrams">Diagrams</a></li>'}
                ${this.#workspace.hasDocumentation() ? `<li><a href="/docs">Documentation</a></li>` : ""}
                ${this.#workspace.hasDecisions() ? `<li><a href="/adrs">Decisions</a></li>` : ""}
            </ul>`;

        history.listen((update) => {
            for (const link of this.#links()) {
                link.classList.remove(styles.navigationActive);
                if (link.getAttribute("href") === update.location.pathname) {
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
