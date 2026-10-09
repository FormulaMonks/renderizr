/**
 * The decision graph beside the decisions menu: a dot per decision, colored
 * by its status, and the links between decisions.
 *
 * Collapsed, it is a narrow gutter, and the open decision shows each link as
 * a small elbow out to the left and across to the decision it links to.
 * Expanded, every lane shows: supersede and amend stretches along a lane,
 * references joining a lane with a quiet elbow, and lone dots next to the
 * titles. The gutter takes the expanded graph's width, so the menu text moves
 * right rather than under the drawing.
 *
 * The layout comes from `model/decision-graph`; this draws it as SVG beside
 * the menu's entries. Each mark records what it means in `data-*` attributes
 * (what it is, which decisions, which kind, which status, which lane,
 * highlighted or not), so the page tests read the graph's meaning without the
 * positions, which only a real browser lays out.
 */

import type { DecisionGraphLayout, Lane } from "../model/decision-graph";
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

/** How far apart the expanded graph's columns sit. */
const COLUMN_WIDTH = 12;
/** The room on either side of the expanded graph's outer columns. */
const PADDING = 9;
/** The radius of a join's corner, where a reference turns into a lane. */
const JOIN_CORNER = 3;
/** A lone dot is a little smaller than a dot on a lane. */
const LONE_DOT_RADIUS = 3;
/** The open decision's ring stands a little further off in the expanded graph. */
const EXPANDED_RING_GAP = 3;

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

/**
 * A join: across from the linker's dot to the lane, then down into it, with
 * a small corner, as quiet as the collapsed elbows.
 */
function joinPath(fromX: number, laneX: number, y: number): string {
    const side = Math.sign(fromX - laneX);

    return [
        `M ${px(fromX)},${px(y)}`,
        `H ${px(laneX + side * JOIN_CORNER)}`,
        `Q ${px(laneX)},${px(y)} ${px(laneX)},${px(y + JOIN_CORNER)}`,
    ].join(" ");
}

