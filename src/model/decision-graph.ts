/**
 * The decision graph's layout: everything the drawing beside the decisions
 * menu needs, worked out from the decisions alone, with no DOM.
 *
 * Authors state a link from one side or both, in whatever wording their ADR
 * tool writes, so the layout sorts each wording into one of three kinds and
 * merges both sides of a pair into one edge. That merge also recovers links
 * an importer dropped from one side: Structurizr's adr-tools importer reads a
 * later "(0,0)" on the line as part of the link, which is how three of our
 * own references lost their newer side.
 */

import type { Decision } from "../types/structurizr-documentation";
import { decisionOrder } from "./decisions";

/** What a link says about the older decision. */
export type LinkKind = "supersede" | "amend" | "reference";

/** One link between two decisions, by row; `from` is the newer decision. */
export type Edge = { from: number; to: number; kind: LinkKind };

/**
 * A vertical line in the decision graph, by row: from `top` (its newest
 * decision or linker) down to `bottom` (its oldest decision).
 */
export type Lane = {
    col: number;
    top: number;
    bottom: number;
    /**
     * The rows that continue one another along the lane, newest first: each
     * supersedes or amends the next, so every stretch is a real link.
     */
    members: number[];
    /**
     * The rows that link to a member without continuing the lane, and join
     * it, newest first and each once: a second decision that supersedes or
     * amends a member, or one that references a member while references open
     * lanes.
     */
    linkers: number[];
};

/**
 * How the graph copes when its lanes outgrow the columns it may take: not at
 * all, by dropping reference lanes, or by scrolling the lanes sideways.
 */
export type Fallback = "none" | "lineage" | "scroll";

export type DecisionGraphLayout = {
    /** The decisions in the menu's order, newest first. */
    rows: Decision[];
    edges: Edge[];
    lanes: Lane[];
    /** The lane each row sits on, or null for a lone dot. */
    laneOf: (Lane | null)[];
    /**
     * How many columns the graph takes, column 0 for the lone dots and the
     * reference column included.
     */
    columns: number;
    fallback: Fallback;
    /**
     * The most columns the graph may take; the lanes scroll at its width
     * when they outgrow it.
     */
    cap: number;
    /**
     * The column kept for the lit decision's links, next to the lone dots.
     * It stays empty while nothing is lit, and no lane ever takes it.
     */
    referenceColumn: number;
};

/** Which kind wins when the two sides of a link disagree. */
const KIND_RANK: Record<LinkKind, number> = {
    reference: 0,
    amend: 1,
    supersede: 2,
};

/**
 * The kind a link's wording stands for. Tools spell supersession "Supersedes",
 * "Supercedes" or "Overrides", in any case; a wording nobody knows is a
 * reference, the weakest claim a link can make.
 */
export function linkKind(wording: string): LinkKind {
    const text = wording.trim().toLowerCase();
    if (/super[sc]ed|overrid/.test(text)) return "supersede";
    if (/amend/.test(text)) return "amend";
    return "reference";
}

/**
 * One edge per linked pair, from the newer decision to the older, of the
 * stronger kind either side states. Links to decisions outside the set and
 * links to itself have nothing to draw, so they drop.
 */
function mergeEdges(rows: Decision[]): Edge[] {
    const rowOf = new Map(rows.map((row, index) => [row.id, index]));
    const pairs = new Map<string, Edge>();

    for (const [row, decision] of rows.entries()) {
        for (const link of decision.links ?? []) {
            const other = rowOf.get(link.id);
            if (other === undefined || other === row) continue;

            const edge: Edge = {
                from: Math.min(row, other),
                to: Math.max(row, other),
                kind: linkKind(link.description),
            };
            const key = `${edge.from}:${edge.to}`;
            const known = pairs.get(key);
            if (!known || KIND_RANK[edge.kind] > KIND_RANK[known.kind]) {
                pairs.set(key, edge);
            }
        }
    }

    return [...pairs.values()];
}

/** Whether a link's kind can continue a lane: supersede and amend can. */
const canContinue = (kind: LinkKind) => kind !== "reference";

/**
 * The run of decisions each row sits on, as the row of the run's oldest
 * decision, and the links that continue a run. Like a version control log
 * drawn as a graph, it walks the decisions oldest first: a decision that
 * supersedes or amends an older decision continues that decision's run while
 * nobody has continued it yet, preferring a supersede over an amend and then
 * the newest such decision. Otherwise it starts a run of its own. Every other
 * supersede or amend link joins the older decision's run instead.
 */
