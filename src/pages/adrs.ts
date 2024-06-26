import Menu from "../components/menu";
import type { Decision } from "../types/structurizr-documentation";
import Page from "./_page";
import styles from "./adrs.module.css";

export default class Decisions extends Page {
    #decisions: Decision[] = [];

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

    render() {
        if (!this.container) return;

        this.container!.innerHTML = `
            <h2>Decisions</h2>
            <section id="adrs-menu"></section>
            <section id="decision" class="${styles.decision}"></section>
        `;

        const menu = this.addComponent(
            new Menu<Decision>(
                document.getElementById("adrs-menu")!,
                this.#decisions,
            ),
        );

        menu.onSelectionChange(() => {
            // TODO: Connect rendered decision
        });

        this.renderAllComponents();
    }

    clear(): void {
        this.removeAllComponents();
        this.container!.innerHTML = "";
    }
}
