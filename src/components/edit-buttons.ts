/**
 * The toolbar's way into and out of editing (spec 4.6, 17.1): a pencil that
 * opens the view's editing route, and in editing the edit toolbar, with
 * "Calculate layout", the three canvas commands, the save status, Save and
 * Done, which returns to reading. Only edit mode draws
 * them; builds compile this module out (ADR 15).
 */

import type { CanvasCommand } from "../engine/contract";
import type { ModelView, WorkspaceModel } from "../model";
import { whyNotEditable } from "../model/editable";
import type { SaveStatus } from "./edit-session";
import styles from "./current-view.module.css";
import pencilIcon from "bootstrap-icons/icons/pencil.svg?raw";
import decreaseIcon from "bootstrap-icons/icons/arrows-angle-contract.svg?raw";
import increaseIcon from "bootstrap-icons/icons/arrows-angle-expand.svg?raw";
import autoIcon from "bootstrap-icons/icons/bounding-box.svg?raw";
import calculateIcon from "bootstrap-icons/icons/diagram-3.svg?raw";

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
    /** Where saving stands (spec 7.4). */
    status(): SaveStatus;
    /** Save what waits, now. */
    save(): void;
    /**
     * What the editing route of view `key` says before its first edit, or
     * `null`: a view without coordinates saves the positions shown (spec 8).
     */
    notice(key: string): string | null;
    /**
     * Run a canvas command on the view shown (spec 14), re-centering the
     * content unless `recenter` is false.
     */
    resizeCanvas(command: CanvasCommand, recenter: boolean): void;
    /** Open the "Calculate layout" dialog (spec 15). */
    calculateLayout(): void;
};

/** The canvas commands' buttons, each with what its tooltip says. */
const CANVAS_BUTTONS: [CanvasCommand, string, string][] = [
    ["decrease", "Decrease the canvas size", decreaseIcon],
    ["increase", "Increase the canvas size", increaseIcon],
    ["auto", "Fit the canvas to the diagram", autoIcon],
];

/** What every canvas button's tooltip adds: Alt keeps the content in place. */
const RECENTER_HINT = "hold Alt to keep the diagram where it is";

/** Whether shortcuts read the macOS way (spec 17.1). */
const isMac = () =>
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** The Save shortcut in the platform's notation. */
const saveShortcut = () => (isMac() ? "⌘S" : "Ctrl+S");

/** What the save status reads for each state (spec 17.1). */
const STATUS_TEXT: Record<SaveStatus["state"], string> = {
    saved: "Saved",
    unsaved: "Unsaved changes",
    saving: "Saving…",
    failed: "Save failed",
};

/**
 * Paint `status` on the edit toolbar under `root`: the status text, with
 * the reason a save failed, and Save, enabled while changes wait.
 */
export function paintSaveStatus(root: ParentNode, status: SaveStatus) {
    const label = root.querySelector<HTMLElement>(".save-status");
    if (label) {
        const text = STATUS_TEXT[status.state];
        label.textContent = status.reason ? `${text}: ${status.reason}` : text;
        label.title = status.reason ?? "";
        label.dataset.state = status.state;
    }
    const save = root.querySelector<HTMLButtonElement>(".save-layout");
    if (save) save.disabled = !status.waiting || status.state === "saving";
}

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
        const save = `Save (${saveShortcut()})`;
        const calculate = "Calculate layout";
        group.innerHTML = `
            <button type="button" class="calculate-layout" title="${calculate}" aria-label="${calculate}">${calculateIcon}</button>
            ${CANVAS_BUTTONS.map(
                ([command, label, icon]) =>
                    `<button type="button" class="resize-canvas" data-command="${command}" title="${label} (${RECENTER_HINT})" aria-label="${label}">${icon}</button>`,
            ).join("")}
            <span class="save-status ${styles.saveStatus}" role="status" aria-live="polite"></span>
            <button type="button" class="save-layout ${styles.done}" title="${save}" aria-label="${save}">Save</button>
            <button type="button" class="done-editing ${styles.done}">Done</button>
        `;
        group
            .querySelector(".calculate-layout")
            ?.addEventListener("click", () => route.calculateLayout());
        for (const button of group.querySelectorAll<HTMLButtonElement>(
            ".resize-canvas",
        )) {
            // Alt held keeps the content where it is (spec 14).
            button.addEventListener("click", (event) =>
                route.resizeCanvas(
                    button.dataset.command as CanvasCommand,
                    !event.altKey,
                ),
            );
        }
        group
            .querySelector(".save-layout")
            ?.addEventListener("click", () => route.save());
        group
            .querySelector(".done-editing")
            ?.addEventListener("click", () => route.done());
        paintSaveStatus(group, route.status());
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
