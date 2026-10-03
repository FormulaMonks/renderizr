/**
 * The `onViewShown` subscribers of one engine. Once the first view is painted,
 * a late subscriber hears about the view already shown at once rather than
 * waiting for the next one.
 */
export class ShownListeners<T> {
    readonly #callbacks = new Set<(value: T) => void>();
    readonly #current: () => T;
    #painted = false;

    constructor(current: () => T) {
        this.#current = current;
    }

    /** Subscribe, replaying the current view if one has been painted. */
    add(callback: (value: T) => void): () => void {
        this.#callbacks.add(callback);
        if (this.#painted) callback(this.#current());
        return () => {
            this.#callbacks.delete(callback);
        };
    }

    /** The first view is painted; later subscribers replay it. */
    start() {
        this.#painted = true;
    }

    /** A later view is painted: tell every subscriber. */
    emit() {
        const value = this.#current();
        for (const callback of this.#callbacks) callback(value);
    }

    clear() {
        this.#callbacks.clear();
    }
}
