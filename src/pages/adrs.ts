import DecisionGraph, {
    type DecisionGraphState,
} from "../components/decision-graph";
import type { LinkResolver } from "../components/doc-links";
import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import { layoutDecisionGraph } from "../model/decision-graph";
import {
    DECISION_STATUS,
    decisionNumber,
    decisionOrder,
    decisionStatus,
} from "../model/decisions";
import { readSetting, writeSetting } from "../storage";
import type { Decision } from "../types/structurizr-documentation";
import Page from "./_page";
import styles from "./adrs.module.css";
import collapseIcon from "bootstrap-icons/icons/arrows-collapse-vertical.svg?raw";
import expandIcon from "bootstrap-icons/icons/arrows-expand-vertical.svg?raw";
import history from "history/hash";

/** Where the page remembers whether the decision graph was left expanded. */
export const DECISION_GRAPH_STORAGE_KEY = "renderizr:decision-graph";

/**
 * The decision graph's state as the reader left it. Anything else, storage
 * that is unavailable included, falls back to collapsed, the narrow menu.
 */
const storedGraphState = (): DecisionGraphState =>
    readSetting(DECISION_GRAPH_STORAGE_KEY) === "expanded"
        ? "expanded"
        : "collapsed";

/** Decisions that still govern anything — amended ones still mostly do. */
const IN_FORCE = new Set(["accepted", "amended"]);

/**
 * A line that says nothing but the status. The pill above the body already says
 * it, so it is dropped from the note — for every spelling, which is why the
 * list comes from the table above rather than a second one that can drift from
 * it. ("Amended" was missing from that second list, and turned up in front of
 * the amendment note as "Amended Amends 15. …".)
 */
const BARE_STATUS = new RegExp(
    `^(${Object.keys(DECISION_STATUS).join("|")})\\.?$`,
    "i",
);

const numberSpan = (id: string) =>
    `<span class="${styles.number}">${decisionNumber(id)}</span>`;

const longDate = (value?: string) =>
    value
        ? new Date(value).toLocaleDateString(undefined, { dateStyle: "long" })
        : "";

const statusClass = (status = "") => styles[decisionStatus(status)];

const statusPill = (status: string) =>
    `<span class="${styles.status} ${statusClass(status)}">${status || "Unknown"}</span>`;

export default class Decisions extends Page {
    #decisions: Decision[] = [];
    #currentDecision: Decision | null = null;
    // Held directly rather than looked up by class name: the minifier renames
    // classes, so `components.get("Menu")` is undefined in a built file — which
    // is why every link out of the summary used to do nothing.
    #menu: Menu<Decision> | null = null;
    #graph: DecisionGraph | null = null;
    #resolveLink: LinkResolver | null;

    constructor(
        container: HTMLElement | null = null,
        name = "Decisions",
        decisions: Decision[] = [],
        resolveLink: LinkResolver | null = null,
    ) {
        super(container, name);
        this.#resolveLink = resolveLink;
        this.#decisions = decisionOrder(decisions);
    }

    #opened = false;

    #setAdrInUrl(adr: Decision) {
        const search = new URLSearchParams(history.location.search);
        if (search.get("adr") === adr.id) return;
        search.set("adr", adr.id);

        // The decision the page opens on is where the reader already is.
        const next = { search: search.toString() };
        if (this.#opened) history.push(next);
        else history.replace(next);
        this.#opened = true;
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
                            (line: string) => line && !BARE_STATUS.test(line),
                        );

                    // "Amends 15." and "Amended by 39." are separate facts and
                    // each gets its own line. Markdown folds consecutive quoted
                    // lines into one paragraph, so each needs a hard break — a
                    // trailing backslash — to stay where it was put.
                    return notes.length
                        ? `${notes.map((line: string) => `> ${line}`).join("\\\n")}\n\n## Context`
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
     * "3. Another Realization of Feature 1" inside decision 2's body is the one
     * place the supersedes relationship is visible; it has to actually go
     * there. Delegated, because the anchor's text may be the click target.
     */
    #handleDecisionLink = (event: Event) => {
        // Already handled: the markdown renderer scrolled to a heading.
        if (event.defaultPrevented) return;

        const anchor = (event.target as HTMLElement).closest("a");
        const href = anchor?.getAttribute("href");
        // Exactly `#3`, which is how Structurizr rewrites a link between
        // decisions. A heading anchor that merely starts with a number —
        // `## 1. Option A` is `#1-option-a` — used to open decision 1.
        const id = href?.match(/^#(\d+)$/)?.[1];
        if (!id) return;

        const decision = this.#decisions.find((d) => d.id === id);
        if (!decision) return;

        event.preventDefault();
        event.stopPropagation();
        this.#select(decision);
    };

