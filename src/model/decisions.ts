/**
 * What every view of the decisions agrees on: their order, how a status reads
 * and how a number shows. The decisions page and the decision graph both draw
 * from these, so the menu, the pills and the dots can never disagree.
 */

import type { Decision } from "../types/structurizr-documentation";
import {
    type DocumentationScope,
    scopedId,
    WORKSPACE_SCOPE,
} from "./documentation";

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
function takenAt(decision: Pick<Decision, "date">): number {
    const time = new Date(decision.date ?? "").getTime();
    return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Newest first, and within the same date the higher number is the later
 * decision. Undated decisions run last, where the index groups them. Numbers
 * compare as numbers and any other id as text, so the order never depends on
 * the order the decisions arrive in, which it did while an undated decision
 * compared as NaN.
 *
 * A decision of a documentation scope compares by its own number, so the
 * scopes' decisions interleave; the same date and number fall back to the
 * address, so the order stays the same however they arrive.
 */
export function decisionOrder<D extends Decision>(decisions: D[]): D[] {
    const numberOf = (decision: D) =>
        (decision as Partial<ScopedDecision>).number ?? decision.id;
    return decisions.toSorted((a, b) => {
        const [newer, older] = [takenAt(b), takenAt(a)];
        if (newer !== older) return newer > older ? 1 : -1;
        return (
            numberOf(b).localeCompare(numberOf(a), "en", { numeric: true }) ||
            a.id.localeCompare(b.id, "en", { numeric: true })
        );
    });
}

/* ---------------------------------------------------- documentation scopes */

/**
 * A decision of one documentation scope, as the decisions page lists it
 * beside every other scope's. `id` is its address, the scope's slug path and
 * the decision's own id, so ids that repeat across scopes stay apart; its
 * links point at addresses of the same scope.
 */
export type ScopedDecision = Decision & {
    /** The documentation scope that carries it. */
    scope: DocumentationScope;
    /** Its own id, the number it shows. */
    number: string;
};

/**
 * The id a decision of `scope` is addressed by in `adr`: the scope's slug
 * path, then the decision's own id. The workspace scope adds nothing, so
 * the workspace's own decisions keep the addresses they always had.
 */
export function decisionAddress(
    scope: Pick<DocumentationScope, "path">,
    id: string,
): string {
    return scopedId(scope.path, id);
}

/** The address parameter that holds the decisions page's filter. */
export const FILTER_PARAM = "filter";

/**
 * What names the decisions of every documentation scope: the filter's
 * first entry, and a link to the unfiltered index after a middle dot.
 */
export const EVERY_SCOPE = "All documentation scopes";

/**
 * What `filter` holds for `scope`: its slug path, or for the workspace's own
 * Structurizr's name for it, `*`.
 */
export const scopeFilterOf = (scope: Pick<DocumentationScope, "path">) =>
    scope.path || WORKSPACE_SCOPE;

/**
 * Every documentation scope's decisions in decision order, each addressed
 * by its scope and id. A decision's links resolve inside its own scope, so
 * the decision graph's lanes never cross scopes; a link to an id its scope
 * does not hold drops.
 */
export function scopedDecisions(
    scopes: readonly DocumentationScope[],
): ScopedDecision[] {
    return decisionOrder(
        scopes.flatMap((scope) => {
            const ids = new Set(scope.decisions.map((d) => d.id));
            return scope.decisions.map(
                (decision): ScopedDecision => ({
                    ...decision,
                    id: decisionAddress(scope, decision.id),
                    number: decision.id,
                    scope,
                    links: (decision.links ?? [])
                        .filter((link) => ids.has(link.id))
                        .map((link) => ({
                            ...link,
                            id: decisionAddress(scope, link.id),
                        })),
                }),
            );
        }),
    );
}

/**
 * The decisions `filter` keeps: one scope's, named as `scopeFilterOf`
 * names it, or every scope's with no filter. A filter no scope answers to
 * keeps every scope's.
 */
export function filterByScope(
    decisions: readonly ScopedDecision[],
    filter: string | null,
): ScopedDecision[] {
    const kept = decisions.filter((d) => scopeFilterOf(d.scope) === filter);
    return filter && kept.length ? kept : [...decisions];
}

/** Whether `decisions` come from more than one documentation scope. */
export const mixesScopes = (decisions: readonly ScopedDecision[]) =>
    new Set(decisions.map((d) => d.scope)).size > 1;

/**
 * The hue of `scope`'s pill, from its place among `scopes`: a golden-angle
 * step apart, so neighbors in the list never look alike.
 */
export function scopeHue(
    scopes: readonly DocumentationScope[],
    scope: DocumentationScope,
): number {
    return Math.round((210 + scopes.indexOf(scope) * 137.5) % 360);
}

/** An entry of the decisions page's filter. */
export type ScopeFilterOption = {
    /** What `filter` holds for it; `""` for every scope. */
    value: string;
    label: string;
    /** How far the scope tree indents it among the scopes with decisions. */
    depth: number;
};

/**
 * The filter's entries: "All documentation scopes", then each scope that
 * carries decisions in model order, labeled with its type and count and
 * indented under the nearest scope above it that carries decisions.
 */
export function scopeFilterOptions(
    scopes: readonly DocumentationScope[],
): ScopeFilterOption[] {
    const byPath = new Map(scopes.map((scope) => [scope.path, scope]));
    const parentOf = (scope: DocumentationScope) =>
        scope.parent === null ? undefined : byPath.get(scope.parent);
    const depthOf = (scope: DocumentationScope) => {
        let depth = 0;
        for (let above = parentOf(scope); above; above = parentOf(above))
            if (above.decisions.length) depth += 1;
        return depth;
    };
    return [
        { value: "", label: EVERY_SCOPE, depth: 0 },
        ...scopes
            .filter((scope) => scope.decisions.length)
            .map((scope) => ({
                value: scopeFilterOf(scope),
                label: `[${scope.type}] ${scope.name} (${scope.decisions.length})`,
                depth: depthOf(scope),
            })),
    ];
}
