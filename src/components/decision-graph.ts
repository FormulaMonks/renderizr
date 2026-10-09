/**
 * The decision graph beside the decisions menu: a dot per decision, colored
 * by its status, and the links between decisions.
 *
 * Collapsed, it is a narrow gutter, and the open decision shows each link as
 * a small elbow out to the left and across to the decision it links to.
 * Expanded, every lane shows: supersede and amend stretches along a lane,
 * each one real link between neighbors; other supersede and amend links
 * joining a lane with an elbow that runs down it to the older decision;
 * references joining a lane with a quiet elbow; and lone dots next to the
 * titles. The gutter takes the expanded graph's width, so the menu text moves
 * right rather than under the drawing.
 *
 * The layout comes from `model/decision-graph`; this draws it as SVG beside
 * the menu's entries. Each mark records what it means in `data-*` attributes
 * (what it is, which decisions, which kind, which status, which lane,
 * highlighted or dimmed), so the page tests read the graph's meaning without
 * the positions, which only a real browser lays out.
 *
 * With a decision open, the expanded graph lights every link of that decision
 * and dims everything else: every lane, every join and every dot but the
 * links' ends. A supersede or amend link that continues a lane lights its
 * stretch, and one that joins a lane lights the join and the lane down to the
 * older decision; its references run in full on the reference
 * column, next to the lone dots. On the index, where nothing is open, the row
 * a reader points at lights the same way. The column takes its room whether a
 * decision is open or not, so opening one never moves a column.
 *
 * Past its cap, the layout falls back, and references open no lanes.
 *
 * When even supersede and amend lanes outgrow the cap, the lanes scroll
 * sideways in a view as wide as the cap, under a pinned strip that repeats
 * the lone dots and the reference column. The view starts at the titles'
 * edge, and opening a decision scrolls it as little as possible to show the
 * lanes the decision's edges reach, its own lane first.
 */

import {
    continuesLane,
    type DecisionEdges,
    type DecisionGraphLayout,
    type Edge,
    edgesOfDecision,
    joinsLane,
    type Lane,
    laneColumnsOfDecision,
} from "../model/decision-graph";
import { decisionStatus } from "../model/decisions";
import type { Decision } from "../types/structurizr-documentation";
import Component from "./_component";
import styles from "./decision-graph.module.css";

/** Collapsed is a narrow gutter; expanded shows every lane. */
export type DecisionGraphState = "collapsed" | "expanded";

/** How a drawing differs from the menu's: the index spaces its columns wider. */
export type DecisionGraphOptions = { columnWidth?: number };

/**
 * The collapsed gutter's width: room enough for an elbow to read as one. The
 * page's stylesheet sizes the menu's entries by it, through the
 * `--collapsed-gutter` property this sets on them, so the two never drift.
 */
const COLLAPSED_WIDTH = 34;
/** Where the collapsed gutter's dots sit, a little way in from the titles. */
const DOT_X = COLLAPSED_WIDTH - 10;
/** How far a collapsed elbow reaches out to the left of the dots. */
const ELBOW_OUT = 12;
/** The radius of a collapsed elbow's corners. */
const ELBOW_CORNER = 4;
/** A dot's radius. */
const DOT_RADIUS = 3.5;
/** The open decision's dot is a little larger, so it stands out in its ring. */
const OPEN_DOT_RADIUS = 4.5;
/** How far the ring around the open decision's dot stands off it. */
const RING_GAP = 2.5;

/** How far apart the expanded graph's columns sit in the menu. */
const COLUMN_WIDTH = 12;
/** The room on either side of the expanded graph's outer columns. */
const PADDING = 9;
/** The radius of a join's corner, where a reference turns into a lane. */
const JOIN_CORNER = 3;
/** A lone dot is a little smaller than a dot on a lane. */
const LONE_DOT_RADIUS = 3;
/** The open decision's ring stands a little further off in the expanded graph. */
const EXPANDED_RING_GAP = 3;

/** While the lanes scroll, a gap keeps the first lane clear of the pinned strip. */
const LANE_GAP = 8;
/** The pinned strip reaches past the reference column, so no line sits on its edge. */
const PIN_ROOM = 6;
/** The room a lane keeps from the edges of the lanes' view when it scrolls in. */
const LANE_MARGIN = 14;
/** How many columns a press of ‹ or › scrolls. */
const SCROLL_STEP = 4;

/** Each drawing's id, unique on the page, so the pinned strip can repeat it. */
let drawings = 0;

