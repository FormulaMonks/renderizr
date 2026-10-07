/**
 * Edited layouts (glossary): a view's layout fields as changed this session,
 * laid over its stored layout until saved (ADR 18). The page's edit session
 * holds them, the engine draws them and edit mode's writer saves them.
 *
 * Elements carry `x` and `y`, by element id, in model units with the top-left
 * as the origin. Relationships carry their route by relationship key (see
 * `relationshipKey`). The view carries its canvas: `dimensions`, and
 * `paperSize` once a canvas command deletes it (spec 14).
 */

import type { Vertex } from "./types";

/** The size of a view's canvas, in model units (spec 14). */
export type Dimensions = { width: number; height: number };

/**
 * A relationship's edited route. An empty `vertices` clears the stored
 * ones, so the edge falls back to avoidance (ADR 7).
 */
export type EditedRoute = {
    vertices?: readonly Vertex[];
};

/** One view's edited layout. */
export type EditedLayout = {
    elements?: Readonly<Record<string, Vertex>>;
    /** By relationship key: the id, then `id#1`, `id#2` for repeats. */
    relationships?: Readonly<Record<string, EditedRoute>>;
    dimensions?: Dimensions;
    /**
     * `null` once Decrease or Increase deletes the view's paper size; the
     * name of one when undo brings it back (spec 14).
     */
    paperSize?: string | null;
};

/**
 * The key of the `repeat`th listing (counting from 0) of relationship `id`
 * in a view. A dynamic view may list one relationship at several orders,
 * each with a route of its own; the first listing goes by the id alone.
 */
export const relationshipKey = (id: string, repeat: number) =>
    repeat === 0 ? id : `${id}#${repeat}`;

/**
 * One finished gesture or command on a view (spec 9.2): the fields it
 * changed, as drawn before (`before`, values the engine computed included)
 * and after it. One change is one undo step.
 */
export type LayoutChange = {
    view: string;
    before: EditedLayout;
    after: EditedLayout;
};

/** `base` with every field `next` sets taken from `next`. */
export function mergeLayouts(
    base: EditedLayout | undefined,
    next: EditedLayout,
): EditedLayout {
    const merged: EditedLayout = {};
    if (base?.elements || next.elements)
        merged.elements = { ...base?.elements, ...next.elements };
    if (base?.relationships || next.relationships) {
        const relationships: Record<string, EditedRoute> = {
            ...base?.relationships,
        };
        for (const [key, route] of Object.entries(next.relationships ?? {}))
            relationships[key] = { ...relationships[key], ...route };
        merged.relationships = relationships;
    }
    const dimensions = next.dimensions ?? base?.dimensions;
    if (dimensions) merged.dimensions = dimensions;
    if (next.paperSize !== undefined) merged.paperSize = next.paperSize;
    else if (base?.paperSize !== undefined) merged.paperSize = base.paperSize;
    return merged;
}

/** Whether `layout` changes no field. */
export const isEmptyLayout = (layout: EditedLayout) =>
    Object.keys(layout.elements ?? {}).length === 0 &&
    Object.keys(layout.relationships ?? {}).length === 0 &&
    layout.dimensions === undefined &&
    layout.paperSize === undefined;
