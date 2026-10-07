/**
 * Edit mode's part of the diagrams page (spec 4.6, 6, 7.4, 7.5, 9, ADR 18):
 * the edit session, the editing route the toolbar drives, the dialog that
 * guards unsaved changes, the wiring between the session and the engine,
 * and live reload of `workspace.json`.
 *
 * `diagrams.ts` reaches every function here only behind
 * `__RENDERIZR_EDIT_MODE__`, so builds compile this module out (ADR 15).
 */

import history from "history/hash";
import { openCalculateLayout } from "../components/calculate-layout-dialog";
import { version as workspaceVersion } from "virtual:renderizr/workspace";
import type CurrentView from "../components/current-view";
import {
    type EditingRoute,
    paintRouting,
    type EditState,
    paintEditState,
    paintSaveStatus,
} from "../components/edit-buttons";
import { EditSession } from "../components/edit-session";
import { heldEdits, viewSignature } from "../components/live-reload";
import { showHeldBar, showReloadNotice } from "../components/reload-bar";
import { pageCommand } from "../components/shortcuts";
import { openShortcuts } from "../components/shortcuts-dialog";
import {
    editingSearch,
    isEditingRoute,
    layoutNotice,
    readingSearch,
} from "../components/editing-route";
import { takeSessionToken } from "../components/session-token";
import { confirmLeave } from "../components/unsaved-dialog";
import type { Engine } from "../engine";
import type { SelectionState } from "../engine/contract";
import { isEditable, resolveView, type WorkspaceModel } from "../model";

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
 * The custom events edit mode's server sends over Vite's websocket (spec
 * 6.1). `scripts/edit-plugin.js` names them too.
 */
const WORKSPACE_EVENT = "renderizr:workspace";
const FLUSH_EVENT = "renderizr:flush";
const FLUSHED_EVENT = "renderizr:flushed";

/** A workspace from disk, as the server sends it. */
type Arrived = { version: string; workspace: Record<string, unknown> };

/** The last workspace that arrived from disk, or `null` before one does. */
let arrived: Record<string, unknown> | null = null;

/** Whether the diagrams page swapped a workspace in since the page loaded. */
let swapped = false;

/** What the diagrams page does with a workspace that arrives while it shows. */
let swapIn: ((arrival: Arrived) => void) | null = null;

/**
 * The workspace the diagrams page draws: the last one from disk, else
 * `served`, the one the page loaded with.
 */
export const liveWorkspace = (served: Record<string, unknown>) =>
    arrived ?? served;

/**
 * Take each workspace that arrives while the diagrams page shows with
 * `handler`. Returns a way to stop.
 */
export function onWorkspace(handler: (arrival: Arrived) => void) {
    swapIn = handler;
    return () => {
        if (swapIn === handler) swapIn = null;
    };
}

/**
 * Hear edit mode's server for the life of the page (spec 6.1). A workspace
 * from disk goes to the diagrams page, which swaps it in place; any other
 * page reloads in full, as does a later trip from the diagrams page to the
 * documentation or decisions, whose pages hold the workspace they loaded
 * with. A flush saves what waits, unless the author still has to keep or
 * discard it, and answers once the save is done.
 */
export function startLiveReload() {
    const hot = import.meta.hot;
    if (!hot) return;
    hot.on(WORKSPACE_EVENT, (arrival: Arrived) => {
        arrived = arrival.workspace;
        if (!swapIn) {
            window.location.reload();
            return;
        }
        swapped = true;
        swapIn(arrival);
    });
    hot.on(FLUSH_EVENT, async ({ id }: { id: number }) => {
        if (session && session.held().length === 0) await session.save();
        hot.send(FLUSHED_EVENT, { id });
    });
    history.listen(({ location }) => {
        const page = new URLSearchParams(location.search).get("page");
        if (swapped && page !== "diagrams") window.location.reload();
    });
}

/**
 * Swap `arrival` in for `before`, the workspace the page shows (spec 6.2,
 * 6.3). The edit session drops what the file now holds and lays the edits
 * still waiting over `after`; the engine keeps the view, its viewport and
 * its selection where it can. The page says so when the view is gone, or
 * can no longer be edited. `canvas` is where the notice goes.
 */
