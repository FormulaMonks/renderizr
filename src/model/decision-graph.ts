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
    /** The rows that supersede or amend one another, newest first. */
    members: number[];
    /**
     * The rows that reference a member and join the lane, newest first and
     * each once.
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
    /** How many columns the graph takes, column 0 for the lone dots included. */
    columns: number;
    fallback: Fallback;
    /** The column kept for the open decision's references in a fallback. */
    referenceColumn: number | null;
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

/** Supersede and amend continue a lane; a reference only joins one. */
const continuesLane = (kind: LinkKind) => kind !== "reference";

/**
 * The lineage of every row, as the row of one of its decisions: supersede and
 * amend join decisions into one lineage, so a decision's whole history runs
 * along one lane.
 */
function lineages(rows: Decision[], edges: Edge[]): number[] {
    const parent = rows.map((__, row) => row);
    const find = (row: number): number => {
        let root = row;
        while (parent[root] !== root) {
            parent[root] = parent[parent[root]];
            root = parent[root];
        }
        return root;
    };

    for (const edge of edges) {
        if (continuesLane(edge.kind)) parent[find(edge.from)] = find(edge.to);
    }

    return rows.map((__, row) => find(row));
}

/**
 * The lanes, without their columns yet. A lineage gets a lane when it has
 * more than one decision or when a later decision references one of its
 * decisions; the lane runs from its oldest decision up to its newest decision
 * or newest linker, whichever is newer.
 */
function openLanes(rows: Decision[], edges: Edge[]) {
    const lineageOf = lineages(rows, edges);
    const members = new Map<number, number[]>();
    const linkers = new Map<number, Set<number>>();

    for (const [row, lineage] of lineageOf.entries()) {
        members.set(lineage, [...(members.get(lineage) ?? []), row]);
    }
    for (const edge of edges) {
        if (
            continuesLane(edge.kind) &&
            lineageOf[edge.from] === lineageOf[edge.to]
        ) {
            continue;
        }
        const lineage = lineageOf[edge.to];
        linkers.set(
            lineage,
            (linkers.get(lineage) ?? new Set()).add(edge.from),
        );
    }

    const lanes: Lane[] = [];
    const laneOf: (Lane | null)[] = rows.map(() => null);
    for (const [lineage, rowsOfLineage] of members) {
        const joining = [...(linkers.get(lineage) ?? [])].sort((a, b) => a - b);
        if (rowsOfLineage.length < 2 && joining.length === 0) continue;

        const lane: Lane = {
            col: 0,
            top: Math.min(...rowsOfLineage, ...joining),
            bottom: Math.max(...rowsOfLineage),
            members: rowsOfLineage,
            linkers: joining,
        };
        lanes.push(lane);
        for (const row of rowsOfLineage) laneOf[row] = lane;
    }

    return { lanes, laneOf };
}

/**
 * Give each lane a column. Column 0 holds the lone dots, next to the titles.
 * Lanes open to the left of it, newest first, each in the lowest column free
 * at its top row, and a column comes back into use once its lane closes.
 * Returns how many columns the graph takes, column 0 included.
 */
function assignColumns(lanes: Lane[]): number {
    // Newest first, and the longer lane first when two open on one row.
    lanes.sort((a, b) => a.top - b.top || b.bottom - a.bottom);

    const bottomOf: number[] = [];
    for (const lane of lanes) {
        let free = 0;
        while (free < bottomOf.length && bottomOf[free] >= lane.top) free++;
        bottomOf[free] = lane.bottom;
        lane.col = free + 1;
    }

    return bottomOf.length + 1;
}

/**
 * Lay out the decision graph for a set of decisions: the menu's order, one
 * edge per linked pair, and a lane in its own column for every lineage that
 * later decisions link to. Every other decision is a lone dot in column 0.
 */
export function layoutDecisionGraph(
    decisions: Decision[],
): DecisionGraphLayout {
    const rows = decisionOrder(decisions);
    const edges = mergeEdges(rows);
    const { lanes, laneOf } = openLanes(rows, edges);
    const columns = assignColumns(lanes);

    return {
        rows,
        edges,
        lanes,
        laneOf,
        columns,
        fallback: "none",
        referenceColumn: null,
    };
}

/** A stretch of another decision's lane, by row: from a join down to `to`. */
export type LaneStretch = { lane: Lane; from: number; to: number };

/**
 * What one decision lights up in the decision graph, by row: the open
 * decision in the menu, or the row a reader points at on the index.
 */
export type DecisionEdges = {
    row: number;
    /** The decision's own links, both ways. */
    links: Edge[];
    /** Its lineage's lane, which lights in full, or null for a lone dot. */
    lane: Lane | null;
    /** Its links, and every link that joins its lane. */
    edges: Set<Edge>;
    /**
     * Of each other lane it joins, the stretch from its join down to the
     * oldest decision it links to there, so the light never ends at a
     * decision it does not link to.
     */
    stretches: LaneStretch[];
    /** The decision, the decisions it links to and its lane's decisions. */
    dots: Set<number>;
};

/**
 * What a decision lights up: its own lineage's lane with every join on it,
 * its own joins into other lanes and, of each such lane, only the stretch
 * down to the decision it links to. Everything else dims; a decision with no
 * links lights only its own dot.
 */
export function edgesOfDecision(
    layout: DecisionGraphLayout,
    row: number,
): DecisionEdges {
    const { edges, laneOf } = layout;
    const lane = laneOf[row] ?? null;
    const links = edges.filter((edge) => edge.from === row || edge.to === row);

    const stretches = new Map<Lane, LaneStretch>();
    for (const edge of links) {
        const other = laneOf[edge.to];
        if (edge.from !== row || !other || other === lane) continue;
        const known = stretches.get(other);
        if (!known || edge.to > known.to) {
            stretches.set(other, { lane: other, from: row, to: edge.to });
        }
    }

    const dots = new Set([row]);
    for (const edge of links) dots.add(edge.from).add(edge.to);
    for (const member of lane?.members ?? []) dots.add(member);

    return {
        row,
        links,
        lane,
        edges: new Set([
            ...links,
            ...edges.filter((edge) => lane && laneOf[edge.to] === lane),
        ]),
        stretches: [...stretches.values()],
        dots,
    };
}
