import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import type { Decision } from "../types/structurizr-documentation";
import Page from "./_page";
import styles from "./adrs.module.css";
import history from "history/hash";

const STATUS_CLASS: Record<string, string> = {
    proposed: "proposed",
    accepted: "accepted",
    rejected: "rejected",
    deprecated: "deprecated",
    superseded: "superseded",
};

const longDate = (value?: string) =>
    value
        ? new Date(value).toLocaleDateString(undefined, { dateStyle: "long" })
        : "";

const statusPill = (status: string) =>
    `<span class="${styles.status} ${styles[STATUS_CLASS[status?.toLowerCase()] ?? ""] ?? ""}">${status}</span>`;

export default class Decisions extends Page {
    #decisions: Decision[] = [];
    #currentDecision: Decision | null = null;

    constructor(
        container: HTMLElement | null = null,
        name = "Decisions",
        decisions: Decision[] = [],
    ) {
        super(container, name);
        // Newest first, and within the same date the higher number is the
        // later decision.
        this.#decisions = decisions.toSorted((a, b) => {
            const byDate =
                new Date(b.date).getTime() - new Date(a.date).getTime();
            return byDate || Number(b.id) - Number(a.id);
        });
    }

    #setAdrInUrl(adr: Decision) {
        const search = new URLSearchParams(history?.location.search);
        search.set("adr", adr.id);
        history.push({
            search: search.toString(),
        });
    }

    #getAdrFromUrl() {
        const search = new URLSearchParams(history.location.search);
        const adrId = search.get("adr");
        return this.#decisions.find((d) => d.id === adrId);
    }

    #formatContent(content: string): string {
        return (
            content
                .replace(/#(.*)/, "")
                .replace(/Date:.*/, "")
                // The status already appears as a pill above the body; keep only
                // any supersession note that came with it.
                .replace(/## Status([\s\S]*?)## Context/gim, (__, hit) => {
                    const notes = hit
                        // biome-ignore lint/suspicious/noMisleadingCharacterClass: valid regex
                        .replace(/[\u200B-\u200D\uFEFF]/g, "")
                        .split("\n")
                        .map((line: string) => line.trim())
                        .filter(
                            (line: string) =>
                                line &&
                                !/^(proposed|accepted|rejected|deprecated|superseded)\.?$/i.test(
                                    line,
                                ),
                        );

                    return notes.length
                        ? `${notes.map((line: string) => `> ${line}`).join("\n")}\n\n## Context`
                        : "## Context";
                })
        );
    }

    #renderTitle() {
        if (!this.container) return;
        const decisionTitle = document.getElementById("decision-title");
        if (!decisionTitle) return;

        decisionTitle.innerHTML = `
            <h2>${this.#decisionTitle(this.#currentDecision!)}</h2>
            <p class="${styles.date}">${longDate(this.#currentDecision?.date)}</p>
            <p>${statusPill(this.#currentDecision?.status ?? "")}</p>
        `;
    }

    /**
     * "3. Another Realisation of Feature 1" inside decision 2's body is the one
     * place the supersedes relationship is visible; it has to actually go
     * there. Delegated, because the anchor's text may be the click target.
     */
    #handleDecisionLink = (event: Event) => {
        const anchor = (event.target as HTMLElement).closest("a");
        const href = anchor?.getAttribute("href");
        if (!href?.startsWith("#")) return;

        const decision = this.#decisions.find(
            (d) => d.id === href.slice(1).split(/[^\d]/)[0],
        );
        if (!decision) return;

        event.preventDefault();
        event.stopPropagation();
        this.#select(decision);
    };

    #decisionTitle = (item: Decision) => `#${item.id} - ${item.title}`;

    /**
     * The question a reader arrives with is "which of these still stand?", and
     * no single decision answers it. So the landing page is the whole set:
     * number, title, date and status, grouped by year, in one screen.
     */
    #renderSummary() {
        const byYear = new Map<string, Decision[]>();
        for (const decision of this.#decisions) {
            const year = decision.date
                ? String(new Date(decision.date).getFullYear())
                : "Undated";
            byYear.set(year, [...(byYear.get(year) ?? []), decision]);
        }

        const decided = this.#decisions.filter(
            (d) => d.status?.toLowerCase() === "accepted",
        ).length;

        return `
            <div class="${styles.summary}">
                <h2>Decisions</h2>
                <p class="${styles.summaryIntro}">${this.#decisions.length} recorded, ${decided} currently in force.</p>
                ${[...byYear]
                    .map(
                        ([year, decisions]) => `
                    <h3 class="${styles.year}">${year}</h3>
                    <ul class="${styles.summaryList}">
                        ${decisions
                            .map(
                                (d) => `
                            <li class="${styles.summaryRow}">
                                <a href="#${d.id}">${this.#decisionTitle(d)}</a>
                                <span class="${styles.date}">${longDate(d.date)}</span>
                                ${statusPill(d.status ?? "")}
                            </li>`,
                            )
                            .join("")}
                    </ul>`,
                    )
                    .join("")}
            </div>
        `;
    }

    #select(decision: Decision | null) {
        const menu = this.components.get("Menu") as Menu<Decision> | undefined;
        if (decision) {
            menu?.setActive(decision);
        } else {
            this.#currentDecision = null;
            this.#showSummary();
        }
    }

    #showSummary() {
        const title = document.getElementById("decision-title");
        const content = document.getElementById("decision-content");
        if (title) title.innerHTML = "";
        if (content) content.innerHTML = this.#renderSummary();

        const search = new URLSearchParams(history.location.search);
        if (search.has("adr")) {
            search.delete("adr");
            history.push({ search: search.toString() });
        }
        window.scrollTo({ top: 0 });
    }

    render() {
        if (!this.container) return;

        this.container!.innerHTML = `
            <div class="${styles.adrs}">
                <section id="adrs-menu" class="${styles.menu}">
                    <button type="button" id="adrs-summary" class="${styles.summaryLink}">All decisions</button>
                </section>
                <section id="decision" class="${styles.decision}">
                    <div id="decision-title"></div>
                    <div id="decision-content"></div>
                </section>
            </div>
        `;

        const menuContainer = document.createElement("div");
        document.getElementById("adrs-menu")!.appendChild(menuContainer);

        const menu = this.addComponent(
            new Menu<Decision>(menuContainer, this.#decisions),
        );

        menu.setTextContentFn(this.#decisionTitle);

        this.#currentDecision = this.#getAdrFromUrl() ?? null;
        const decisionViewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("decision-content")!),
        );

        menu.onSelectionChange((item) => {
            this.#currentDecision = item;
            decisionViewer.setContentFormatter(this.#formatContent);
            decisionViewer.setContent(item.content);
            this.#renderTitle();
            this.#setAdrInUrl(item);
            window.scrollTo({ top: 0 });
        });

        this.container.addEventListener("click", this.#handleDecisionLink);
        document
            .getElementById("adrs-summary")
            ?.addEventListener("click", this.#handleSummaryClick);

        this.renderAllComponents();

        // Wait until menu is rendered
        window.setTimeout(() => {
            if (this.#currentDecision) {
                menu.setActive(this.#currentDecision);
                this.#renderTitle();
            } else {
                this.#showSummary();
            }
        }, 100);
    }

    #handleSummaryClick = () => this.#select(null);

    clear(): void {
        this.removeAllComponents();
        this.container?.removeEventListener("click", this.#handleDecisionLink);
        document
            .getElementById("adrs-summary")
            ?.removeEventListener("click", this.#handleSummaryClick);
        this.container!.innerHTML = "";
    }
}
