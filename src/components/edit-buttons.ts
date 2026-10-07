/**
 * The toolbar's way into and out of editing (spec 4.6, 17.1): a pencil that
 * opens the view's editing route, and in editing the edit toolbar, in
 * groups: align and distribute; the routing-mode button while an edge is
 * selected; undo and redo; "Calculate layout" and the
 * three canvas commands; the keyboard button, the save status, Save and
 * Done, which returns to reading. Every button with a shortcut names it in
 * its tooltip. Only edit mode draws them; builds compile this module out
 * (ADR 15).
 */

import type {
    AlignEdge,
    CanvasCommand,
    DistributeAxis,
    SelectionState,
} from "../engine/contract";
import { ALIGN_MINIMUM, DISTRIBUTE_MINIMUM } from "../engine/geometry/arrange";
import type { ModelView, WorkspaceModel } from "../model";
import { whyNotEditable } from "../model/editable";
import type { SaveStatus } from "./edit-session";
import { notation, SHORTCUTS } from "./shortcuts";
import styles from "./current-view.module.css";
import pencilIcon from "bootstrap-icons/icons/pencil.svg?raw";
import decreaseIcon from "bootstrap-icons/icons/arrows-angle-contract.svg?raw";
import increaseIcon from "bootstrap-icons/icons/arrows-angle-expand.svg?raw";
import autoIcon from "bootstrap-icons/icons/bounding-box.svg?raw";
import calculateIcon from "bootstrap-icons/icons/diagram-3.svg?raw";
import alignLeftIcon from "bootstrap-icons/icons/align-start.svg?raw";
import alignCenterIcon from "bootstrap-icons/icons/align-center.svg?raw";
import alignRightIcon from "bootstrap-icons/icons/align-end.svg?raw";
import alignTopIcon from "bootstrap-icons/icons/align-top.svg?raw";
import alignMiddleIcon from "bootstrap-icons/icons/align-middle.svg?raw";
import alignBottomIcon from "bootstrap-icons/icons/align-bottom.svg?raw";
import distributeHorizontalIcon from "bootstrap-icons/icons/distribute-horizontal.svg?raw";
import distributeVerticalIcon from "bootstrap-icons/icons/distribute-vertical.svg?raw";
import undoIcon from "bootstrap-icons/icons/arrow-counterclockwise.svg?raw";
import redoIcon from "bootstrap-icons/icons/arrow-clockwise.svg?raw";
import keyboardIcon from "bootstrap-icons/icons/keyboard.svg?raw";
import directIcon from "bootstrap-icons/icons/arrow-up-right.svg?raw";
import orthogonalIcon from "bootstrap-icons/icons/arrow-90deg-right.svg?raw";
import curvedIcon from "bootstrap-icons/icons/bezier2.svg?raw";

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
    /** Align the selection on the view shown (spec 13.1). */
    align(edge: AlignEdge): void;
    /** Distribute the selection on the view shown (spec 13.2). */
    distribute(axis: DistributeAxis): void;
    /** Undo the last change to the view shown (spec 16). */
    undo(): void;
    /** Redo the last change undone on the view shown (spec 16). */
    redo(): void;
    /** Open "Keyboard shortcuts" (spec 17.2). */
    showShortcuts(): void;
    /** What the edit toolbar enables its buttons from, now. */
    editState(): EditState;
    /** The selected edge, or `null` (spec 12.1). */
    edge(): SelectionState["edge"];
    /** Set the selected edge's routing mode (spec 12.2). */
    setRouting(mode: Routing): void;
};

/** A routing mode, as the selected edge reports it. */
type Routing = NonNullable<SelectionState["edge"]>["routing"];

/**
 * Each routing mode's icon and the mode a click moves to: Direct,
 * Orthogonal, Curved and round again (spec 12.2).
 */
const ROUTINGS: Record<Routing, { icon: string; next: Routing }> = {
    Direct: { icon: directIcon, next: "Orthogonal" },
    Orthogonal: { icon: orthogonalIcon, next: "Curved" },
    Curved: { icon: curvedIcon, next: "Direct" },
};

/**
 * Paint the routing-mode button on the edit toolbar under `root` for the
 * selected `edge` (spec 12.2): hidden with no edge selected, otherwise the
 * icon of the mode the edge is drawn in, named in its tooltip and its
 * accessible label. It has no shortcut (spec 12.2).
 */
export function paintRouting(root: ParentNode, edge: SelectionState["edge"]) {
    const button = root.querySelector<HTMLButtonElement>(".routing-mode");
    if (!button) return;
    button.hidden = edge === null;
    if (!edge) return;
    const { icon, next } = ROUTINGS[edge.routing];
    const label = `Routing mode: ${edge.routing}`;
    button.dataset.next = next;
    button.title = `${label} (click for ${next})`;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
}

/**
 * What the edit toolbar enables its buttons from: how many elements are
 * selected, and whether the view shown has a step to undo and to redo.
 */
export type EditState = { selected: number; undo: boolean; redo: boolean };

/** The align buttons: each edge, what it does and its icon (spec 13.1). */
const ALIGN_BUTTONS: [AlignEdge, string, string][] = [
    ["left", "Align left", alignLeftIcon],
    ["center", "Align horizontal centers", alignCenterIcon],
    ["right", "Align right", alignRightIcon],
    ["top", "Align top", alignTopIcon],
    ["middle", "Align vertical centers", alignMiddleIcon],
    ["bottom", "Align bottom", alignBottomIcon],
];

/** The distribute buttons (spec 13.2). */
const DISTRIBUTE_BUTTONS: [DistributeAxis, string, string][] = [
    ["horizontal", "Distribute horizontally", distributeHorizontalIcon],
    ["vertical", "Distribute vertically", distributeVerticalIcon],
];

