import history from "history/hash";
import DecisionGraph, {
    type DecisionGraphState,
} from "../components/decision-graph";
import type { ImageResolver } from "../components/doc-images";
import type { LinkResolver } from "../components/doc-links";
import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import { layoutDecisionGraph, relatedDecisions } from "../model/decision-graph";
import {
    DECISION_STATUS,
    decisionAddress,
    decisionNumber,
    decisionStatus,
    FILTER_PARAM,
    filterByScope,
    mixesScopes,
    type ScopedDecision,
    scopeFilterOf,
    scopeFilterOptions,
    scopeHue,
    scopeLabel,
    scopedDecisions,
} from "../model/decisions";
import type { DocumentationScope } from "../model/documentation";
import { readSetting, writeSetting } from "../storage";
import { inOtherWorkspace, workspaceOf } from "../workspace-trail";
import Page from "./_page";
import styles from "./adrs.module.css";
import collapseIcon from "bootstrap-icons/icons/arrows-collapse-vertical.svg?raw";
import expandIcon from "bootstrap-icons/icons/arrows-expand-vertical.svg?raw";
import { showDisclaimer } from "../components/disclaimer";

/**
 * The most columns the expanded decision graph takes beside the menu, from
 * the decision body. Past it, the graph falls back (spec #143).
 */
export const MENU_GRAPH_CAP = 30;

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

/** How far apart the index's columns sit: wider than the menu's. */
const INDEX_COLUMN_WIDTH = 16;

/**
 * How many columns the index's decision graph may take: half the index's
 * width, so the titles keep the other half. Never less than the column the
 * lone dots sit in.
 */
export const indexColumnCap = (width: number) =>
    Math.max(1, Math.floor(width / 2 / INDEX_COLUMN_WIDTH));

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

const numberSpan = (decision: ScopedDecision) =>
    `<span class="${styles.number}">${decisionNumber(decision.number)}</span>`;

/**
 * The query string of `search`. A slug path reads as written in the address
 * bar, `adr=payments/3` rather than `adr=payments%2F3`.
 */
const queryOf = (search: URLSearchParams) =>
    search.toString().replaceAll("%2F", "/");

/** Each documentation scope's own resolver for a decision's links or images. */
export type ScopedResolver<Resolver> = (scope: DocumentationScope) => Resolver;

const longDate = (value?: string) =>
    value
        ? new Date(value).toLocaleDateString(undefined, { dateStyle: "long" })
        : "";

const statusClass = (status = "") => styles[decisionStatus(status)];

/**
 * The ‹ › buttons that scroll a decision graph's lanes. A reader may not know
 * a swipe scrolls them too, so the tooltips say so.
 */
const laneButtons = (graph: string) =>
    (["left", "right"] as const)
        .map(
            (side) =>
                `<button type="button" class="${styles.scrollLanes}" data-scroll-lanes="${side}" aria-controls="${graph}" aria-label="Scroll the lanes ${side}" title="Scroll the lanes ${side}. A trackpad swipe, or Shift with the mouse wheel, scrolls them too.">${side === "left" ? "‹" : "›"}</button>`,
        )
        .join("");

/** A listener the page attached, kept so `clear()` can take it off again. */
type BoundListener = {
    target: EventTarget;
    type: string;
    handler: EventListener;
};

const statusPill = (status: string) =>
    `<span class="${styles.status} ${statusClass(status)}">${status || "Unknown"}</span>`;

export default class Decisions extends Page {
    /** Every documentation scope's decisions, in decision order. */
    #all: ScopedDecision[] = [];
    /** The documentation scopes that carry decisions, in model order. */
    #scopes: DocumentationScope[] = [];
    /** The decisions the filter keeps: the index's, the menu's, the graph's. */
    #decisions: ScopedDecision[] = [];
    /** The filter the page is drawn under; `null` for every scope. */
    #filter: string | null = null;
    /** Whether the decisions on screen mix scopes, which shows the pills. */
    #mixed = false;
    #currentDecision: ScopedDecision | null = null;
    // Held directly rather than looked up by class name: the minifier renames
    // classes, so `components.get("Menu")` is undefined in a built file — which
    // is why every link out of the decisions summary once did nothing.
    #menu: Menu<ScopedDecision> | null = null;
    #graph: DecisionGraph | null = null;
    #indexGraph: DecisionGraph | null = null;
    #resolveLink: ScopedResolver<LinkResolver> | null;
    #resolveImage: ScopedResolver<ImageResolver> | null;
    /** Whether the menu keeps only the decisions related to the open one. */
    #relatedOnly = false;
    /** The cap the index's decision graph last laid out under. */
    #indexCap: number | null = null;
    #listeners: BoundListener[] = [];
    #unlisten: (() => void) | null = null;
    /** The deferred first paint, which `clear()` calls off. */
    #firstPaint: number | null = null;
    /** Whether the reader just picked a filter, and so keeps the focus. */
    #refocus = false;

