/**
 * The toolbar's way into and out of editing (spec 4.6): a pencil that opens
 * the view's editing route, and Done, which returns to reading. Only edit
 * mode draws them; builds compile this module out (ADR 15).
 */

import type { ModelView, WorkspaceModel } from "../model";
import { whyNotEditable } from "../model/editable";
import styles from "./current-view.module.css";
import pencilIcon from "bootstrap-icons/icons/pencil.svg?raw";

/** What the toolbar needs from the editing route the page owns. */
export type EditingRoute = {
    /** Whether the page shows the editing route now. */
    isEditing(): boolean;
    /** Open the editing route of the view `key`. */
    edit(key: string): void;
    /** Return to the reading route of the view shown. */
    done(): void;
    /** The link to the editing route of the view `key`. */
    href(key: string): string;
};

/** The reason the pencil gives on a view with an automatic layout (spec 4.6). */
const AUTOMATIC_LAYOUT_REASON =
    "This view uses automatic layout; remove `autoLayout` from the DSL to edit it.";

const escapeAttribute = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The pencil, or Done in editing, for `view`, as a button group; `null` for
 * an image view, which has no layout to edit. A pencil that edit mode can't
 * follow stays in the toolbar, disabled, and says why; on a filtered view it
 * links to the base view's editing route instead.
 */
export function editButtons(
    view: ModelView,
    model: WorkspaceModel,
    route: EditingRoute,
): HTMLElement | null {
    const reason = whyNotEditable(view);
    if (reason === "image") return null;

    const group = document.createElement("div");
    group.className = `edit-buttons ${styles.btnGroup}`;

    if (route.isEditing() && reason === null) {
        group.innerHTML = `<button type="button" class="done-editing ${styles.done}">Done</button>`;
        group
            .querySelector("button")
            ?.addEventListener("click", () => route.done());
        return group;
    }

    if (reason === null) {
        group.innerHTML = `<button type="button" class="edit-view" title="Edit the layout" aria-label="Edit the layout">${pencilIcon}</button>`;
        group
            .querySelector("button")
            ?.addEventListener("click", () => route.edit(view.key));
        return group;
    }

    // `aria-disabled` rather than `disabled`, so the pencil keeps its focus
    // and its tooltip, which is where the reason is.
    if (reason === "automaticLayout") {
        group.innerHTML = `<button type="button" class="edit-view" aria-disabled="true" title="${escapeAttribute(AUTOMATIC_LAYOUT_REASON)}" aria-label="Edit the layout. ${escapeAttribute(AUTOMATIC_LAYOUT_REASON)}">${pencilIcon}</button>`;
        return group;
    }

    const base = model.findViewByKey(view.baseViewKey);
    const baseTitle = base ? model.getTitleForView(base) : view.baseViewKey;
    const why = `This is a filtered view of ${baseTitle}; edit the layout there.`;
    group.innerHTML = `
        <button type="button" class="edit-view" aria-disabled="true" title="${escapeAttribute(why)}" aria-label="Edit the layout. ${escapeAttribute(why)}">${pencilIcon}</button>
        ${
            base
                ? `<a class="edit-base-view ${styles.editBase}" href="${escapeAttribute(route.href(base.key))}" title="${escapeAttribute(`Edit the layout of ${baseTitle}`)}">Edit base view</a>`
                : ""
        }
    `;
    return group;
}
