import type { Decision } from "../types/structurizr-documentation";
import Page from "./_page";
import styles from "./adrs.module.css";

export default class Decisions extends Page {
    #decisions: Decision[] = [];
    #resizeObserver: ResizeObserver | null = null;
    #currentOrientation: string | null = null;

    constructor(
        container: HTMLElement | null = null,
        name = "Decisions",
        decisions: Decision[] = [],
    ) {
        super(container, name);
        this.#decisions = decisions.toSorted((a, b) =>
            new Date(a.date) < new Date(b.date) ? -1 : 1,
        );
    }

    #clearMenu(menu: HTMLDivElement) {
        if (menu.childNodes.length) {
            for (const child of Array.from(menu.childNodes)) {
                menu.removeChild(child);
            }
        }
    }

    #renderLandscapeMenu() {
        this.#currentOrientation = "landscape";
        const menu = this.container!.querySelector(
            "#adrs-menu",
        ) as HTMLDivElement;

        this.#clearMenu(menu);

        const list = document.createElement("ul");

        for (const decision of this.#decisions) {
            const item = document.createElement("li");
            const link = document.createElement("a");

            link.href = `#${decision.id}`;
            link.textContent = decision.title;
            item.appendChild(link);
            list.appendChild(item);
        }

        menu.appendChild(list);
    }

    #renderPortraitMenu() {
        this.#currentOrientation = "portrait";
        const menu = this.container!.querySelector(
            "#adrs-menu",
        ) as HTMLDivElement;

        this.#clearMenu(menu);

        const list = document.createElement("select");

        for (const decision of this.#decisions) {
            const item = document.createElement("option");

            item.value = `${decision.id}`;
            item.textContent = `${decision.id} - ${decision.title}`;
            list.appendChild(item);
        }

        menu.appendChild(list);
    }

    render() {
        if (!this.container) return;

        this.container!.innerHTML = `
            <h2>Decisions</h2>
            <section id="adrs-menu" class="${styles.adrsMenu}"></section>
            <section id="decision" class="${styles.decision}"></section>
        `;

        this.#resizeObserver = new ResizeObserver(() => {
            if (!this.container) return;

            const orientationLandscape = window?.matchMedia(
                "(orientation: landscape)",
            );
            if (orientationLandscape.matches) {
                if (this.#currentOrientation !== "landscape") {
                    this.#renderLandscapeMenu();
                }
            } else {
                if (this.#currentOrientation !== "portrait") {
                    this.#renderPortraitMenu();
                }
            }
        });

        this.#resizeObserver.observe(this.container!);
    }

    clear(): void {
        this.container!.innerHTML = "";
    }
}
