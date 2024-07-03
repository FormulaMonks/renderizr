import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import type { Decision } from "../types/structurizr-documentation";
import Page from "./_page";
import styles from "./adrs.module.css";
import history from "history/browser";

enum StatusColors {
    proposed = "proposed",
    accepted = "accepted",
    rejected = "rejected",
    deprecated = "deprecated",
    superseded = "superseded",
}

export default class Decisions extends Page {
    #decisions: Decision[] = [];
    #currentDecision: Decision | null = null;

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

    #formatContent(content: string): string {
        return content
            .replace(/#(.*)/, "")
            .replace(/Date:.*/, "")
            .replace(/## Status([\s\S]*)## Context/gim, (__, hit) => {
                const statusLines = hit
                    // biome-ignore lint/suspicious/noMisleadingCharacterClass: valid regex
                    .replace(/[\u200B-\u200D\uFEFF]/g, "")
                    .split("\n")
                    .filter(Boolean);

                return `## Status\n\n${statusLines.map((line: string) => `- ${line}`).join("\n")}\n---\n## Context`;
            });
    }

    #renderTitle() {
        if (!this.container) return;
        const decisionTitle = document.getElementById("decision-title");
        if (!decisionTitle) return;

        const statusColor =
            StatusColors[
                this.#currentDecision?.status.toLowerCase() as keyof typeof StatusColors
            ];

        decisionTitle.innerHTML = `
            <h2>${this.#decisionTitle(this.#currentDecision!)}</h2>
            <p class="${styles.date}">Date: ${this.#currentDecision?.date ? new Date(this.#currentDecision?.date).toLocaleDateString() : ""}</p>
            <p><span class="${styles.status} ${styles[statusColor] || ""}">${this.#currentDecision?.status}</span></p>
        `;
    }

    #decisionTitle = (item: Decision) => `#${item.id} - ${item.title}`;

    render() {
        if (!this.container) return;
        this.container.classList.add(styles.decisions);

        this.container!.innerHTML = `
            <div class="${styles.adrs}">
                <section id="adrs-menu" class="${styles.menu}"></section>
                <section id="decision" class="${styles.decision}">
                    <div id="decision-title"></div>
                    <div id="decision-content"></div>
                </section>
            </div>
        `;

        const menu = this.addComponent(
            new Menu<Decision>(
                document.getElementById("adrs-menu")!,
                this.#decisions,
            ),
        );

        menu.setTextContentFn(this.#decisionTitle);

        this.#currentDecision = this.#getAdrFromUrl() || this.#decisions[0];
        const decisionViewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("decision-content")!),
        );

        menu.onSelectionChange((item) => {
            this.#currentDecision = item;
            decisionViewer.setContentFormatter(this.#formatContent);
            decisionViewer.setContent(item.content);
            this.#renderTitle();
            this.#setAdrInUrl(item);
            this.container?.scrollTo(0, 0);
        });

        this.renderAllComponents();

        // Wait until menu is rendered
        window.setTimeout(() => {
            menu.setActive(this.#currentDecision!);
            this.#renderTitle();
            // TODO: set link events
        }, 100);
    }

    clear(): void {
        this.removeAllComponents();
        this.container!.classList.remove(styles.decisions);
        this.container!.innerHTML = "";
    }
}
