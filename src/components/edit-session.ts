/**
 * The page's edit session (spec 7.4, 9.1, ADR 18): each view's edited layout,
 * what waits to be saved, and the saves themselves. The engine draws what
 * the session holds; edit mode's server writes it into `workspace.json`.
 * Only edit mode creates one; builds compile it out (ADR 15).
 *
 * Undo and redo, and live reload, build on the same layouts: each records
 * through `record` and draws through the engine's `setLayout`. Each view
 * keeps its own history, one step per layout change (spec 16).
 *
 * When `workspace.json` changes on disk (spec 6.2), `takeWorkspace` drops
 * the edited layouts the file already holds and lays the edits still waiting
 * over the new workspace. Those, and the edits of a save the server refuses
 * as stale, are held: the autosave stops until the author keeps them, with
 * any save, or discards them.
 */

import {
    type EditedLayout,
    isEmptyLayout,
    type LayoutChange,
    mergeLayouts,
} from "../model/edited-layout";

/** Where edit mode's server takes saves. */
export const SAVE_ENDPOINT = "/__renderizr/save";

/** The header every save carries the session token in (spec 4.5). */
export const TOKEN_HEADER = "X-Renderizr-Token";

/** How long after the last change a save runs on its own (spec 7.4). */
export const AUTOSAVE_MS = 5000;

/**
 * How long a save after a stale one waits for the workspace the server
 * named before it goes ahead without it.
 */
export const ARRIVAL_MS = 2000;

/** Where saving stands, as the edit toolbar shows it (spec 17.1). */
export type SaveState = "saved" | "unsaved" | "saving" | "failed";

export type SaveStatus = {
    state: SaveState;
    /** Why the last save failed, when it did. */
    reason?: string;
    /** When `workspace.json` was last saved, in ms since the epoch, if known. */
    savedAt?: number;
    /** Whether changes wait for a save: the Save button's enabled state. */
    waiting: boolean;
};

/** What the session needs from the page; the browser's own by default. */
export type SessionHost = {
    fetch: typeof fetch;
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(timer: unknown): void;
    /** The time now, in ms since the epoch. */
    now(): number;
};

const browserHost = (): SessionHost => ({
    fetch: (...args) => window.fetch(...args),
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (timer) => window.clearTimeout(timer as number),
});

/** What a save sends: the changed layout of each view, by view key. */
type Layouts = Map<string, EditedLayout>;

/** A view's history: the changes undo walks back, and those redo replays. */
type History = { done: LayoutChange[]; undone: LayoutChange[] };

/** A workspace that arrived from disk, as `takeWorkspace` takes it. */
export type Arrival = {
    /** The version of `workspace.json` it came from. */
    version: string;
    /** When that file was last saved, in ms since the epoch, if it says. */
    savedAt?: number;
    /**
     * The edits of view `key` laid over the workspace by id: `layout`
     * without what the view no longer has, empty when nothing is left.
     */
    hold(key: string, layout: EditedLayout): EditedLayout;
    /** Whether the workspace changed view `key`'s members or stored layout. */
    touched(key: string): boolean;
};

export class EditSession {
    /**
     * What this page calls itself in its saves. The server names the saving
     * page in the workspace event each save makes, so the page knows its own
     * save when it comes back (spec 6.2).
     */
    readonly source = Math.random().toString(36).slice(2);
    readonly #host: SessionHost;
    readonly #token: string | null;
    #version: string | null;
    /** Every view's edited layout this session, as drawn. */
    readonly #layouts: Layouts = new Map();
    /** The fields changed since the last save that succeeded, by view. */
    #pending: Layouts = new Map();
    /** What the save on its way holds, or null. */
    #inFlight: Layouts | null = null;
    /** The version of the file the save on its way was made against. */
    #inFlightVersion: string | null = null;
    /**
     * The version a stale save's refusal named, until its workspace arrives,
     * and what to call when it does.
     */
    #awaited: { version: string; arrived: () => void } | null = null;
    #failure: string | null = null;
    #savedAt: number | null;
    #timer: unknown = null;
    /** The view the author opened last, which a save stamps (spec 7.1). */
    #view: string | null = null;
    #queue: Promise<boolean> = Promise.resolve(true);
    readonly #listeners = new Set<(status: SaveStatus) => void>();
    /** Each view's undo and redo history this session, by key. */
    readonly #history = new Map<string, History>();
    /**
     * How many steps each view's history held when the author last entered
     * editing, by key; a view missing here held none.
     */
    readonly #entered = new Map<string, number>();
    /** Whether edits that couldn't be saved wait for Keep or Discard. */
    #held = false;
    /**
     * How the last workspace that arrived while a save was on its way lays
     * edits over itself, or null: a failed save's edits lie over it too.
     */
    #arrivedHold: Arrival["hold"] | null = null;

