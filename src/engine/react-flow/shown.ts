/**
 * The `onViewShown` subscribers of one engine. Each painted view is kept, so a
 * late subscriber hears about the view already on screen at once, never one
 * that has been asked for but not yet painted.
 */
export class ShownListeners<T> {
    readonly #callbacks = new Set<(value: T) => void>();
    #painted: { value: T } | null = null;

    /** Subscribe, replaying the last painted view if there is one. */
    add(callback: (value: T) => void): () => void {
        this.#callbacks.add(callback);
        if (this.#painted) callback(this.#painted.value);
        return () => {
            this.#callbacks.delete(callback);
        };
    }

    /** A view is painted: keep it and tell every subscriber. */
    paint(value: T) {
        this.#painted = { value };
        for (const callback of this.#callbacks) callback(value);
    }

    clear() {
        this.#callbacks.clear();
    }
}