    #decisionTitle = (item: Decision) => `${numberSpan(item.id)} ${item.title}`;

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

        const inForce = this.#decisions.filter((d) =>
            IN_FORCE.has((d.status ?? "").trim().toLowerCase()),
        ).length;

        return `
            <div class="${styles.summary}">
                <h2>Decisions</h2>
                <p class="${styles.summaryIntro}">${this.#decisions.length} recorded, ${inForce} currently in force.</p>
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
        if (decision) {
            this.#menu?.setActive(decision);
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
        this.#graph?.setOpen(null);

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
                    <div id="adrs-controls" class="${styles.controls}">
                        <button type="button" id="adrs-summary" class="${styles.summaryLink}">All decisions</button>
                        <button type="button" id="adrs-expand" class="${styles.expand}" aria-controls="adrs-graph"></button>
                    </div>
                    <div id="adrs-scroll" class="${styles.scroll}">
                        <div class="${styles.rows}">
                            <div id="adrs-graph"></div>
                        </div>
                    </div>
                </section>
                <section id="decision" class="${styles.decision}">
                    <div id="decision-title"></div>
                    <div id="decision-content"></div>
                </section>
            </div>
        `;

        // The menu's entries sit beside the decision graph, inside the
        // menu's own scroll area, so the dots scroll with their titles.
        const menuContainer = document.createElement("div");
        menuContainer.className = styles.entries;
        document
            .querySelector(`#adrs-menu .${styles.rows}`)!
            .appendChild(menuContainer);

        const menu = this.addComponent(
            new Menu<Decision>(menuContainer, this.#decisions),
        );
        this.#menu = menu;

        menu.setNumberFn((item) => decisionNumber(item.id));

        const graph = this.addComponent(
            new DecisionGraph(
                document.getElementById("adrs-graph")!,
                menuContainer,
            ),
        );
        this.#graph = graph;
        graph.setLayout(layoutDecisionGraph(this.#decisions));
        graph.setState(storedGraphState());
        this.#renderExpandToggle();
        // A rebuilt menu has new entries, and a switch to the `<select>` has
        // none to sit beside.
        menu.onRedraw(() => graph.draw());

        this.#currentDecision = this.#getAdrFromUrl() ?? null;
        const decisionViewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("decision-content")!),
        );
        decisionViewer.setLinkResolver(this.#resolveLink);

        menu.onSelectionChange((item) => {
            this.#currentDecision = item;
            decisionViewer.setContentFormatter(this.#formatContent);
            decisionViewer.setContent(item.content);
            this.#renderTitle();
            graph.setOpen(item.id);
            this.#setAdrInUrl(item);
            window.scrollTo({ top: 0 });
        });

        this.container.addEventListener("click", this.#handleDecisionLink);
        document
            .getElementById("adrs-summary")
            ?.addEventListener("click", this.#handleSummaryClick);
        document
            .getElementById("adrs-expand")
            ?.addEventListener("click", this.#handleExpandClick);

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

    #handleExpandClick = () => {
        if (!this.#graph) return;
        const state =
            this.#graph.state === "expanded" ? "collapsed" : "expanded";
        this.#graph.setState(state);
        writeSetting(DECISION_GRAPH_STORAGE_KEY, state);
        this.#renderExpandToggle();
    };

    /** The expand toggle says what pressing it does next. */
    #renderExpandToggle() {
        const toggle = document.getElementById("adrs-expand");
        if (!toggle || !this.#graph) return;

        const expanded = this.#graph.state === "expanded";
        const label = expanded
            ? "Collapse the decision graph"
            : "Expand the decision graph";
        toggle.innerHTML = expanded ? collapseIcon : expandIcon;
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute("aria-label", label);
        toggle.title = label;
    }

    clear(): void {
        this.removeAllComponents();
        this.#menu = null;
        this.#graph = null;
        this.container?.removeEventListener("click", this.#handleDecisionLink);
        document
            .getElementById("adrs-summary")
            ?.removeEventListener("click", this.#handleSummaryClick);
        document
            .getElementById("adrs-expand")
            ?.removeEventListener("click", this.#handleExpandClick);
        this.container!.innerHTML = "";
    }
}