/** The canvas commands' buttons, each with what its tooltip says. */
const CANVAS_BUTTONS: [CanvasCommand, string, string][] = [
    ["decrease", "Decrease the canvas size", decreaseIcon],
    ["increase", "Increase the canvas size", increaseIcon],
    ["auto", "Fit the canvas to the diagram", autoIcon],
];

/** What every canvas button's tooltip adds: Alt keeps the content in place. */
const RECENTER_HINT = "hold Alt to keep the diagram where it is";

/**
 * The attributes of a toolbar button named `name`: its tooltip, with
 * `combo` in the platform's notation when it has a shortcut (spec 17.1),
 * and its accessible label and key shortcut.
 */
const named = (name: string, combo?: string) =>
    combo
        ? `title="${name} (${notation(combo)})" aria-label="${name}" aria-keyshortcuts="${combo.replace("Mod", "Control")}"`
        : `title="${name}" aria-label="${name}"`;

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

/**
 * Paint `state` on the edit toolbar under `root` (spec 13.4, 16): align
 * from two selected elements, distribute from three, and undo and redo
 * while the view shown has a step to take.
 */
export function paintEditState(root: ParentNode, state: EditState) {
    for (const button of root.querySelectorAll<HTMLButtonElement>(
        ".align-selection",
    ))
        button.disabled = state.selected < ALIGN_MINIMUM;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
        ".distribute-selection",
    ))
        button.disabled = state.selected < DISTRIBUTE_MINIMUM;
    const undo = root.querySelector<HTMLButtonElement>(".undo-layout");
    if (undo) undo.disabled = !state.undo;
    const redo = root.querySelector<HTMLButtonElement>(".redo-layout");
    if (redo) redo.disabled = !state.redo;
}

/** The reason the pencil gives on a view with an automatic layout (spec 4.6). */
const AUTOMATIC_LAYOUT_REASON =
    "This view uses automatic layout; remove `autoLayout` from the DSL to edit it.";

const escapeAttribute = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** The edit toolbar's groups for `route`, wired to it (spec 17.1). */
function editToolbar(group: HTMLElement, route: EditingRoute) {
    // A group of groups, so the toolbar wraps between them.
    group.className = `edit-toolbar ${styles.editToolbar}`;
    group.innerHTML = `
        <div class="arrange-buttons ${styles.btnGroup}" role="group" aria-label="Arrange the selection">
            ${ALIGN_BUTTONS.map(
                ([edge, name, icon]) =>
                    `<button type="button" class="align-selection" data-edge="${edge}" ${named(name, SHORTCUTS[edge])}>${icon}</button>`,
            ).join("")}
            ${DISTRIBUTE_BUTTONS.map(
                ([axis, name, icon]) =>
                    `<button type="button" class="distribute-selection" data-axis="${axis}" ${named(name, SHORTCUTS[axis])}>${icon}</button>`,
            ).join("")}
            <button type="button" class="routing-mode" hidden></button>
        </div>
        <div class="history-buttons ${styles.btnGroup}" role="group" aria-label="History">
            <button type="button" class="undo-layout" ${named("Undo", SHORTCUTS.undo)}>${undoIcon}</button>
            <button type="button" class="redo-layout" ${named("Redo", SHORTCUTS.redo)}>${redoIcon}</button>
        </div>
        <div class="canvas-buttons ${styles.btnGroup}" role="group" aria-label="Layout and canvas">
            <button type="button" class="calculate-layout" ${named("Calculate layout")}>${calculateIcon}</button>
            ${CANVAS_BUTTONS.map(
                ([command, label, icon]) =>
                    `<button type="button" class="resize-canvas" data-command="${command}" title="${label} (${RECENTER_HINT})" aria-label="${label}">${icon}</button>`,
            ).join("")}
        </div>
        <div class="edit-buttons ${styles.btnGroup}">
            <button type="button" class="show-shortcuts" ${named("Keyboard shortcuts", SHORTCUTS.shortcuts)}>${keyboardIcon}</button>
            <span class="save-status ${styles.saveStatus}" role="status" aria-live="polite"></span>
            <button type="button" class="save-layout ${styles.done}" ${named("Save", SHORTCUTS.save)}>Save</button>
            <button type="button" class="done-editing ${styles.done}">Done</button>
        </div>
    `;
    const on = (
        selector: string,
        action: (button: HTMLElement, event: Event) => void,
    ) => {
        for (const button of group.querySelectorAll<HTMLElement>(selector))
            button.addEventListener("click", (event) => action(button, event));
    };
    on(".align-selection", (button) =>
        route.align(button.dataset.edge as AlignEdge),
    );
    on(".distribute-selection", (button) =>
        route.distribute(button.dataset.axis as DistributeAxis),
    );
    // Every click stores the mode it moves to (spec 12.2).
    on(".routing-mode", (button) => {
        if (button.dataset.next)
            route.setRouting(button.dataset.next as Routing);
    });
    on(".undo-layout", () => route.undo());
    on(".redo-layout", () => route.redo());
    on(".calculate-layout", () => route.calculateLayout());
    // Alt held keeps the content where it is (spec 14).
    on(".resize-canvas", (button, event) =>
        route.resizeCanvas(
            button.dataset.command as CanvasCommand,
            !(event as MouseEvent).altKey,
        ),
    );
    on(".show-shortcuts", () => route.showShortcuts());
    on(".save-layout", () => route.save());
    on(".done-editing", () => route.done());
    paintSaveStatus(group, route.status());
    paintEditState(group, route.editState());
    paintRouting(group, route.edge());
}

/**
 * The pencil, or the edit toolbar in editing, for `view`; `null` for an
 * image view, which has no layout to edit. A pencil that edit mode can't
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
        editToolbar(group, route);
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
