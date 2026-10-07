/**
 * The editing route (spec 4.6): the diagrams page's search with `mode=edit`
 * beside the view key, so a reload of a view in edit mode stays in editing.
 * Leaving `mode` out is the reading route.
 */

/** The search parameter that marks the editing route, and its value. */
const MODE_PARAM = "mode";
const EDITING = "edit";

/** Whether `search` is the editing route. A leading `?` is fine. */
export const isEditingRoute = (search: string) =>
    new URLSearchParams(search).get(MODE_PARAM) === EDITING;

/** `search` turned into the editing route of the view `key`. */
export function editingSearch(search: string, key: string): string {
    const params = new URLSearchParams(search);
    params.set("view", key);
    params.set(MODE_PARAM, EDITING);
    return params.toString();
}

/**
 * What the editing route says about a view before its first edit (spec 8):
 * a view without coordinates, or with unplaced elements, saves the positions
 * the engine shows. `null` for a stored layout, which says nothing.
 */
export function layoutNotice(
    layout: "automatic" | "stored" | "unplaced",
    unplaced: number,
): string | null {
    if (layout === "automatic")
        return "This view has no stored layout yet; your first edit saves the positions shown";
    if (layout === "unplaced")
        return `${unplaced} unplaced ${unplaced === 1 ? "element" : "elements"}; your first edit saves where they appear`;
    return null;
}

/** `search` turned into the reading route of the same view. */
export function readingSearch(search: string): string {
    const params = new URLSearchParams(search);
    params.delete(MODE_PARAM);
    return params.toString();
}