/** The expanded drawing: its width, its marks, and where each column sits. */
type ExpandedDrawing = {
    width: number;
    marks: string;
    x: (col: number) => number;
};

/** Ids come from the workspace author, so they are escaped into attributes. */
const attribute = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** A number short enough for an attribute, without float noise. */
const px = (value: number) => `${Math.round(value * 100) / 100}`;

/** A point in the drawing. */
type Point = { x: number; y: number };

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

/**
 * A link drawn in full on the reference column: across from the newer
 * decision's dot to the column, down it, and back across to the older
 * decision's dot, with a small corner at each turn.
 */
function columnPath(from: Point, columnX: number, to: Point): string {
    const corner = Math.min(JOIN_CORNER, Math.abs(to.y - from.y) / 2);
    const fromSide = Math.sign(from.x - columnX);
    const toSide = Math.sign(to.x - columnX);

    return [
        `M ${px(from.x)},${px(from.y)}`,
        `H ${px(columnX + fromSide * corner)}`,
        `Q ${px(columnX)},${px(from.y)} ${px(columnX)},${px(from.y + corner)}`,
        `V ${px(to.y - corner)}`,
        `Q ${px(columnX)},${px(to.y)} ${px(columnX + toSide * corner)},${px(to.y)}`,
        `H ${px(to.x)}`,
    ].join(" ");
}

/**
 * Whether a mark lights up or dims. With no decision open, every mark shows
 * as it is and records neither.
 */
const emphasis = (lit: DecisionEdges | null, on: boolean) =>
    lit === null ? "" : on ? " data-highlighted" : " data-dimmed";

/** What an edge's path means, beyond its shape. */
type EdgeMark = {
    mark: "edge" | "stretch" | "join";
    kind: string;
    newer: Decision;
    older: Decision;
    /** The name of the lane the path runs on or joins, if any. */
    lane?: string;
    /** What `emphasis` says about the path. */
    emphasis: string;
    d: string;
};

/**
 * A path for a link or a stretch of a lane, recording what it means. It
 * takes the older decision's status color, which says what the newer
 * decision did to it.
 */
const edgePath = ({ mark, kind, newer, older, lane, emphasis, d }: EdgeMark) =>
    `<path class="${styles.edge}" data-mark="${mark}" data-kind="${kind}" data-from="${attribute(newer.id)}" data-to="${attribute(older.id)}" data-status="${decisionStatus(older.status)}"${lane === undefined ? "" : ` data-lane="${lane}"`}${emphasis} d="${d}"></path>`;

/** A lane's name on its marks: the id of its oldest decision. */
const laneName = (layout: DecisionGraphLayout, lane: Lane) =>
    attribute(layout.rows[lane.bottom].id);

export default class DecisionGraph extends Component {
    /** Where the menu's entries are, so dots can line up with them. */
    readonly #entries: HTMLElement;
    #layout: DecisionGraphLayout | null = null;
    #open: string | null = null;
    #hover: string | null = null;
    readonly #columnWidth: number;
    #state: DecisionGraphState = "collapsed";
    #resizeObserver: ResizeObserver | null = null;
    readonly #drawingId = `decision-graph-${++drawings}`;
    /** Whether the lanes go back to the titles' edge on the next draw. */
    #scrollToTitles = false;
    /** Whether the open decision's lanes scroll into view on the next draw. */
    #scrollToOpen = false;

    constructor(
        element: HTMLElement,
        entries: HTMLElement,
        { columnWidth = COLUMN_WIDTH }: DecisionGraphOptions = {},
    ) {
        super(element);
        this.#entries = entries;
        this.#columnWidth = columnWidth;
    }

    setLayout(layout: DecisionGraphLayout) {
        this.#layout = layout;
        this.#scrollToTitles = true;
        this.#scrollToOpen = true;
        this.draw();
    }

    /** Draw the links of this decision, or of none. */
    setOpen(id: string | null) {
        this.#open = id;
        this.#scrollToOpen = true;
        this.draw();
    }

    /**
     * Light the edges of the decision a reader points at, or of none. It wins
     * over the open decision while it lasts.
     */
    setHover(id: string | null) {
        if (this.#hover === id) return;
        this.#hover = id;
        this.draw();
    }

    /** The row whose edges light: the one pointed at, else the open one. */
    #litRow(layout: DecisionGraphLayout): number {
        const id = this.#hover ?? this.#open;
        return layout.rows.findIndex((row) => row.id === id);
    }

