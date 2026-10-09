/**
 * What every view of the decisions agrees on: their order, how a status reads
 * and how a number shows. The decisions page and the decision graph both draw
 * from these, so the menu, the pills and the dots can never disagree.
 */

import type { Decision } from "../types/structurizr-documentation";

/** The four states a decision can be in, as the page colors them. */
export type DecisionStatus = "draft" | "accepted" | "amended" | "superseded";

/**
 * The four states, plus the older spellings that mean the same thing.
 * "Amended" is a partial supersession: the decision still stands, but a later
 * one has changed part of it.
 */
export const DECISION_STATUS: Record<string, DecisionStatus> = {
    draft: "draft",
    proposed: "draft",
    accepted: "accepted",
    amended: "amended",
    superseded: "superseded",
    rejected: "superseded",
    deprecated: "superseded",
};

/** The state a status word stands for. A word nobody knows reads as a draft. */
export function decisionStatus(status = ""): DecisionStatus {
    return DECISION_STATUS[status.trim().toLowerCase()] ?? "draft";
}

/**
 * A decision's number as four digits, `7` as `0007`, so numbers line up down
 * the menu and read the same everywhere on the page. An id that is not a
 * number has nothing to pad and shows as written.
 */
export function decisionNumber(id: string): string {
    return /^\d+$/.test(id) ? id.padStart(4, "0") : id;
}

/**
 * When a decision was taken, for sorting. A decision with no date, or one
 * nobody can read, counts as older than every dated one.
 */
function takenAt(decision: Decision): number {
    const time = new Date(decision.date ?? "").getTime();
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Newest first, and within the same date the higher number is the later
 * decision. Undated decisions run last, where the index groups them. Numbers
 * compare as numbers and any other id as text, so the order never depends on
 * the order the decisions arrive in, which it did while an undated decision
 * compared as NaN.
 */
export function decisionOrder(decisions: Decision[]): Decision[] {
    return decisions.toSorted((a, b) => {
        const [newer, older] = [takenAt(b), takenAt(a)];
        if (newer !== older) return newer > older ? 1 : -1;
        return b.id.localeCompare(a.id, "en", { numeric: true });
    });
}
