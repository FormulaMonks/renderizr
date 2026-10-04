/**
 * Animation in the model layer (spec 11): which steps a view plays, and the
 * check that a dynamic view's orders are integers (spec 13). The engine works
 * out what each step shows from these; nothing here knows about drawing.
 */

import type { ResolvedView } from "./resolve-view";
import type { ModelView } from "./types";
import type { WorkspaceModel } from "./workspace";

/**
 * One step of an animation (spec 11). In a dynamic view, every relationship
 * sharing one order and the elements at their ends; in a static view, one
 * entry of the view's `animations` list, which adds to what earlier steps
 * revealed.
 */
export type AnimationStep = {
    /** The order, as an integer: what the steps are sorted by. */
    order: number;
    /** The elements the step shows, in view order. */
    elements: string[];
    /** The relationships the step shows, by id, in view order. */
    relationships: string[];
};

export type ViewAnimation = {
    /** A dynamic view highlights one step; a static view reveals up to it. */
    kind: "dynamic" | "static";
    /** At least one; sorted by order. */
    steps: AnimationStep[];
    /** `structurizr.zoomOnAnimation`: fit each step, and the view on stop. */
    zoom: boolean;
};

/**
 * Whether `order` is one Structurizr would write: digits only, after trimming
 * (spec 11). Structurizr only generates integers and parallel sequences reuse
 * one; a non-integer explicit DSL order breaks upstream.
 */
export const isIntegerOrder = (order: unknown) =>
    /^\d+$/.test(String(order).trim());

const orderOf = (order: unknown) => Number(String(order).trim());

/**
 * Why a dynamic view's orders cannot be drawn, or `undefined` when they can:
 * the first relationship whose order isn't an integer. `validateWorkspace` in
 * `scripts/assets.js` says the same, and `test/animation.test.js` holds the
 * two to it (spec 13).
 */
export function findOrderError(
    model: WorkspaceModel,
    view: ModelView,
): string | undefined {
    if (view.type !== "Dynamic") return undefined;
    for (const placement of view.relationships ?? []) {
        const { order } = placement;
        if (order === undefined || order === null || isIntegerOrder(order)) {
            continue;
        }
        const relationship = model.findRelationshipById(placement.id);
        const name = (id: string | undefined) =>
            (id && model.findElementById(id)?.name) || id;
        const label = relationship
            ? `${name(relationship.sourceId)} → ${name(relationship.destinationId)}`
            : placement.id;
        return `Dynamic view "${view.key}": relationship "${label}" has order "${placement.order}"; orders must be integers.`;
    }
    return undefined;
}

/** Whether a view's `structurizr.zoomOnAnimation` property is set to true. */
const zoomOnAnimation = (view: ModelView | undefined) =>
    String(view?.properties?.["structurizr.zoomOnAnimation"] ?? "")
        .trim()
        .toLowerCase() === "true";

/**
 * The animation `view` plays, or `undefined` when it plays none (spec 11):
 * every dynamic view with at least one ordered relationship, and a static
 * view with more than one `animations` entry.
 *
 * A dynamic view's steps are its distinct orders sorted as integers; every
 * relationship sharing an order belongs to that step, and a relationship
 * without an order belongs to none. A static view's steps are its entries
 * sorted by order, keeping only what the view draws.
 */
export function animationOf(
    model: WorkspaceModel,
    view: ResolvedView,
): ViewAnimation | undefined {
    const base = view.filter
        ? model.findViewByKey(view.filter.baseViewKey)
        : view.view;
    const zoom = zoomOnAnimation(view.view) || zoomOnAnimation(base);

    if (view.type === "Dynamic") {
        const byOrder = new Map<number, AnimationStep>();
        for (const placed of view.relationships) {
            if (placed.order === undefined || !isIntegerOrder(placed.order)) {
                continue;
            }
            const order = orderOf(placed.order);
            const step = byOrder.get(order) ?? {
                order,
                elements: [],
                relationships: [],
            };
            byOrder.set(order, step);
            step.relationships.push(placed.id);
            const { sourceId, destinationId } = placed.relationship;
            for (const id of [sourceId, destinationId]) {
                if (!step.elements.includes(id)) step.elements.push(id);
            }
        }
        if (byOrder.size === 0) return undefined;
        const steps = [...byOrder.values()].sort((a, b) => a.order - b.order);
        for (const step of steps) step.elements.sort(byViewOrder(view));
        return { kind: "dynamic", steps, zoom };
    }

    const entries = base?.animations ?? [];
    if (entries.length < 2) return undefined;
    const drawnElements = new Set(view.elements.map((e) => e.id));
    const drawnRelationships = new Set(view.relationships.map((r) => r.id));
    const steps = entries
        .map((entry, index) => ({
            order: Number(entry.order ?? index + 1),
            elements: (entry.elements ?? []).filter((id) =>
                drawnElements.has(id),
            ),
            relationships: (entry.relationships ?? []).filter((id) =>
                drawnRelationships.has(id),
            ),
        }))
        .sort((a, b) => a.order - b.order);
    return { kind: "static", steps, zoom };
}

/** Compare element ids by where the view lists them. */
function byViewOrder(view: ResolvedView) {
    const index = new Map(view.elements.map((e, i) => [e.id, i]));
    return (a: string, b: string) =>
        (index.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (index.get(b) ?? Number.MAX_SAFE_INTEGER);
}