function runs(rows: Decision[], edges: Edge[]) {
    const runOf = rows.map((__, row) => row);
    const continued = new Set<number>();
    const continuing = new Set<Edge>();
    const linksOf = new Map<number, Edge[]>();
    for (const edge of edges) {
        if (!canContinue(edge.kind)) continue;
        linksOf.set(edge.from, [...(linksOf.get(edge.from) ?? []), edge]);
    }

    for (let row = rows.length - 1; row >= 0; row--) {
        const [link] = (linksOf.get(row) ?? [])
            .filter((edge) => !continued.has(edge.to))
            .sort(
                (a, b) => KIND_RANK[b.kind] - KIND_RANK[a.kind] || a.to - b.to,
            );
        if (!link) continue;
        runOf[row] = runOf[link.to];
        continued.add(link.to);
        continuing.add(link);
    }

    return { runOf, continuing };
}

/**
 * The lanes, without their columns yet. A run gets a lane when it has more
 * than one decision, when its decision supersedes or amends one it doesn't
 * continue, or when a later decision joins it: through a supersede or amend
 * link that doesn't continue it or, while `references` open lanes, through a
 * reference. The lane runs from its oldest decision up to its newest
 * decision or newest linker, whichever is newer.
 */
function openLanes(rows: Decision[], edges: Edge[], references: boolean) {
    const { runOf, continuing } = runs(rows, edges);
    const members = new Map<number, number[]>();
    const linkers = new Map<number, Set<number>>();
    const joiningOthers = new Set<number>();

    for (const [row, run] of runOf.entries()) {
        members.set(run, [...(members.get(run) ?? []), row]);
    }
    for (const edge of edges) {
        if (continuing.has(edge)) continue;
        if (canContinue(edge.kind)) joiningOthers.add(runOf[edge.from]);
        else if (!references) continue;
        if (runOf[edge.from] === runOf[edge.to]) continue;
        const run = runOf[edge.to];
        linkers.set(run, (linkers.get(run) ?? new Set()).add(edge.from));
    }

    const lanes: Lane[] = [];
    const laneOf: (Lane | null)[] = rows.map(() => null);
    for (const [run, rowsOfRun] of members) {
        const joining = [...(linkers.get(run) ?? [])].sort((a, b) => a - b);
        const linked =
            rowsOfRun.length > 1 ||
            joiningOthers.has(run) ||
            joining.length > 0;
        if (!linked) continue;

        const lane: Lane = {
            col: 0,
            top: Math.min(...rowsOfRun, ...joining),
            bottom: Math.max(...rowsOfRun),
            members: rowsOfRun,
            linkers: joining,
        };
        lanes.push(lane);
        for (const row of rowsOfRun) laneOf[row] = lane;
    }

    return { lanes, laneOf };
}

/**
 * Give each lane a column. Column 0 holds the lone dots, next to the titles,
 * and the columns below `first` stay out of the lanes' way. Lanes open to the
 * left of them, newest first, each in the lowest column free at its top row,
 * and a column comes back into use once its lane closes. Returns how many
 * columns the graph takes, column 0 and the kept columns included.
 */
function assignColumns(lanes: Lane[], first: number): number {
    // Newest first, and the longer lane first when two open on one row.
    lanes.sort((a, b) => a.top - b.top || b.bottom - a.bottom);

    const bottomOf: number[] = [];
    for (const lane of lanes) {
        let free = 0;
        while (free < bottomOf.length && bottomOf[free] >= lane.top) free++;
        bottomOf[free] = lane.bottom;
        lane.col = free + first;
    }

    return bottomOf.length + first;
}

/** The column kept for the lit decision's links, next to the lone dots. */
const REFERENCE_COLUMN = 1;

/**
 * The lanes and their columns, with or without references opening lanes.
 * Either way, the reference column stays free between the lone dots and the
 * lanes.
 */
function placeLanes(rows: Decision[], edges: Edge[], references: boolean) {
    const { lanes, laneOf } = openLanes(rows, edges, references);
    return {
        lanes,
        laneOf,
        columns: assignColumns(lanes, REFERENCE_COLUMN + 1),
    };
}

/**
 * The decisions related to one decision, in decision order: the decision
 * itself and every decision it links to or that links to it, the same links
 * its Status section lists. A decision missing from the set has no
 * relatives.
 */