    get state(): DecisionGraphState {
        return this.#state;
    }

    /** Collapse the graph to its gutter, or expand it to show every lane. */
    setState(state: DecisionGraphState) {
        this.#state = state;
        this.#scrollToTitles = true;
        this.#scrollToOpen = true;
        if (this.element) this.element.dataset.state = state;
        this.draw();
    }

    /** Whether the lanes scroll sideways: expanded, past even the lineage fallback. */
    get scrolling(): boolean {
        return (
            this.#state === "expanded" && this.#layout?.fallback === "scroll"
        );
    }

    /** Scroll the lanes a few columns to the left (-1) or the right (1). */
    scrollLanes(direction: -1 | 1) {
        this.element?.querySelector<HTMLElement>("[data-lanes]")?.scrollBy({
            left: direction * SCROLL_STEP * this.#columnWidth,
            behavior: "smooth",
        });
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
        const { rows } = layout;
        const open = this.#litRow(layout);
        const lit = open < 0 ? null : edgesOfDecision(layout, open);
        const links = lit?.links ?? [];

        const elbows = links.map((edge) => {
            const newer = rows[edge.from];
            const older = rows[edge.to];
            const other = edge.from === open ? older : newer;
            const d = elbowPath(
                ys.get(rows[open].id) ?? 0,
                ys.get(other.id) ?? 0,
            );
            return edgePath({
                mark: "edge",
                kind: edge.kind,
                newer,
                older,
                emphasis: emphasis(lit, true),
                d,
            });
        });

        const dots = rows.map((row, index) =>
            this.#dot(
                row,
                DOT_X,
                ys.get(row.id) ?? 0,
                row.id === this.#open ? OPEN_DOT_RADIUS : DOT_RADIUS,
                RING_GAP,
                emphasis(lit, lit?.dots.has(index) ?? false),
            ),
        );

