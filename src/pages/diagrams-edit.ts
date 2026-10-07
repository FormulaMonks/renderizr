/**
 * Edit mode's part of the diagrams page (spec 4.6, 7.4, 7.5, 9, ADR 18): the
 * edit session, the editing route the toolbar drives, the dialog that guards
 * unsaved changes, and the wiring between the session and the engine.
 *
 * `diagrams.ts` reaches every function here only behind
 * `__RENDERIZR_EDIT_MODE__`, so builds compile this module out (ADR 15).
 */

import history from "history/hash";
import { openCalculateLayout } from "../components/calculate-layout-dialog";
import { version as workspaceVersion } from "virtual:renderizr/workspace";
import type CurrentView from "../components/current-view";
import { type EditingRoute, paintSaveStatus } from "../components/edit-buttons";
import { EditSession } from "../components/edit-session";
import {
    editingSearch,
    isEditingRoute,
    layoutNotice,
    readingSearch,
} from "../components/editing-route";
import { takeSessionToken } from "../components/session-token";
import { confirmLeave } from "../components/unsaved-dialog";
import type { Engine } from "../engine";
import { resolveView, type WorkspaceModel } from "../model";

/** Whether the page shows the editing route now (spec 4.6). */
export const editing = () => isEditingRoute(history.location.search);

/**
 * The edit session of this page load (spec 9.1, ADR 18). It outlives the
 * diagrams page's renders, so a trip to the documentation and back keeps
 * every edited layout.
 */
let session: EditSession | null = null;

export function editSession(): EditSession {
    if (session) return session;
    const created = new EditSession({
        version: workspaceVersion,
        token: takeSessionToken(),
    });
    // The browser asks before a tab with unsaved changes closes or reloads,
    // and whatever still waits goes out as the page goes (spec 7.4).
    window.addEventListener("beforeunload", (event) => {
        if (!created.waiting()) return;
        event.preventDefault();
        event.returnValue = "";
    });
    window.addEventListener("pagehide", () => created.saveOnLeave());
    session = created;
    return created;
}

/**
 * Go on with `proceed` once nothing waits for a save (spec 7.5). While the
 * view's changes wait or a save has failed, a dialog offers "Save and
 * continue" and "Stay", and the page goes on only once the save succeeds;
 * the toolbar shows why one didn't.
 */
export async function leave(
    engine: Engine,
    model: WorkspaceModel,
    proceed: () => void,
) {
    const edits = editSession();
    if (!edits.waiting()) {
        proceed();
        return;
    }
    const title = model.getTitleForView(engine.getCurrentView());
    if (!(await confirmLeave(document.body, title))) return;
    if (await edits.save()) proceed();
}

/** The editing route as the toolbar drives it (spec 4.6, 17.1). */
export function editingRoute(
    engine: Engine,
    model: WorkspaceModel,
): EditingRoute {
    const edits = editSession();
    return {
        isEditing: editing,
        // The pencil and Done push, so Back undoes either.
        edit: (key) =>
            history.push({
                search: editingSearch(history.location.search, key),
            }),
        done: () =>
            void leave(engine, model, () =>
                history.push({
                    search: readingSearch(history.location.search),
                }),
            ),
        href: (key) =>
            history.createHref({
                search: `?${editingSearch(history.location.search, key)}`,
            }),
        status: () => edits.status(),
        save: () => void edits.save(),
        resizeCanvas: (command, recenter) =>
            engine.resizeCanvas(command, { recenter }),
        calculateLayout: () =>
            openCalculateLayout(document.body, {
                calculate: (options) => engine.calculateLayout(options),
                bringBack: () => engine.bringBack(),
            }),
        notice: (key) => {
            if (edits.layoutOf(key)) return null;
            const view = resolveView(model, key);
            return view
                ? layoutNotice(view.layout, view.unplaced.length)
                : null;
        },
    };
}

/**
 * Wire the engine to the edit session while the page shows: the page hands
 * every layout change back at once (a change it didn't hand back would
 * revert, ADR 18), the toolbar shows where saving stands, Cmd/Ctrl+S saves,
 * Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z redoes on the view shown, and the
 * toolbar, the engine and `<html data-editing>` follow the editing
 * route. The pencil, Done and Back change the route without changing the
 * view, so the engine shows nothing new and the page has to hear it from
 * history. Returns what stops each.
 */
export function startEditing(
    engine: Engine,
    currentView: CurrentView,
    container: HTMLElement,
): (() => void)[] {
    const edits = editSession();
    const root = document.documentElement;
    let shown = editing();
    root.toggleAttribute("data-editing", shown);

    const onKey = (event: KeyboardEvent) => {
        // By physical key, so Option's characters don't get in the way
        // (spec 17.2).
        if (!editing() || !(event.metaKey || event.ctrlKey) || event.altKey)
            return;
        if (event.code === "KeyS") {
            event.preventDefault();
            void edits.save();
            return;
        }
        if (event.code !== "KeyZ") return;
        event.preventDefault();
        // One step of the view shown, back or forward (spec 16).
        const key = engine.getCurrentView().key;
        const layout = event.shiftKey ? edits.redo(key) : edits.undo(key);
        if (layout) engine.setLayout(key, layout);
    };
    document.addEventListener("keydown", onKey);

    return [
        engine.onViewShown((view) => edits.setView(view.key)),
        engine.onLayoutChanged((change) => {
            const first = !edits.layoutOf(change.view);
            engine.setLayout(change.view, edits.record(change));
            // The notice about a view without coordinates goes once the view
            // holds its first edit.
            if (first) currentView.render(engine.getCurrentView());
        }),
        edits.onStatus((status) => paintSaveStatus(container, status)),
        history.listen(() => {
            if (editing() === shown) return;
            shown = editing();
            root.toggleAttribute("data-editing", shown);
            engine.setEditing(shown);
            currentView.render(engine.getCurrentView());
        }),
        () => document.removeEventListener("keydown", onKey),
        () => root.removeAttribute("data-editing"),
    ];
}

/** Send what waits now, as the page goes, rather than in 5 s. */
export function flushEdits() {
    if (session?.waiting()) void session.save();
}
