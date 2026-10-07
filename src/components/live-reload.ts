/**
 * Live reload on the diagrams page (spec 6.2, 6.3): what a workspace that
 * arrived from disk means for the edit session. Only edit mode reaches it;
 * builds compile it out (ADR 15).
 */

import {
    type EditedLayout,
    type EditedRoute,
    relationshipKey,
} from "../model/edited-layout";
import { resolveView } from "../model/resolve-view";
import type { Vertex } from "../model/types";
import type { WorkspaceModel } from "../model/workspace";

/**
 * What view `key` of `model` draws from: each member with what it names
 * and where it sits, and the canvas. Two workspaces give a view the same
 * signature only when they leave its members and stored layout alone, so
 * an id that now names another element counts as a change (spec 6.3).
 * `null` when the workspace has no such view.
 */
export function viewSignature(
    model: WorkspaceModel,
    key: string,
): string | null {
    const view = model.findViewByKey(key);
    if (!view) return null;
    const element = (id: string) => {
        const found = model.findElementById(id);
        return found && [found.type, found.name, found.parentId];
    };
    return JSON.stringify([
        view.elements?.map(({ id, x, y }) => [id, x, y, element(id)]),
        view.relationships?.map(
            ({ id, order, vertices, routing, position, jump }) => {
                const found = model.findRelationshipById(id);
                return [
                    id,
                    order,
                    vertices,
                    routing,
                    position,
                    jump,
                    found && [
                        found.sourceId,
                        found.destinationId,
                        found.description,
                    ],
                ];
            },
        ),
        view.dimensions,
        view.paperSize,
        view.automaticLayout,
        view.baseViewKey,
    ]);
}

/** Each relationship of a resolved view with its key, repeats counted. */
function keyed<T extends { id: string }>(relationships: readonly T[]) {
    const repeats = new Map<string, number>();
    return relationships.map((relationship) => {
        const repeat = repeats.get(relationship.id) ?? 0;
        repeats.set(relationship.id, repeat + 1);
        return [
            relationshipKey(relationship.id, repeat),
            relationship,
        ] as const;
    });
}

const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * The edits in `layout` of view `key`, which `before` drew, laid over
 * `after` by id (spec 6.2): only the elements and relationships the view
 * still draws, and only the fields the author changed from what `before`
 * stores. A view's first edit carries every element (spec 9.2), and the
 * ones the author never moved take the file's layout. Empty when `after`
 * has no such view.
 */
export function heldEdits(
    before: WorkspaceModel,
    after: WorkspaceModel,
    key: string,
    layout: EditedLayout,
): EditedLayout {
    const view = resolveView(after, key);
    if (!view) return {};
    const was = resolveView(before, key);
    const placed = new Map(was?.elements.map((e) => [e.id, e]));
    const routed = new Map(keyed(was?.relationships ?? []));

    const held: EditedLayout = {};
    const elements: Record<string, Vertex> = {};
    for (const { id } of view.elements) {
        const at = layout.elements?.[id];
        const stored = placed.get(id);
        if (at && !(stored && stored.x === at.x && stored.y === at.y))
            elements[id] = at;
    }
    if (Object.keys(elements).length > 0) held.elements = elements;

    const relationships: Record<string, EditedRoute> = {};
    for (const [routeKey] of keyed(view.relationships)) {
        const route = layout.relationships?.[routeKey];
        if (!route) continue;
        const stored = routed.get(routeKey);
        const changed = Object.fromEntries(
            Object.entries(route).filter(
                ([field, value]) =>
                    !same(stored?.[field as keyof EditedRoute], value),
            ),
        );
        if (Object.keys(changed).length > 0) relationships[routeKey] = changed;
    }
    if (Object.keys(relationships).length > 0)
        held.relationships = relationships;

    const canvas = was && before.findViewByKey(key);
    if (layout.dimensions && !same(canvas?.dimensions, layout.dimensions))
        held.dimensions = layout.dimensions;
    if (
        layout.paperSize !== undefined &&
        (canvas?.paperSize ?? null) !== layout.paperSize
    )
        held.paperSize = layout.paperSize;
    return held;
}
