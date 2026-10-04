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
export type Step = {
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
    steps: Step[];
    /** `structurizr.zoomOnAnimation`: fit each step, and the view on stop. */
    zoom: boolean;
};

/**
 * The integer a placement's order stands for, or `undefined` when it has no
 * order or one Structurizr would not write: digits only, after trimming
 * (spec 11). Structurizr only generates integers and parallel sequences reuse
 * one; a non-integer explicit DSL order breaks upstream. Read as integers,
 * "1" and "01" are the same step. `validateWorkspace` in `scripts/assets.js`
 * mirrors the test, since the build cannot import TypeScript.
 */
export function orderOf(placement: { order?: unknown }): number | undefined {
    const text = String(placement.order ?? "").trim();
    return /^\d+$/.test(text) ? Number(text) : undefined;
}

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
        if (order === undefined || order === null) continue;
        if (orderOf(placement) !== undefined) continue;
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

/**
 * Whether `structurizr.zoomOnAnimation` is true for a view: its own value,
 * then its base's when it is filtered, then the view set's. The first one
 * set wins, so an explicit false holds against a true further down, as
 * Structurizr's `getViewOrViewSetProperty` reads it.
 */
function zoomOnAnimation(
    model: WorkspaceModel,
    ...views: (ModelView | undefined)[]
): boolean {
    const name = "structurizr.zoomOnAnimation";
    const value = [
        ...views.map((view) => view?.properties?.[name]),
        model.configuration.properties?.[name],
    ].find((set) => set !== undefined && set !== null && set !== "");
    return (
        String(value ?? "")
            .trim()
            .toLowerCase() === "true"
    );
}

/**
 * The animation `view` plays, or `undefined` when it plays none (spec 11):
 * every dynamic view with at least one ordered relationship, and a static
 * view with more than one `animations` entry.
 *
 * A dynamic view's steps are its distinct orders sorted as integers; every
 * relationship sharing an order belongs to that step, and a relationship
 * without an order belongs to none. A static view's steps are its entries
 * sorted by order, keeping only what the view draws; an entry without an
 * integer order takes its place in the list (1-based) as its order.
 */
export function animationOf(
    model: WorkspaceModel,
    view: ResolvedView,
): ViewAnimation | undefined {
    const base = view.filter
        ? model.findViewByKey(view.filter.baseViewKey)
        : view.view;
    const zoom = zoomOnAnimation(model, view.view, base);

    if (view.type === "Dynamic") {
        const byOrder = new Map<number, Step>();
        for (const placed of view.relationships) {
            const order = orderOf(placed);
            if (order === undefined) continue;
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
            order: orderOf(entry) ?? index + 1,
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