export function swapWorkspace(
    engine: Engine,
    before: WorkspaceModel,
    after: WorkspaceModel,
    arrival: Arrived,
    canvas: HTMLElement,
) {
    const edits = editSession();
    const shown = engine.getCurrentView();
    const held = edits.takeWorkspace({
        version: arrival.version,
        hold: (key, layout) => heldEdits(before, after, key, layout),
        touched: (key) =>
            viewSignature(before, key) !== viewSignature(after, key),
    });
    engine.setWorkspace(arrival.workspace);
    for (const key of held) {
        const layout = edits.layoutOf(key);
        if (layout) engine.setLayout(key, layout);
    }

    const view = after.findViewByKey(shown.key);
    const first = after.getViews()[0];
    if (!view && first)
        showReloadNotice(
            canvas,
            `workspace.json no longer has ${before.getTitleForView(shown)}, so the page shows ${after.getTitleForView(first)}.`,
        );
    else if (view && editing() && !isEditable(view))
        showReloadNotice(
            canvas,
            `${after.getTitleForView(view)} can no longer be edited, so the page shows it for reading.`,
        );
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

/**
 * The selected edge as the engine last reported it (spec 12.1), so a
 * toolbar drawn again shows its routing mode.
 */
let selectedEdge: SelectionState["edge"] = null;
/** How many elements the engine has selected, as it last said. */
let selected = 0;

/**
 * Undo or redo one step of the view shown (spec 16). The engine draws the
 * layout back through `setLayout`, and keeps its viewport.
 */
function step(engine: Engine, direction: "undo" | "redo") {
    const edits = editSession();
    const key = engine.getCurrentView().key;
    const layout = direction === "undo" ? edits.undo(key) : edits.redo(key);
    if (layout) engine.setLayout(key, layout);
}

/** What the edit toolbar enables its buttons from (spec 13.4, 16). */
const editState = (engine: Engine): EditState => ({
    selected,
    ...editSession().history(engine.getCurrentView().key),
});

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
        edge: () => selectedEdge,
        setRouting: (mode) => engine.setRouting(mode),
        notice: (key) => {
            if (edits.layoutOf(key)) return null;
            const view = resolveView(model, key);
            return view
                ? layoutNotice(view.layout, view.unplaced.length)
                : null;
        },
        align: (edge) => engine.align(edge),
        distribute: (axis) => engine.distribute(axis),
        undo: () => step(engine, "undo"),
        redo: () => step(engine, "redo"),
        showShortcuts: () => openShortcuts(document.body),
        editState: () => editState(engine),
    };
}

/** Whether `target` takes typing, where the page leaves keys alone. */
const typesText = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"));

/**
 * Wire the engine to the edit session while the page shows: the page hands
 * every layout change back at once (a change it didn't hand back would
 * revert, ADR 18), the toolbar shows where saving stands and enables what
 * the selection and the view's history allow, the page keys save, undo and
 * redo on the view shown and open "Keyboard shortcuts" (spec 17.2), and the
 * toolbar, the engine and `<html data-editing>` follow the editing
 * route. The pencil, Done and Back change the route without changing the
 * view, so the engine shows nothing new and the page has to hear it from
 * history. Returns what stops each.
 */
export function startEditing(
    engine: Engine,
    currentView: CurrentView,
    container: HTMLElement,
    model: WorkspaceModel,
): (() => void)[] {
    const edits = editSession();
    const root = document.documentElement;
    let shown = editing();
    root.toggleAttribute("data-editing", shown);

    // The page's keys work with focus anywhere in the page, by physical key
    // (spec 17.2), and leave a field that takes typing alone.
    const onKey = (event: KeyboardEvent) => {
        if (!editing() || typesText(event.target)) return;
        const command = pageCommand(event);
        if (!command) return;
        event.preventDefault();
        if (command === "save") void edits.save();
        else if (command === "shortcuts") openShortcuts(document.body);
        else step(engine, command);
    };
    document.addEventListener("keydown", onKey);
    const paintState = () => paintEditState(container, editState(engine));

    // Edits that couldn't be saved wait behind a bar for the author (spec
    // 6.2); any save keeps them, so the bar goes with it.
    let removeBar: (() => void) | null = null;
    const paintHeld = () => {
        const [key] = edits.held();
        if (!key) {
            removeBar?.();
            removeBar = null;
            return;
        }
        if (removeBar) return;
        const view = model.findViewByKey(key);
        const canvas = container.querySelector<HTMLElement>(
            "#structurizr-diagram-target",
        );
        if (!canvas) return;
        removeBar = showHeldBar(
            canvas,
            view ? model.getTitleForView(view) : key,
            {
                keep: () => void edits.save(),
                discard: () => {
                    for (const discarded of edits.discard())
                        engine.setLayout(discarded, {});
                    currentView.render(engine.getCurrentView());
                },
            },
        );
    };
    paintHeld();

    return [
        engine.onViewShown((view) => edits.setView(view.key)),
        engine.onLayoutChanged((change) => {
            const first = !edits.layoutOf(change.view);
            engine.setLayout(change.view, edits.record(change));
            // The notice about a view without coordinates goes once the view
            // holds its first edit.
            if (first) currentView.render(engine.getCurrentView());
        }),
        // Undo and redo, like every change, tell the session's listeners.
        edits.onStatus((status) => {
            paintSaveStatus(container, status);
            paintState();
            paintHeld();
        }),
        engine.onSelectionChanged(({ elements, edge }) => {
            selected = elements.length;
            selectedEdge = edge;
            paintState();
            paintRouting(container, edge);
        }),
        () => {
            selectedEdge = null;
        },
        history.listen(() => {
            if (editing() === shown) return;
            shown = editing();
            root.toggleAttribute("data-editing", shown);
            engine.setEditing(shown);
            currentView.render(engine.getCurrentView());
        }),
        () => document.removeEventListener("keydown", onKey),
        () => removeBar?.(),
        () => root.removeAttribute("data-editing"),
    ];
}

/** Send what waits now, as the page goes, rather than in 5 s. */
export function flushEdits() {
    if (session?.waiting()) void session.save();
}