export function relatedDecisions(
    decisions: Decision[],
    id: string,
): Decision[] {
    const rows = decisionOrder(decisions);
    const open = rows.findIndex((row) => row.id === id);
    if (open < 0) return [];

    const keep = new Set([open]);
    for (const edge of mergeEdges(rows)) {
        if (edge.from === open || edge.to === open) {
            keep.add(edge.from).add(edge.to);
        }
    }

    return rows.filter((__, row) => keep.has(row));
}

/**
 * Lay out the decision graph for a set of decisions: the menu's order, one
 * edge per linked pair, and a lane in its own column for every run of
 * decisions that supersede or amend one another, or that later decisions
 * link to. Every other decision is a lone dot in column 0, and column 1 stays
 * free for the lit decision's links.
 *
 * The graph takes at most `cap` columns. Past it, references stop opening
 * lanes; past it even then, the lanes scroll. The whole set decides this
 * once, so opening a decision or scrolling the menu never moves a column.
 */
export function layoutDecisionGraph(
    decisions: Decision[],
    cap = Number.POSITIVE_INFINITY,
): DecisionGraphLayout {
    const rows = decisionOrder(decisions);
    const edges = mergeEdges(rows);
    const base = { rows, edges, cap, referenceColumn: REFERENCE_COLUMN };

    const everyLane = placeLanes(rows, edges, true);
    if (everyLane.columns <= cap) {
        return { ...base, ...everyLane, fallback: "none" };
    }

    const linkLanes = placeLanes(rows, edges, false);
    return {
        ...base,
        ...linkLanes,
        fallback: linkLanes.columns <= cap ? "lineage" : "scroll",
    };
}

/**
 * What one decision lights up in the decision graph, by row: the open
 * decision in the menu, or the row a reader points at on the index.
 */
export type DecisionEdges = {
    row: number;
    /**
     * The decision's own links, both ways, farthest first: drawn in that
     * order along a lane or on the reference column, the nearest sits on top
     * where they overlap.
     */
    links: Edge[];
    /** The decision and the other end of each link; none without links. */
    dots: Set<number>;
};

/**
 * Whether a link joins the lane of the decision it links to. In a fallback,
 * a reference opens no lane, so it joins none.
 */
export function joinsLane(layout: DecisionGraphLayout, edge: Edge): boolean {
    return layout.fallback === "none" || edge.kind !== "reference";
}

/**
 * Whether a link continues a lane: its two decisions sit next to each other
 * on one lane, so it draws as the stretch between their dots. Any other
 * supersede or amend link joins the older decision's lane instead.
 */
export function continuesLane(
    layout: DecisionGraphLayout,
    edge: Edge,
): boolean {
    const lane = layout.laneOf[edge.from];
    if (!canContinue(edge.kind) || !lane || layout.laneOf[edge.to] !== lane) {
        return false;
    }
    const newer = lane.members.indexOf(edge.from);
    return lane.members[newer + 1] === edge.to;
}

/**
 * What a decision lights up: its own links, whatever their kind and either
 * way, and the dots at their ends. Nothing else lights, not even the rest of
 * its own lane; a decision with no links lights nothing, its own dot
 * included, so it reads as standing alone.
 */
export function edgesOfDecision(
    layout: DecisionGraphLayout,
    row: number,
): DecisionEdges {
    const reach = (edge: Edge) => edge.to - edge.from;
    const links = layout.edges
        .filter((edge) => edge.from === row || edge.to === row)
        .sort((a, b) => reach(b) - reach(a));

    const dots = new Set<number>();
    for (const edge of links) dots.add(edge.from).add(edge.to);

    return { row, links, dots };
}

/**
 * The columns of the lanes a decision's links reach, past the pinned columns
 * (the lone dots and the reference column): its own lane first, then the
 * rest nearest the titles first, each once. When the lanes scroll, these are
 * the lanes to bring into view, since the lit links start from their dots,
 * and the first wins when they don't all fit.
 */
export function laneColumnsOfDecision(
    layout: DecisionGraphLayout,
    row: number,
): number[] {
    const { laneOf } = layout;
    const col = (other: number) => laneOf[other]?.col ?? 0;
    const reached = edgesOfDecision(layout, row)
        .links.map((edge) => col(edge.from === row ? edge.to : edge.from))
        .sort((a, b) => a - b);

    return [...new Set([col(row), ...reached])].filter(
        (c) => c > layout.referenceColumn,
    );
}
