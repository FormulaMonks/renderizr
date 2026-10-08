/**
 * Which views edit mode changes the layout of (spec 8). Edit mode edits a
 * stored layout only: a view with an automatic layout, a filtered view (which
 * takes its layout from its base view) and an image view (which has none)
 * stay read-only.
 */

import type { ModelView } from "./types";

/** Why edit mode leaves a view read-only. */
export type NotEditableReason = "automaticLayout" | "filtered" | "image";

/**
 * Why edit mode leaves `view` read-only, or `null` when it can edit it.
 *
 * Any `automaticLayout` makes a view automatic, in the structurizr-java 5
 * shape (`implementation` and `applied`) and the Structurizr 2026 shape
 * (neither). Edit mode ignores `applied`, whatever its value: the engine lays
 * an automatic view out again on every render, so a stored position would
 * never show.
 */
export function whyNotEditable(view: ModelView): NotEditableReason | null {
    if (view.type === "Image") return "image";
    if (view.type === "Filtered") return "filtered";
    if (view.automaticLayout) return "automaticLayout";
    return null;
}

/** Whether edit mode can change the layout of `view` (spec 8). */
export const isEditable = (view: ModelView) => whyNotEditable(view) === null;