/** A lane's name on its marks: the id of its oldest decision. */
const laneName = (layout: DecisionGraphLayout, lane: Lane) =>
    attribute(layout.rows[lane.bottom].id);

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

    get state(): DecisionGraphState {
        return this.#state;
    }

    /** Collapse the graph to its gutter, or expand it to show every lane. */
    setState(state: DecisionGraphState) {
        this.#state = state;
        if (this.element) this.element.dataset.state = state;
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

    /**
     * A dot, with a ring when it is the open decision. `attributes` carries
     * the rest of what the dot means, as the caller worked it out.
     */
    #dot(
        row: Decision,
        x: number,
        y: number,
        radius: number,
        ringGap: number,
        attributes: string,
    ) {
        const isOpen = row.id === this.#open;
        const id = attribute(row.id);
        const ring = isOpen
            ? `<circle class="${styles.ring}" data-mark="ring" data-decision="${id}" cx="${px(x)}" cy="${px(y)}" r="${radius + ringGap}"></circle>`
            : "";

        return `${ring}<circle class="${styles.dot}" data-mark="dot" data-decision="${id}" data-status="${decisionStatus(row.status)}"${isOpen ? " data-open" : ""}${attributes} cx="${px(x)}" cy="${px(y)}" r="${radius}"></circle>`;
    }

    /** The collapsed gutter: dots, and elbows for the open decision's links. */
    #drawCollapsed(layout: DecisionGraphLayout, ys: Map<string, number>) {
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

        const dots = rows.map((row, index) => {
            const isOpen = row.id === this.#open;
            const emphasis =
                this.#open === null
                    ? ""
                    : linked.has(index) || isOpen
                      ? " data-highlighted"
                      : " data-dimmed";
            return this.#dot(
                row,
                DOT_X,
                ys.get(row.id) ?? 0,
                isOpen ? OPEN_DOT_RADIUS : DOT_RADIUS,
                RING_GAP,
                emphasis,
            );
        });

        return {
            width: COLLAPSED_WIDTH,
            marks: `${elbows.join("")}${dots.join("")}`,
        };
    }

    /**
     * The expanded graph: every lane's stretches, the joins into lanes, and
     * every dot on its lane or, alone, in column 0 next to the titles.
     */
    #drawExpanded(layout: DecisionGraphLayout, ys: Map<string, number>) {
        const { rows, edges, lanes, laneOf } = layout;
        const width =
            2 * PADDING + Math.max(1, layout.columns - 1) * COLUMN_WIDTH;
        // Column 0 sits next to the titles, and the graph grows to the left.
        const x = (col: number) => width - PADDING - col * COLUMN_WIDTH;
        const y = (row: number) => ys.get(rows[row].id) ?? 0;

        // A stretch runs up the lane from the older decision's dot to `topY`.
        const stretch = (
            lane: Lane,
            kind: string,
            newer: number,
            older: number,
            topY: number,
        ) =>
            `<path class="${styles.edge}" data-mark="stretch" data-kind="${kind}" data-from="${attribute(rows[newer].id)}" data-to="${attribute(rows[older].id)}" data-status="${decisionStatus(rows[older].status)}" data-lane="${laneName(layout, lane)}" d="M ${px(x(lane.col))},${px(y(older))} V ${px(topY)}"></path>`;

        const stretches: string[] = [];
        for (const lane of lanes) {
            const members = lane.members.toSorted((a, b) => a - b);
            // Between two decisions of the lineage, the stretch takes the
            // strongest link that spans it: the newer decision's own link
            // to the older, or, in a lineage that branches, a link that
            // passes over both.
            for (const [index, newer] of members.slice(0, -1).entries()) {
                const older = members[index + 1];
                const own = edges.find(
                    (edge) => edge.from === newer && edge.to === older,
                );
                const spanning = edges.filter(
                    (edge) =>
                        edge.kind !== "reference" &&
                        edge.from <= newer &&
                        edge.to >= older &&
                        laneOf[edge.from] === lane &&
                        laneOf[edge.to] === lane,
                );
                const kind =
                    own && own.kind !== "reference"
                        ? own.kind
                        : spanning.some((edge) => edge.kind === "supersede")
                          ? "supersede"
                          : "amend";
                stretches.push(stretch(lane, kind, newer, older, y(newer)));
            }
            // Above the newest decision, the lane only carries references up
            // to its newest linker; it stops where that join turns into it.
            const newest = members[0];
            if (lane.top < newest) {
                stretches.push(
                    stretch(
                        lane,
                        "reference",
                        lane.top,
                        newest,
                        y(lane.top) + JOIN_CORNER,
                    ),
                );
            }
        }

        // A join for every link into another lineage's lane, from the
        // linker's own column across to the lane.
        const joins = edges.flatMap((edge) => {
            const lane = laneOf[edge.to];
            if (!lane || laneOf[edge.from] === lane) return [];
            const fromX = x(laneOf[edge.from]?.col ?? 0);
            const d = joinPath(fromX, x(lane.col), y(edge.from));
            return [
                `<path class="${styles.edge}" data-mark="join" data-kind="${edge.kind}" data-from="${attribute(rows[edge.from].id)}" data-to="${attribute(rows[edge.to].id)}" data-status="${decisionStatus(rows[edge.to].status)}" data-lane="${laneName(layout, lane)}" d="${d}"></path>`,
            ];
        });

        const dots = rows.map((row, index) => {
            const lane = laneOf[index];
            const radius =
                row.id === this.#open
                    ? OPEN_DOT_RADIUS
                    : lane
                      ? DOT_RADIUS
                      : LONE_DOT_RADIUS;
            return this.#dot(
                row,
                x(lane?.col ?? 0),
                y(index),
                radius,
                EXPANDED_RING_GAP,
                lane ? ` data-lane="${laneName(layout, lane)}"` : "",
            );
        });

        return {
            width,
            marks: `${stretches.join("")}${joins.join("")}${dots.join("")}`,
        };
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

        const { width, marks } =
            this.#state === "expanded"
                ? this.#drawExpanded(layout, ys)
                : this.#drawCollapsed(layout, ys);

        const height = this.#entries.getBoundingClientRect().height;
        this.element.innerHTML = `<svg class="${styles.svg}" width="${px(width)}" height="${px(height)}" aria-hidden="true" focusable="false">${marks}</svg>`;
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
