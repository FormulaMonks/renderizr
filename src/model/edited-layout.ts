/**
 * Edited layouts (glossary): a view's layout fields as changed this session,
 * laid over its stored layout until saved (ADR 18). The page's edit session
 * holds them, the engine draws them and edit mode's writer saves them.
 *
 * Elements carry `x` and `y`, by element id, in model units with the top-left
 * as the origin. Relationship fields and the view's `dimensions` join this
 * type as edit mode learns to change them.
 */

import type { Vertex } from "./types";

/** One view's edited layout. */
export type EditedLayout = {
    elements?: Readonly<Record<string, Vertex>>;
};

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
    return {
        elements: { ...base?.elements, ...next.elements },
    };
}
