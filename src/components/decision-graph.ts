/**
 * The decision graph beside the decisions menu: a dot per decision, colored
 * by its status, and the open decision's links. Collapsed, it is a narrow
 * gutter, and the open decision shows each link as a small elbow out to the
 * left and across to the decision it links to.
 *
 * The layout comes from `model/decision-graph`; this draws it as SVG beside
 * the menu's entries. Each mark records what it means in `data-*` attributes
 * (what it is, which decisions, which kind, which status, highlighted or not),
 * so the page tests read the graph's meaning without the positions, which only
 * a real browser lays out.
 */

import type { DecisionGraphLayout } from "../model/decision-graph";
import { decisionStatus } from "../model/decisions";
import type { Decision } from "../types/structurizr-documentation";
import Component from "./_component";
import styles from "./decision-graph.module.css";

/** Collapsed is a narrow gutter; expanded shows every lane. */
export type DecisionGraphState = "collapsed" | "expanded";

/** The collapsed gutter's width: room enough for an elbow to read as one. */
const COLLAPSED_WIDTH = 34;
/** Where the collapsed gutter's dots sit, a little way in from the titles. */
const DOT_X = COLLAPSED_WIDTH - 10;
/** How far a collapsed elbow reaches out to the left of the dots. */
const ELBOW_OUT = 12;
/** The radius of a collapsed elbow's corners. */
const ELBOW_CORNER = 4;
/** A dot's radius, and the open decision's, a little larger. */
const DOT_RADIUS = 3.5;
const OPEN_DOT_RADIUS = 4.5;
/** How far the ring around the open decision's dot stands off it. */
const RING_GAP = 2.5;

/** Ids come from the workspace author, so they are escaped into attributes. */
const attribute = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** A number short enough for an attribute, without float noise. */
const px = (value: number) => `${Math.round(value * 100) / 100}`;

/**
 * An elbow from the open decision's dot out to the left, then straight up or
 * down, and back in to the other decision's dot, with rounded corners.
 */
function elbowPath(fromY: number, toY: number): string {
    const x = DOT_X;
    const out = x - ELBOW_OUT;
    const corner = Math.min(ELBOW_CORNER, Math.abs(toY - fromY) / 2);
    const down = toY > fromY ? 1 : -1;

    return [
        `M ${px(x)},${px(fromY)}`,
        `H ${px(out + corner)}`,
        `Q ${px(out)},${px(fromY)} ${px(out)},${px(fromY + down * corner)}`,
        `V ${px(toY - down * corner)}`,
        `Q ${px(out)},${px(toY)} ${px(out + corner)},${px(toY)}`,
        `H ${px(x)}`,
    ].join(" ");
}

export default class DecisionGraph extends Component {
    /** Where the menu's entries are, so dots can line up with them. */
    readonly #entries: HTMLElement;
    #layout: DecisionGraphLayout | null = null;
    #open: string | null = null;
    #state: DecisionGraphState = "collapsed";
    #resizeObserver: ResizeObserver | null = null;

    constructor(element: HTMLElement, entries: HTMLElement) {
        super(element);
        this.#entries = entries;
    }

    setLayout(layout: DecisionGraphLayout) {
        this.#layout = layout;
        this.draw();
    }

    /** Draw the links of this decision, or of none. */
    setOpen(id: string | null) {
        this.#open = id;
        this.draw();
    }

    /**
     * The center of each entry's first line, by decision id, from the top of
     * the graph. A dot sits beside the first line, so titles that wrap still
     * line up with their dots.
     */
    #measureRows(): Map<string, number> {
        const ys = new Map<string, number>();
        if (!this.element) return ys;

        const top = this.element.getBoundingClientRect().top;
        const anchors =
            this.#entries.querySelectorAll<HTMLElement>("a[data-item-id]");

        for (const anchor of anchors) {
            const style = window.getComputedStyle(anchor);
            const padding = Number.parseFloat(style.paddingTop) || 0;
            const lineHeight = Number.parseFloat(style.lineHeight) || 0;
            const y =
                anchor.getBoundingClientRect().top -
                top +
                padding +
                lineHeight / 2;
            ys.set(anchor.dataset.itemId ?? "", y);
        }

        return ys;
    }

    #dot(row: Decision, y: number, linked: Set<number>, index: number) {
        const isOpen = row.id === this.#open;
        const emphasis =
            this.#open === null
                ? ""
                : linked.has(index) || isOpen
                  ? " data-highlighted"
                  : " data-dimmed";
        const id = attribute(row.id);
        const radius = isOpen ? OPEN_DOT_RADIUS : DOT_RADIUS;
        const ring = isOpen
            ? `<circle class="${styles.ring}" data-mark="ring" data-decision="${id}" cx="${DOT_X}" cy="${px(y)}" r="${radius + RING_GAP}"></circle>`
            : "";

        return `${ring}<circle class="${styles.dot}" data-mark="dot" data-decision="${id}" data-status="${decisionStatus(row.status)}"${isOpen ? " data-open" : ""}${emphasis} cx="${DOT_X}" cy="${px(y)}" r="${radius}"></circle>`;
    }

    /** Redraw from the layout and where the menu's entries are now. */
    draw() {
        if (!this.element) return;

        const ys = this.#measureRows();
        const layout = this.#layout;
        // The menu is a `<select>` on narrow screens, with nothing to sit
        // beside, so the graph takes no room at all.
        if (!layout || ys.size === 0) {
            this.element.innerHTML = "";
            return;
        }

        const { rows, edges } = layout;
        const open = rows.findIndex((row) => row.id === this.#open);
        const ownEdges = edges.filter(
            (edge) => edge.from === open || edge.to === open,
        );
        const linked = new Set(
            ownEdges.map((edge) => (edge.from === open ? edge.to : edge.from)),
        );

        const elbows = ownEdges.map((edge) => {
            const newer = rows[edge.from];
            const older = rows[edge.to];
            const other = edge.from === open ? older : newer;
            const d = elbowPath(
                ys.get(rows[open].id) ?? 0,
                ys.get(other.id) ?? 0,
            );
            // Supersede and amend take the older decision's status color,
            // which says what the newer one did to it.
            return `<path class="${styles.edge}" data-mark="edge" data-kind="${edge.kind}" data-from="${attribute(newer.id)}" data-to="${attribute(older.id)}" data-status="${decisionStatus(older.status)}" data-highlighted d="${d}"></path>`;
        });

        const dots = rows.map((row, index) =>
            this.#dot(row, ys.get(row.id) ?? 0, linked, index),
        );

        const height = this.#entries.getBoundingClientRect().height;
        this.element.innerHTML = `<svg class="${styles.svg}" width="${COLLAPSED_WIDTH}" height="${px(height)}" aria-hidden="true" focusable="false">${elbows.join("")}${dots.join("")}</svg>`;
    }

    render() {
        this.clear();
        if (!this.element) return;

        this.element.classList.add(styles.graph);
        this.element.dataset.decisionGraph = "";
        this.element.dataset.state = this.#state;

        // Entries change height when a web font arrives and titles rewrap;
        // the dots have to follow them.
        this.#resizeObserver = new ResizeObserver(() => this.draw());
        this.#resizeObserver.observe(this.#entries);

        this.draw();
    }

    clear() {
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = null;
        if (this.element) this.element.innerHTML = "";
    }
}