    /**
     * `scopes` are the workspace's documentation scopes; the page lists the
     * decisions of every one. A decision's links and images resolve through
     * its own scope's resolvers.
     */
    constructor(
        container: HTMLElement | null = null,
        name = "Decisions",
        scopes: DocumentationScope[] = [],
        resolveLink: ScopedResolver<LinkResolver> | null = null,
        resolveImage: ScopedResolver<ImageResolver> | null = null,
    ) {
        super(container, name);
        this.#resolveLink = resolveLink;
        this.#resolveImage = resolveImage;
        this.#scopes = scopes.filter((scope) => scope.decisions.length);
        this.#all = scopedDecisions(this.#scopes);
        this.#decisions = this.#all;
    }

    #opened = false;

    /**
     * The filter `search` names, when a scope with decisions answers to it;
     * `null`, every scope, otherwise. A page of one scope has no filter.
     */
    #filterIn(search: URLSearchParams): string | null {
        const filter = search.get(FILTER_PARAM);
        if (this.#scopes.length < 2) return null;
        return this.#scopes.some((scope) => scopeFilterOf(scope) === filter)
            ? filter
            : null;
    }

    /** Keep the decisions the address's filter keeps. */
    #applyFilter() {
        this.#filter = this.#filterIn(
            new URLSearchParams(history.location.search),
        );
        this.#decisions = filterByScope(this.#all, this.#filter);
        this.#mixed = mixesScopes(this.#decisions);
    }

    #setAdrInUrl(adr: ScopedDecision) {
        const search = new URLSearchParams(history.location.search);
        if (search.get("adr") === adr.id) return;
        search.set("adr", adr.id);

        // The decision the page opens on is where the reader already is.
        const next = { search: queryOf(search) };
        if (this.#opened) history.push(next);
        else history.replace(next);
        this.#opened = true;
    }

    #getAdrFromUrl() {
        const search = new URLSearchParams(history.location.search);
        const adrId = search.get("adr");
        return this.#decisions.find((d) => d.id === adrId);
    }

    /**
     * The pill naming `decision`'s documentation scope, in a hue of the
     * scope's own, while the decisions on screen mix scopes; `""` otherwise.
     * It carries its own trailing space.
     */
    #pill(decision: ScopedDecision): string {
        const pill = this.#pillElement(decision);
        return pill ? `${pill.outerHTML} ` : "";
    }

    /** The scope pill of `decision` as an element, or `null` without one. */
    #pillElement(decision: ScopedDecision): HTMLElement | null {
        if (!this.#mixed) return null;
        const { scope } = decision;
        const pill = document.createElement("span");
        pill.className = styles.scopePill;
        pill.dataset.scopePill = "";
        pill.style.setProperty(
            "--scope-hue",
            String(scopeHue(this.#scopes, scope)),
        );
        pill.title = `${scope.type}: ${scope.name}`;
        pill.textContent = scopeLabel(scope);
        return pill;
    }

    /**
     * The filter drop-down, above the index or the menu: every scope with
     * decisions, indented by the scope tree. A page of one scope has none.
     */
    #renderFilter(id: string): string {
        if (this.#scopes.length < 2) return "";
        const options = scopeFilterOptions(this.#scopes)
            .map(
                ({ value, label, depth }) =>
                    // Non-breaking spaces: browsers collapse regular ones.
                    `<option value="${value}"${value === (this.#filter ?? "") ? " selected" : ""}>${"   ".repeat(depth)}${label}</option>`,
            )
            .join("");
        return `<div class="${styles.filter}"><select id="${id}" data-scope-filter aria-label="Show the decisions of a documentation scope">${options}</select></div>`;
    }

    /**
     * Picking a scope sets `filter`, or drops it for every scope. An open
     * decision the filter hides gives way to the index.
     */
    #handleFilterChange = (event: Event) => {
        const select = (event.target as HTMLElement | null)?.closest?.(
            "select[data-scope-filter]",
        ) as HTMLSelectElement | null;
        if (!select) return;

        const search = new URLSearchParams(history.location.search);
        if (select.value) search.set(FILTER_PARAM, select.value);
        else search.delete(FILTER_PARAM);
        const open = this.#all.find((d) => d.id === search.get("adr"));
        if (open && select.value && scopeFilterOf(open.scope) !== select.value)
            search.delete("adr");

        this.#refocus = true;
        history.push({ search: queryOf(search) });
    };

    /**
     * Draw the page again under the address's filter. A filter the reader
     * just picked from keeps the focus, on whichever drop-down now shows.
     */
    #redraw() {
        const refocus = this.#refocus;
        this.clear();
        this.render();
        this.#refocus = false;
        if (!refocus) return;
        const filters = Array.from(
            this.container?.querySelectorAll<HTMLSelectElement>(
                "select[data-scope-filter]",
            ) ?? [],
        );
        filters.find((select) => !select.closest("section")?.hidden)?.focus();
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
        if (!id || !this.#currentDecision) return;

        // The link stays inside the open decision's own scope.
        const address = decisionAddress(this.#currentDecision.scope, id);
        const decision = this.#decisions.find((d) => d.id === address);
        if (!decision) return;

        event.preventDefault();
        event.stopPropagation();
        this.#select(decision);
    };

    #decisionTitle = (item: ScopedDecision) =>
        `${numberSpan(item)} ${this.#pill(item)}${item.title}`;

    /**
     * The question a reader arrives with is "which of these still stand?", and
     * no single decision answers it. So the landing page is the whole set, as
     * the menu's rows enlarged: number, status and full title under a heading
     * per year, beside the decision graph with every lane.
     */
    #renderIndex() {
        const byYear = new Map<string, ScopedDecision[]>();
        for (const decision of this.#decisions) {
            const year = decision.date
                ? String(new Date(decision.date).getFullYear())
                : "Undated";
            byYear.set(year, [...(byYear.get(year) ?? []), decision]);
        }

        const inForce = this.#decisions.filter((d) =>
            IN_FORCE.has((d.status ?? "").trim().toLowerCase()),
        ).length;

        // The date is the row's tooltip, so the row stays as compact as the
        // menu's.
        const row = (d: ScopedDecision) => `
            <li>
                <a class="${styles.indexRow}" href="#${d.id}" data-item-id="${d.id}" title="${longDate(d.date)}">${numberSpan(d)}<span class="${styles.indexStatus} ${statusClass(d.status)}">${d.status || "Unknown"}</span><span class="${styles.indexTitle}">${this.#pill(d)}${d.title}</span></a>
            </li>`;

        return `
            <h2>Decisions</h2>
            ${this.#renderFilter("adrs-index-filter")}
            <p class="${styles.indexIntro}">${this.#decisions.length} recorded, ${inForce} in force</p>
            <div id="adrs-index-controls" class="${styles.controls} ${styles.indexControls}" hidden>${laneButtons("adrs-index-graph")}</div>
            <div class="${styles.rows}">
                <div id="adrs-index-graph"></div>
                <div class="${styles.indexEntries}" data-index-rows>
                    ${[...byYear]
                        .map(
                            ([year, decisions]) => `
                        <h3 class="${styles.year}">${year}</h3>
                        <ul class="${styles.indexList}">${decisions.map(row).join("")}</ul>`,
                        )
                        .join("")}
                </div>
            </div>
        `;
    }

    #select(decision: ScopedDecision | null) {
        if (decision) {
            this.#menu?.setActive(decision);
        } else {
            this.#currentDecision = null;
            this.#showIndex();
        }
    }

    /**
     * The index and an open decision take turns: the index hides the menu,
     * and an open decision hides the index.
     */
    #show(section: "index" | "decision") {
        const index = section === "index";
        for (const [id, hidden] of [
            ["adrs-index", !index],
            ["adrs-menu", index],
            ["decision", index],
        ] as const) {
            const section = document.getElementById(id);
            if (section) section.hidden = hidden;
        }
        // A graph that was hidden measured nothing; draw it where it is now.
        if (index) {
            this.#indexGraph?.setHover(null);
            this.#layOutIndex();
        }
        (index ? this.#indexGraph : this.#graph)?.draw();
    }

    /**
     * Lay out the index's decision graph under its cap, half the index's
     * width. The index measures 0 while it waits for a first paint or hides
     * behind a decision opened from the URL, so the window stands in for it
     * until it shows; then it lays out again at its own width. Only the
     * index showing measures it, so scrolling never changes the cap.
     */
    #layOutIndex() {
        const width =
            document.getElementById("adrs-index")?.clientWidth ||
            window.innerWidth;
        const cap = indexColumnCap(width);
        // A new layout sends the lanes back to the titles' edge, so the same
        // cap keeps the one the index has.
        if (cap === this.#indexCap) return;
        this.#indexCap = cap;
        this.#indexGraph?.setLayout(layoutDecisionGraph(this.#decisions, cap));
        this.#renderLaneButtons();
    }

    #showIndex() {
        const title = document.getElementById("decision-title");
        const content = document.getElementById("decision-content");
        if (title) title.innerHTML = "";
        if (content) content.innerHTML = "";
        this.#graph?.setOpen(null);
        this.#setRelatedOnly(false);
        this.#renderRelatedOnly();
        this.#show("index");
        // The index is a place of its own, so a decision opened from it gets
        // its own history entry, and Back returns here.
        this.#opened = true;

        const search = new URLSearchParams(history.location.search);
        if (search.has("adr")) {
            search.delete("adr");
            history.push({ search: queryOf(search) });
        }
        window.scrollTo({ top: 0 });
    }

    render() {
        if (!this.container) return;
        showDisclaimer("adrs");

        this.#applyFilter();
        this.#currentDecision = this.#getAdrFromUrl() ?? null;
        // A decision the filter hides gives way to the index.
        const search = new URLSearchParams(history.location.search);
        if (!this.#currentDecision && search.has("adr")) {
            const hidden = this.#all.some((d) => d.id === search.get("adr"));
            if (hidden && this.#filter !== null) {
                search.delete("adr");
                history.replace({ search: queryOf(search) });
            }
        }
        // The first view shows at once, before the deferred first paint, so
        // a deep link never flashes the index.
        const opening = this.#currentDecision !== null;

        this.container!.innerHTML = `
            <div class="${styles.adrs}">
                <section id="adrs-index" class="${styles.index}"${opening ? " hidden" : ""}>
                    ${this.#renderIndex()}
                </section>
                <section id="adrs-menu" class="${styles.menu}"${opening ? "" : " hidden"}>
                    ${this.#renderFilter("adrs-menu-filter")}
                    <div id="adrs-controls" class="${styles.controls}">
                        <button type="button" id="adrs-summary" class="${styles.summaryLink}">All decisions</button>
                        <button type="button" id="adrs-expand" class="${styles.expand}" aria-controls="adrs-graph"></button>
                        <span id="adrs-lanes" class="${styles.laneButtons}" hidden>${laneButtons("adrs-graph")}</span>
                        <button type="button" id="adrs-related" class="${styles.related}" aria-pressed="false" title="Show only the decisions related to the open one" hidden>Related only</button>
                    </div>
                    <div id="adrs-scroll" class="${styles.scroll}">
                        <div class="${styles.rows}">
                            <div id="adrs-graph"></div>
                        </div>
                    </div>
                </section>
                <section id="decision" class="${styles.decision}"${opening ? "" : " hidden"}>
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

        // The `<select>` keeps a value of its own, whatever `selected` says.
        for (const select of this.container.querySelectorAll<HTMLSelectElement>(
            "select[data-scope-filter]",
        ))
            select.value = this.#filter ?? "";

        const menu = this.addComponent(
            new Menu<ScopedDecision>(menuContainer, this.#decisions),
        );
        this.#menu = menu;

        menu.setNumberFn((item) => decisionNumber(item.number));
        menu.setBadgeFn((item) => this.#pillElement(item));

        const graph = this.addComponent(
            new DecisionGraph(
                document.getElementById("adrs-graph")!,
                menuContainer,
            ),
        );
        this.#graph = graph;
        graph.setLayout(layoutDecisionGraph(this.#decisions, MENU_GRAPH_CAP));
        graph.setState(storedGraphState());
        this.#renderExpandToggle();
        // A rebuilt menu has new entries, and a switch to the `<select>` has
        // none to sit beside.
        menu.onRedraw(() => graph.draw());

        // The index is always expanded, with wider columns and no toggle.
        const indexRows = document.querySelector<HTMLElement>(
            "#adrs-index [data-index-rows]",
        )!;
        // Held apart from the page's components, which are keyed by class
        // name and would lose the menu's decision graph to this one.
        const indexGraph = new DecisionGraph(
            document.getElementById("adrs-index-graph")!,
            indexRows,
            { columnWidth: INDEX_COLUMN_WIDTH },
        );
        this.#indexGraph = indexGraph;
        indexGraph.setState("expanded");
        this.#layOutIndex();
        this.#listen(indexRows, "mouseover", this.#handleIndexPoint);
        this.#listen(indexRows, "focusin", this.#handleIndexPoint);
        this.#listen(indexRows, "mouseleave", this.#handleIndexLeave);
        this.#listen(indexRows, "focusout", this.#handleIndexLeave);
        this.#listen(indexRows, "click", this.#handleIndexClick);

        const decisionViewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("decision-content")!),
        );
        menu.onSelectionChange((item) => {
            this.#currentDecision = item;
            // Its links and images resolve in its own scope first.
            decisionViewer.setLinkResolver(
                this.#resolveLink?.(item.scope) ?? null,
            );
            decisionViewer.setImageResolver(
                this.#resolveImage?.(item.scope) ?? null,
            );
            decisionViewer.setContentFormatter(this.#formatContent);
            decisionViewer.setContent(item.content);
            this.#renderTitle();
            // Related only follows the open decision.
            if (this.#relatedOnly) this.#showDecisions();
            graph.setOpen(item.id);
            this.#renderRelatedOnly();
            this.#show("decision");
            this.#setAdrInUrl(item);
            window.scrollTo({ top: 0 });
        });

        this.#listen(this.container, "click", this.#handleDecisionLink);
        this.#listen(this.container, "change", this.#handleFilterChange);
        for (const [id, handler] of [
            ["adrs-summary", this.#handleSummaryClick],
            ["adrs-expand", this.#handleExpandClick],
            ["adrs-related", this.#handleRelatedClick],
            ["adrs-lanes", this.#handleLaneClick],
            ["adrs-index-controls", this.#handleLaneClick],
        ] as const) {
            const target = document.getElementById(id);
            if (target) this.#listen(target, "click", handler);
        }

        this.renderAllComponents();
        indexGraph.render();

        // Back and Forward change only `adr`, and the router redraws a page
        // only when `page` changes, so the page follows `adr` itself.
        const shown = workspaceOf(history.location.pathname);
        this.#unlisten = history.listen(({ location }) => {
            // An address in another workspace waits for that one's pages.
            if (inOtherWorkspace(location.pathname, shown)) return;
            const search = new URLSearchParams(location.search);
            if (search.get("page") !== "adrs") return;
            // A filter the address sets draws the page again under it.
            if (this.#filterIn(search) !== this.#filter) {
                this.#redraw();
                return;
            }

            const decision = this.#getAdrFromUrl() ?? null;
            if (decision?.id === this.#currentDecision?.id) return;
            this.#select(decision);
        });

        // Wait until menu is rendered
        this.#firstPaint = window.setTimeout(() => {
            this.#firstPaint = null;
            if (this.#currentDecision) {
                menu.setActive(this.#currentDecision);
                this.#renderTitle();
            } else {
                this.#showIndex();
            }
        }, 100);
    }

    #handleSummaryClick = () => this.#select(null);

    #listen(target: EventTarget, type: string, handler: EventListener) {
        target.addEventListener(type, handler);
        this.#listeners.push({ target, type, handler });
    }

    /** The row under the pointer or the focus, if any. */
    #indexRowOf = (event: Event) =>
        (event.target as HTMLElement | null)?.closest<HTMLElement>(
            "a[data-item-id]",
        ) ?? null;

    /** Pointing at a row lights its edges; a year heading lights nothing. */
    #handleIndexPoint = (event: Event) =>
        this.#indexGraph?.setHover(
            this.#indexRowOf(event)?.dataset.itemId ?? null,
        );

    /** Nothing dims while no row is pointed at. */
    #handleIndexLeave = () => this.#indexGraph?.setHover(null);

    /** A row opens its decision, whatever its id looks like. */
    #handleIndexClick = (event: Event) => {
        const id = this.#indexRowOf(event)?.dataset.itemId;
        const decision = this.#decisions.find((d) => d.id === id);
        if (!decision) return;
        event.preventDefault();
        this.#select(decision);
    };

    #handleExpandClick = () => {
        if (!this.#graph) return;
        const state =
            this.#graph.state === "expanded" ? "collapsed" : "expanded";
        this.#graph.setState(state);
        writeSetting(DECISION_GRAPH_STORAGE_KEY, state);
        this.#renderExpandToggle();
        this.#renderLaneButtons();
    };

    /** ‹ and › scroll the lanes of the decision graph they sit above. */
    #handleLaneClick = (event: Event) => {
        const button = (
            event.target as HTMLElement | null
        )?.closest<HTMLElement>("[data-scroll-lanes]");
        if (!button) return;
        const graph = button.closest("#adrs-index")
            ? this.#indexGraph
            : this.#graph;
        graph?.scrollLanes(button.dataset.scrollLanes === "left" ? -1 : 1);
    };

    /** Each graph's ‹ › buttons show only while its lanes scroll. */
    #renderLaneButtons() {
        for (const [id, graph] of [
            ["adrs-lanes", this.#graph],
            ["adrs-index-controls", this.#indexGraph],
        ] as const) {
            const buttons = document.getElementById(id);
            if (buttons) buttons.hidden = !graph?.scrolling;
        }
    }

    #handleRelatedClick = () => {
        this.#setRelatedOnly(!this.#relatedOnly);
        this.#renderRelatedOnly();
        // The list changes length under the reader's scroll position, and a
        // shorter list would leave the menu showing empty space.
        const scroll = document.getElementById("adrs-scroll");
        if (scroll) scroll.scrollTop = 0;
    };

    #setRelatedOnly(relatedOnly: boolean) {
        if (relatedOnly === this.#relatedOnly) return;
        this.#relatedOnly = relatedOnly;
        this.#showDecisions();
    }

    /**
     * Fill the menu and the decision graph with every decision or, under
     * Related only, with the open decision's relatives. Both keep decision
     * order, so no entry moves.
     */
    #showDecisions() {
        const open = this.#currentDecision;
        const decisions =
            this.#relatedOnly && open
                ? relatedDecisions(this.#decisions, open.id)
                : this.#decisions;
        // The layout first: the menu's redraw draws the graph again, and by
        // then the two have to agree on the rows.
        this.#graph?.setLayout(layoutDecisionGraph(decisions, MENU_GRAPH_CAP));
        this.#menu?.setItems(decisions);
        this.#renderLaneButtons();
    }

    /** Related only filters by the open decision, so it shows only with one. */
    #renderRelatedOnly() {
        const button = document.getElementById("adrs-related");
        if (!button) return;

        button.hidden = !this.#currentDecision;
        button.setAttribute("aria-pressed", String(this.#relatedOnly));
    }

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
        this.#unlisten?.();
        this.#unlisten = null;
        if (this.#firstPaint !== null) window.clearTimeout(this.#firstPaint);
        this.#firstPaint = null;
        this.removeAllComponents();
        this.#indexGraph?.clear();
        this.#menu = null;
        this.#graph = null;
        this.#indexGraph = null;
        this.#indexCap = null;
        for (const { target, type, handler } of this.#listeners) {
            target.removeEventListener(type, handler);
        }
        this.#listeners = [];
        this.#relatedOnly = false;
        this.container!.innerHTML = "";
    }
}
