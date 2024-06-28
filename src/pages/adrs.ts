import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import type { Decision } from "../types/structurizr-documentation";
import Page from "./_page";
import styles from "./adrs.module.css";
import history from "history/browser";

export default class Decisions extends Page {
    #decisions: Decision[] = [];

    constructor(
        container: HTMLElement | null = null,
        name = "Decisions",
        decisions: Decision[] = [],
    ) {
        super(container, name);
        this.#decisions = decisions.toSorted((a, b) =>
            new Date(a.date) > new Date(b.date) ? -1 : 1,
        );
    }

    #setAdrInUrl(adr: Decision) {
        const search = new URLSearchParams(history?.location.search);
        search.set("adr", adr.id);
        history.push({ search: search.toString() });
    }

    #getAdrFromUrl() {
        const search = new URLSearchParams(window.location.search);
        const adrId = search.get("adr");
        return this.#decisions.find((d) => d.id === adrId);
    }

    render() {
        if (!this.container) return;
        this.container.classList.add(styles.decisions);

        this.container!.innerHTML = `
            <div class="${styles.adrs}">
                <section id="adrs-menu" class="${styles.menu}"></section>
                <section id="decision" class="${styles.decision}"></section>
            </div>
        `;

        const menu = this.addComponent(
            new Menu<Decision>(
                document.getElementById("adrs-menu")!,
                this.#decisions,
            ),
        );

        const startingDecision = this.#getAdrFromUrl() || this.#decisions[0];
        const decisionViewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("decision")!),
        );

        menu.onSelectionChange((item) => {
            decisionViewer.setContent(item.content);
            this.#setAdrInUrl(item);
        });

        this.renderAllComponents();
        // Next tick
        window.setTimeout(() => menu.setActive(startingDecision), 0);
    }

    clear(): void {
        this.removeAllComponents();
        this.container!.innerHTML = "";
    }
}