    constructor({
        version,
        token,
        savedAt = null,
        host = browserHost(),
    }: {
        version: string | null;
        token: string | null;
        /** When the workspace the page loaded was last saved, if known. */
        savedAt?: number | null;
        host?: SessionHost;
    }) {
        this.#version = version;
        this.#savedAt = savedAt;
        this.#token = token;
        this.#host = host;
    }

    /** Every view's edited layout, by key, for an engine to mount with. */
    layouts(): Record<string, EditedLayout> {
        return Object.fromEntries(this.#layouts);
    }

    /** The edited layout of view `key`, or undefined before its first edit. */
    layoutOf(key: string): EditedLayout | undefined {
        return this.#layouts.get(key);
    }

    /** Note the view the author has open. */
    setView(key: string) {
        this.#view = key;
    }

    /**
     * Take one layout change from the engine: lay `after` over the view's
     * edited layout, mark it for the next save and start the autosave
     * countdown again. Returns the view's edited layout, for the engine's
     * `setLayout`.
     */
    record(change: LayoutChange): EditedLayout {
        const history = this.#historyOf(change.view);
        history.done.push(change);
        history.undone = [];
        return this.#apply(change.view, change.after);
    }

    /**
     * Undo the last change to view `key`: lay its `before` back as a change
     * of its own, which waits for a save. Returns the view's edited layout,
     * for the engine's `setLayout`, or `null` with nothing to undo.
     */
    undo(key: string): EditedLayout | null {
        const history = this.#history.get(key);
        const change = history?.done.pop();
        if (!history || !change) return null;
        history.undone.push(change);
        return this.#apply(key, change.before);
    }

    /** Replay the last change undone on view `key`, like `undo`. */
    redo(key: string): EditedLayout | null {
        const history = this.#history.get(key);
        const change = history?.undone.pop();
        if (!history || !change) return null;
        history.done.push(change);
        return this.#apply(key, change.after);
    }

    /** Whether view `key` has a step to undo and one to redo. */
    history(key: string): { undo: boolean; redo: boolean } {
        const history = this.#history.get(key);
        return {
            undo: (history?.done.length ?? 0) > 0,
            redo: (history?.undone.length ?? 0) > 0,
        };
    }

    /**
     * Forget view `key`'s undo and redo history, keeping its edited layout,
     * as when its layout comes again from disk (spec 6.2, 16).
     */
    clearHistory(key: string) {
        this.#entered.delete(key);
        if (!this.#history.delete(key)) return;
        this.#notify();
    }

    /** Note where every view's history stands as the author enters editing. */
    enter() {
        this.#entered.clear();
        for (const [key, { done }] of this.#history)
            this.#entered.set(key, done.length);
    }

    /**
     * Undo every view back to where it stood when the author entered
     * editing, each step waiting for a save like any undo; a view whose
     * history a change on disk cleared goes back to that change. Returns the
     * keys of the views it changed, for the engine.
     */
    revert(): string[] {
        const reverted: string[] = [];
        for (const [key, history] of this.#history) {
            const entered = this.#entered.get(key) ?? 0;
            if (history.done.length <= entered) continue;
            while (history.done.length > entered) this.undo(key);
            reverted.push(key);
        }
        return reverted;
    }

    #historyOf(key: string): History {
        let history = this.#history.get(key);
        if (!history) {
            history = { done: [], undone: [] };
            this.#history.set(key, history);
        }
        return history;
    }

    /** Lay `fields` over view `key`, mark them for a save and say so. */
    #apply(key: string, fields: EditedLayout): EditedLayout {
        const layout = mergeLayouts(this.#layouts.get(key), fields);
        this.#layouts.set(key, layout);
        this.#pending.set(key, mergeLayouts(this.#pending.get(key), fields));
        this.#schedule();
        this.#notify();
        return layout;
    }

    /**
     * Take a workspace that arrived from disk (spec 6.2, 6.3). An edited
     * layout already saved is part of it now, so it goes; the edits still
     * waiting lie over it by id and are held. A view whose members or
     * stored layout changed loses its history. Returns the keys of the
     * views with held edits, for the engine's `setLayout`.
     */
    takeWorkspace({ version, savedAt, hold, touched }: Arrival): string[] {
        this.#version = version;
        if (this.#awaited?.version === version) this.#awaited.arrived();
        if (savedAt !== undefined) this.#savedAt = savedAt;
        if (this.#inFlight) this.#arrivedHold = hold;
        for (const key of [...this.#history.keys()])
            if (touched(key)) this.#history.delete(key);
        this.#layouts.clear();
        const pending: Layouts = new Map();
        for (const [key, layout] of this.#pending) {
            const kept = hold(key, layout);
            if (isEmptyLayout(kept)) continue;
            pending.set(key, kept);
            this.#layouts.set(key, kept);
        }
        this.#pending = pending;
        this.#hold(pending.size > 0);
        return [...pending.keys()];
    }

    /** The views whose edits wait for Keep or Discard, or none. */
    held(): string[] {
        return this.#held ? [...this.#pending.keys()] : [];
    }

    /**
     * Discard the held edits (spec 6.2): their views take the file's layout
     * and lose their history. Returns their keys, for the engine.
     */
    discard(): string[] {
        const keys = this.held();
        for (const key of keys) {
            this.#layouts.delete(key);
            this.#pending.delete(key);
            this.#history.delete(key);
            this.#entered.delete(key);
        }
        this.#failure = null;
        this.#hold(false);
        return keys;
    }

    #hold(held: boolean) {
        this.#held = held;
        this.#cancel();
        this.#notify();
    }

    /** Whether changes wait for a save, a failed one included. */
    waiting(): boolean {
        return this.#pending.size > 0;
    }

    /**
     * Whether anything recorded isn't saved yet: changes waiting, a failed
     * save or a save on its way (spec 7.4, 7.5).
     */
    unsaved(): boolean {
        return this.waiting() || this.#inFlight !== null;
    }

    status(): SaveStatus {
        const waiting = this.waiting();

        if (this.#inFlight) return { state: "saving", waiting };
        if (this.#failure !== null)
            return { state: "failed", reason: this.#failure, waiting };
        const status: SaveStatus = {
            state: waiting ? "unsaved" : "saved",
            waiting,
        };
        if (this.#savedAt !== null) status.savedAt = this.#savedAt;
        return status;
    }

    /** Hear every change of `status()`. Returns a way to stop. */
    onStatus(listener: (status: SaveStatus) => void): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    /**
     * Save what waits now, after any save already on its way. Resolves with
     * whether everything recorded so far is saved.
     */
    save(): Promise<boolean> {
        this.#cancel();
        // Saving held edits keeps them (spec 6.2).
        this.#held = false;
        this.#queue = this.#queue.then(() => {
            const send = () => {
                this.#held = false;
                return this.#send();
            };
            return this.#awaited ? this.#arrival().then(send) : send();
        });
        return this.#queue;
    }

    /**
     * Wait for the workspace a stale save's refusal named, or `ARRIVAL_MS`.
     * Its arrival lays the held edits over it and drops what the author
     * never moved, which a save before it would write back over the other
     * page's (spec 6.2).
     */
    #arrival(): Promise<void> {
        const awaited = this.#awaited;
        if (!awaited) return Promise.resolve();
        return new Promise((done) => {
            const timer = this.#host.setTimeout(
                () => awaited.arrived(),
                ARRIVAL_MS,
            );
            awaited.arrived = () => {
                this.#host.clearTimeout(timer);
                if (this.#awaited === awaited) this.#awaited = null;
                done();
            };
        });
    }

    /**
     * Send what waits as the page goes away (spec 7.4). The browser keeps a
     * `keepalive` request going after the page has gone, though nobody hears
     * how it ends.
     */
    saveOnLeave() {
        if (!this.unsaved()) return;
        this.#cancel();
        // The browser may cancel a save on its way as the page goes, so this
        // one carries it too, under what changed since, against the version
        // it was made against. Should that save land first after all, the
        // server refuses this one as stale, and that save holds the rest.
        const views = new Map(this.#inFlight ?? []);
        for (const [key, layout] of this.#pending)
            views.set(key, mergeLayouts(views.get(key), layout));
        const version = this.#inFlight ? this.#inFlightVersion : this.#version;
        void this.#post(views, { keepalive: true, version }).catch(() => {});
    }

    /** Stop the autosave countdown and forget every listener. */
    dispose() {
        this.#cancel();
        this.#listeners.clear();
    }

    #schedule() {
        this.#cancel();
        // Held edits wait for the author (spec 6.2).
        if (this.#held) return;
        this.#timer = this.#host.setTimeout(() => {
            this.#timer = null;
            void this.save();
        }, AUTOSAVE_MS);
    }

    #cancel() {
        if (this.#timer === null) return;
        this.#host.clearTimeout(this.#timer);
        this.#timer = null;
    }

    #notify() {
        const status = this.status();
        for (const listener of this.#listeners) listener(status);
    }

    #post(views: Layouts, { keepalive = false, version = this.#version } = {}) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.#token) headers[TOKEN_HEADER] = this.#token;
        return this.#host.fetch(SAVE_ENDPOINT, {
            method: "POST",
            headers,
            keepalive,
            body: JSON.stringify({
                version,
                view: this.#view,
                views: Object.fromEntries(views),
                source: this.source,
            }),
        });
    }

    async #send(): Promise<boolean> {
        if (this.#pending.size === 0) return this.#failure === null;
        const views = this.#pending;
        this.#inFlight = views;
        this.#inFlightVersion = this.#version;
        this.#pending = new Map();
        this.#notify();

        let failure: string | null = null;
        let stale = false;
        try {
            const response = await this.#post(views);
            const answer = await response.json().catch(() => ({}));
            if (response.ok && typeof answer.version === "string") {
                this.#version = answer.version;
                this.#savedAt = this.#host.now();
            } else {
                stale = response.status === 409;
                // The server names the file's version now, so Keep saves
                // against it, once that workspace arrives or `ARRIVAL_MS`
                // passes (spec 6.2); one that arrived already is taken.
                if (
                    stale &&
                    typeof answer.version === "string" &&
                    answer.version !== this.#version
                ) {
                    this.#version = answer.version;
                    this.#awaited = {
                        version: answer.version,
                        arrived: () => {
                            this.#awaited = null;
                        },
                    };
                }
                failure =
                    typeof answer.error === "string"
                        ? answer.error
                        : `the server answered ${response.status}`;
            }
        } catch (error) {
            failure = `edit mode's server can't be reached (${error instanceof Error ? error.message : String(error)})`;
        }

        const arrived = this.#arrivedHold;
        this.#arrivedHold = null;
        if (failure !== null) {
            // What failed waits again, under anything changed since, laid
            // over a workspace that arrived meanwhile as its edits were.
            for (const [key, sent] of views) {
                const layout = arrived ? arrived(key, sent) : sent;
                if (isEmptyLayout(layout)) continue;
                const later = this.#pending.get(key);
                this.#pending.set(
                    key,
                    later ? mergeLayouts(layout, later) : layout,
                );
                // A workspace taken meanwhile dropped them from the view.
                this.#layouts.set(
                    key,
                    mergeLayouts(layout, this.#layouts.get(key) ?? {}),
                );
            }
        }
        for (const [key, layout] of this.#pending)
            if (isEmptyLayout(layout)) this.#pending.delete(key);
        this.#failure = failure;
        this.#inFlight = null;
        // A stale save's edits wait for Keep or Discard (spec 6.2), as do
        // a failed save's once a workspace arrived meanwhile.
        if ((stale || (arrived && failure !== null)) && this.#pending.size > 0)
            this.#held = true;
        this.#notify();
        return failure === null && this.#pending.size === 0;
    }
}
