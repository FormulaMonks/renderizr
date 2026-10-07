/**
 * The page's edit session (spec 7.4, 9.1, ADR 18): each view's edited layout,
 * what waits to be saved, and the saves themselves. The engine draws what
 * the session holds; edit mode's server writes it into `workspace.json`.
 * Only edit mode creates one; builds compile it out (ADR 15).
 *
 * Undo and redo, and live reload, build on the same layouts: each records
 * through `record` and draws through the engine's `setLayout`.
 */

import {
    type EditedLayout,
    type LayoutChange,
    mergeLayouts,
} from "../model/edited-layout";

/** Where edit mode's server takes saves. */
export const SAVE_ENDPOINT = "/__renderizr/save";

/** The header every save carries the session token in (spec 4.5). */
export const TOKEN_HEADER = "X-Renderizr-Token";

/** How long after the last change a save runs on its own (spec 7.4). */
export const AUTOSAVE_MS = 5000;

/** Where saving stands, as the edit toolbar shows it (spec 17.1). */
export type SaveState = "saved" | "unsaved" | "saving" | "failed";

export type SaveStatus = {
    state: SaveState;
    /** Why the last save failed, when it did. */
    reason?: string;
    /** Whether changes wait for a save: the Save button's enabled state. */
    waiting: boolean;
};

/** What the session needs from the page; the browser's own by default. */
export type SessionHost = {
    fetch: typeof fetch;
    setTimeout(callback: () => void, ms: number): unknown;
    clearTimeout(timer: unknown): void;
};

const browserHost = (): SessionHost => ({
    fetch: (...args) => window.fetch(...args),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (timer) => window.clearTimeout(timer as number),
});

/** What a save sends: the changed layout of each view, by view key. */
type Layouts = Map<string, EditedLayout>;

const isEmpty = (layout: EditedLayout) =>
    Object.keys(layout.elements ?? {}).length === 0;

export class EditSession {
    readonly #host: SessionHost;
    readonly #token: string | null;
    #version: string | null;
    /** Every view's edited layout this session, as drawn. */
    readonly #layouts: Layouts = new Map();
    /** The fields changed since the last save that succeeded, by view. */
    #pending: Layouts = new Map();
    /** What the save on its way holds, or null. */
    #inFlight: Layouts | null = null;
    #failure: string | null = null;
    #timer: unknown = null;
    /** The view the author opened last, which a save stamps (spec 7.1). */
    #view: string | null = null;
    #queue: Promise<boolean> = Promise.resolve(true);
    readonly #listeners = new Set<(status: SaveStatus) => void>();

    constructor({
        version,
        token,
        host = browserHost(),
    }: {
        version: string | null;
        token: string | null;
        host?: SessionHost;
    }) {
        this.#version = version;
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
        const layout = mergeLayouts(
            this.#layouts.get(change.view),
            change.after,
        );
        this.#layouts.set(change.view, layout);
        this.#pending.set(
            change.view,
            mergeLayouts(this.#pending.get(change.view), change.after),
        );
        this.#schedule();
        this.#notify();
        return layout;
    }

    /** Whether changes wait for a save, a failed one included. */
    waiting(): boolean {
        return this.#pending.size > 0;
    }

    status(): SaveStatus {
        const waiting = this.waiting();
        if (this.#inFlight) return { state: "saving", waiting };
        if (this.#failure !== null)
            return { state: "failed", reason: this.#failure, waiting };
        return { state: waiting ? "unsaved" : "saved", waiting };
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
        this.#queue = this.#queue.then(() => this.#send());
        return this.#queue;
    }

    /**
     * Send what waits as the page goes away (spec 7.4). The browser keeps a
     * `keepalive` request going after the page has gone, though nobody hears
     * how it ends.
     */
    saveOnLeave() {
        if (!this.waiting()) return;
        this.#cancel();
        const views = new Map([...this.#pending]);
        void this.#post(views, true).catch(() => {});
    }

    /** Stop the autosave countdown and forget every listener. */
    dispose() {
        this.#cancel();
        this.#listeners.clear();
    }

    #schedule() {
        this.#cancel();
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

    #post(views: Layouts, keepalive = false) {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.#token) headers[TOKEN_HEADER] = this.#token;
        return this.#host.fetch(SAVE_ENDPOINT, {
            method: "POST",
            headers,
            keepalive,
            body: JSON.stringify({
                version: this.#version,
                view: this.#view,
                views: Object.fromEntries(views),
            }),
        });
    }

    async #send(): Promise<boolean> {
        if (this.#pending.size === 0) return this.#failure === null;
        const views = this.#pending;
        this.#inFlight = views;
        this.#pending = new Map();
        this.#notify();

        let failure: string | null = null;
        try {
            const response = await this.#post(views);
            const answer = await response.json().catch(() => ({}));
            if (response.ok && typeof answer.version === "string") {
                this.#version = answer.version;
            } else {
                failure =
                    typeof answer.error === "string"
                        ? answer.error
                        : `the server answered ${response.status}`;
            }
        } catch (error) {
            failure = `edit mode's server can't be reached (${error instanceof Error ? error.message : String(error)})`;
        }

        if (failure !== null) {
            // What failed waits again, under anything changed since.
            for (const [key, layout] of views) {
                const later = this.#pending.get(key);
                this.#pending.set(
                    key,
                    later ? mergeLayouts(layout, later) : layout,
                );
            }
        }
        for (const [key, layout] of this.#pending)
            if (isEmpty(layout)) this.#pending.delete(key);
        this.#failure = failure;
        this.#inFlight = null;
        this.#notify();
        return failure === null && this.#pending.size === 0;
    }
}
