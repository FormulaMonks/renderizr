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
    /** The rows that supersede or amend one another along the lane. */
    members: number[];
    /** The rows that reference a member and join the lane with an elbow. */
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

/**
 * Lay out the decision graph for a set of decisions. Lanes do not open yet:
 * every decision is a lone dot in column 0, which is all the collapsed graph
 * draws.
 */
export function layoutDecisionGraph(
    decisions: Decision[],
): DecisionGraphLayout {
    const rows = decisionOrder(decisions);

    return {
        rows,
        edges: mergeEdges(rows),
        lanes: [],
        laneOf: rows.map(() => null),
        columns: 1,
        fallback: "none",
        referenceColumn: null,
    };
}