        return {
            width: COLLAPSED_WIDTH,
            marks: `${elbows.join("")}${dots.join("")}`,
        };
    }

    /**
     * The expanded graph: every lane's stretches, the joins into lanes,
     * every dot on its lane or, alone, in column 0 next to the titles, and
     * the lit decision's links on the reference column.
     */
    #drawExpanded(
        layout: DecisionGraphLayout,
        ys: Map<string, number>,
    ): ExpandedDrawing {
        const { rows, edges, lanes, laneOf, referenceColumn } = layout;
        const columnWidth = this.#columnWidth;
        // While the lanes scroll, the lone dots and the reference column stay
        // pinned, and a gap sets the first lane apart from them.
        const gap = layout.fallback === "scroll" ? LANE_GAP : 0;
        const width = 2 * PADDING + gap + (layout.columns - 1) * columnWidth;
        // Column 0 sits next to the titles, and the graph grows to the left.
        const x = (col: number) =>
            width -
            PADDING -
            (col > referenceColumn ? gap : 0) -
            col * columnWidth;
        const y = (row: number) => ys.get(rows[row].id) ?? 0;
        const open = this.#litRow(layout);
        const lit = open < 0 ? null : edgesOfDecision(layout, open);

        // A stretch runs up the lane from the older decision's dot to `topY`.
        // Once a decision lights, every lane stretch dims; only its own
        // supersede and amend links light along their lane, over it.
        const stretch = (
            lane: Lane,
            kind: string,
            newer: number,
            older: number,
            topY: number,
            on = false,
        ) =>
            edgePath({
                mark: "stretch",
                kind,
                newer: rows[newer],
                older: rows[older],
                lane: laneName(layout, lane),
                emphasis: emphasis(lit, on),
                d: `M ${px(x(lane.col))},${px(y(older))} V ${px(topY)}`,
            });

        // Every two neighbors on a lane are a real supersede or amend link,
        // so each stretch draws that link's kind and the older decision's
        // status.
        const stretches: string[] = [];
        for (const lane of lanes) {
            const { members } = lane;
            for (const [index, newer] of members.slice(0, -1).entries()) {
                const older = members[index + 1];
                const link = edges.find(
                    (edge) => edge.from === newer && edge.to === older,
                );
                if (!link) continue;
                stretches.push(
                    stretch(lane, link.kind, newer, older, y(newer)),
                );
            }
            // Above its newest decision, the lane carries references up to
            // its newest referencing linker; it stops where that join turns
            // into it. A supersede or amend join draws its own way down.
            const newest = members[0];
            const referenceTop = Math.min(
                ...edges
                    .filter(
                        (edge) =>
                            edge.kind === "reference" &&
                            laneOf[edge.to] === lane &&
                            laneOf[edge.from] !== lane &&
                            joinsLane(layout, edge),
                    )
                    .map((edge) => edge.from),
            );
            if (referenceTop < newest) {
                stretches.push(
                    stretch(
                        lane,
                        "reference",
                        referenceTop,
                        newest,
                        y(referenceTop) + JOIN_CORNER,
                    ),
                );
            }
        }

        // Where a row's dot sits: on its lane, or alone in column 0.
        const dot = (row: number) => ({
            x: x(laneOf[row]?.col ?? 0),
            y: y(row),
        });

        // A join, from the newer decision's dot across to the older
        // decision's lane. A reference turns into the lane and stops; a
        // supersede or amend that doesn't continue the lane runs on down it
        // to the older decision's dot. One on the newer decision's own lane
        // has nothing to cross, so it draws only while lit.
        const join = (edge: Edge, on: boolean) => {
            const lane = laneOf[edge.to];
            if (!lane || !joinsLane(layout, edge)) return [];
            const own = laneOf[edge.from] === lane;
            if (own && (!on || edge.kind === "reference")) return [];
            const across = joinPath(
                dot(edge.from).x,
                x(lane.col),
                y(edge.from),
            );
            const d = own
                ? `M ${px(x(lane.col))},${px(y(edge.from))} V ${px(y(edge.to))}`
                : edge.kind === "reference"
                  ? across
                  : `${across} V ${px(y(edge.to))}`;
            return [
                edgePath({
                    mark: "join",
                    kind: edge.kind,
                    newer: rows[edge.from],
                    older: rows[edge.to],
                    lane: laneName(layout, lane),
                    emphasis: emphasis(lit, on),
                    d,
                }),
            ];
        };
        // Supersede and amend joins sit under the stretches, so a lane's
        // own links read where a join runs down it.
        const branches = edges
            .filter(
                (edge) =>
                    edge.kind !== "reference" && !continuesLane(layout, edge),
            )
            .flatMap((edge) => join(edge, false));
        const references = edges
            .filter((edge) => edge.kind === "reference")
            .flatMap((edge) => join(edge, false));

        // The lit decision's supersede and amend links, farthest first so
        // the nearest sits on top where they overlap. A link that continues
        // a lane lights its stretch, and one that joins a lane lights the
        // join and the lane down to the older decision; the dots they pass
        // stay dimmed.
        const litLanes = (lit?.links ?? []).flatMap((edge) => {
            if (edge.kind === "reference") return [];
            const lane = laneOf[edge.from];
            if (!continuesLane(layout, edge) || !lane) return join(edge, true);
            return [
                stretch(
                    lane,
                    edge.kind,
                    edge.from,
                    edge.to,
                    y(edge.from),
                    true,
                ),
            ];
        });

        // References run in full on the reference column instead, lit. The
        // column stays empty while nothing is lit.
        const columnX = x(referenceColumn);
        const links = (lit?.links ?? [])
            .filter((edge) => edge.kind === "reference")
            .map((edge) =>
                edgePath({
                    mark: "edge",
                    kind: edge.kind,
                    newer: rows[edge.from],
                    older: rows[edge.to],
                    emphasis: emphasis(lit, true),
                    d: columnPath(dot(edge.from), columnX, dot(edge.to)),
                }),
            );

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
                `${lane ? ` data-lane="${laneName(layout, lane)}"` : ""}${emphasis(lit, lit?.dots.has(index) ?? false)}`,
            );
        });

        return {
            width,
            marks: `${branches.join("")}${stretches.join("")}${references.join("")}${litLanes.join("")}${links.join("")}${dots.join("")}`,
            x,
        };
    }

    /**
     * Paint the expanded drawing with its lanes in a view that scrolls, at
     * the cap's width, under a strip that repeats the pinned columns. The
     * view stays from one draw to the next, so it keeps its scroll position.
     */
    #paintScrolling(
        layout: DecisionGraphLayout,
        { width, marks, x }: ExpandedDrawing,
        height: number,
    ) {
        if (!this.element) return;

        const viewWidth = 2 * PADDING + (layout.cap - 1) * this.#columnWidth;
        const pinWidth = width - x(layout.referenceColumn) + PIN_ROOM;

        let view = this.element.querySelector<HTMLElement>("[data-lanes]");
        if (!view) {
            this.element.innerHTML = `<div class="${styles.lanes}" data-lanes></div><svg class="${styles.pinned}" data-pinned aria-hidden="true" focusable="false"></svg>`;
            view = this.element.querySelector<HTMLElement>("[data-lanes]")!;
        }
        view.style.setProperty("--lanes-width", `${px(viewWidth)}px`);
        view.innerHTML = `<svg class="${styles.svg}" width="${px(width)}" height="${px(height)}" aria-hidden="true" focusable="false"><g id="${this.#drawingId}" data-drawing>${marks}</g></svg>`;

        const strip = this.element.querySelector("[data-pinned]")!;
        strip.setAttribute("width", px(pinWidth));
        strip.setAttribute("height", px(height));
        strip.innerHTML = `<rect class="${styles.pinnedBackground}" width="${px(pinWidth)}" height="${px(height)}"></rect><use href="#${this.#drawingId}" x="${px(pinWidth - width)}"></use>`;

        this.#scrollLanesIntoView(view, layout, x, viewWidth - pinWidth);
    }

    /**
     * Scroll the lanes back to the titles' edge after a new layout, and the
     * open decision's lanes into view once it opens: its own lane and every
     * lane its edges reach, moving as little as possible. When they don't
     * all fit, its own lane wins or, for a lone dot, the lane nearest the
     * titles. `room` is the width the lanes show in, beside the pinned strip.
     */
    #scrollLanesIntoView(
        view: HTMLElement,
        layout: DecisionGraphLayout,
        x: (col: number) => number,
        room: number,
    ) {
        if (!this.#scrollToTitles && !this.#scrollToOpen) return;
        // A hidden view measures nothing; it scrolls once it shows.
        if (view.clientWidth === 0) return;

        const end = Math.max(0, view.scrollWidth - view.clientWidth);
        let left = this.#scrollToTitles ? end : view.scrollLeft;
        this.#scrollToTitles = false;
        this.#scrollToOpen = false;

        const open = layout.rows.findIndex((row) => row.id === this.#open);
        const xs = open < 0 ? [] : laneColumnsOfDecision(layout, open).map(x);

        if (xs.length > 0) {
            let lo = Math.min(...xs);
            let hi = Math.max(...xs);
            // When they don't all fit, the first of them wins.
            if (hi - lo > room - 2 * LANE_MARGIN) {
                lo = xs[0];
                hi = lo;
            }
            left = Math.min(
                Math.max(left, hi - room + LANE_MARGIN),
                lo - LANE_MARGIN,
            );
        }

        view.scrollLeft = Math.min(Math.max(left, 0), end);
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
        this.element.dataset.fallback = layout.fallback;
        this.#markLinked(layout);

        const height = this.#entries.getBoundingClientRect().height;
        const expanded =
            this.#state === "expanded" ? this.#drawExpanded(layout, ys) : null;
        if (expanded && layout.fallback === "scroll") {
            this.#paintScrolling(layout, expanded, height);
            return;
        }

        const { width, marks } = expanded ?? this.#drawCollapsed(layout, ys);
        this.element.innerHTML = `<svg class="${styles.svg}" width="${px(width)}" height="${px(height)}" aria-hidden="true" focusable="false">${marks}</svg>`;
    }

    /**
     * Mark the entries of the decisions the lit decision links to, so their
     * titles can stand out beside the lit dots.
     */
    #markLinked(layout: DecisionGraphLayout) {
        const lit = this.#litRow(layout);
        const linked = new Set(
            lit < 0
                ? []
                : edgesOfDecision(layout, lit)
                      .links.flatMap((edge) => [edge.from, edge.to])
                      .filter((row) => row !== lit)
                      .map((row) => layout.rows[row].id),
        );
        const anchors =
            this.#entries.querySelectorAll<HTMLElement>("a[data-item-id]");
        for (const anchor of anchors) {
            if (linked.has(anchor.dataset.itemId ?? "")) {
                anchor.setAttribute("data-linked", "");
            } else {
                anchor.removeAttribute("data-linked");
            }
        }
    }

    render() {
        this.clear();
        if (!this.element) return;

        this.element.classList.add(styles.graph);
        this.#entries.style.setProperty(
            "--collapsed-gutter",
            `${COLLAPSED_WIDTH}px`,
        );
        this.element.dataset.decisionGraph = "";
        this.element.dataset.state = this.#state;
        // A fresh drawing starts at the titles' edge, like a new layout.
        this.#scrollToTitles = true;
        this.#scrollToOpen = true;

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
