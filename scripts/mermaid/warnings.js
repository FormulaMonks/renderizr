/**
 * The build's two kinds of Mermaid notice (spec: Styling, When a diagram
 * can't be drawn): the error that stands in for a diagram, with the same
 * text the page shows, and the one warning per diagram that lists what of
 * its source Renderizr ignored. Both name the image view's key.
 */

/** Why a diagram can't be drawn, as the page's `ViewError` and the build both say it. */
export const diagramError = (key, reason) =>
    `Mermaid diagram "${key}": ${reason}.`;

/** The ignored-styling warning, its entries in source order. */
export const ignoredWarning = (key, entries) =>
    `Image view "${key}": Renderizr supports only a subset of Mermaid styling; ignored: ${entries.join(", ")}`;

/**
 * What one diagram's source sets that Renderizr leaves out, each entry once,
 * in the order the source first sets it.
 */
export class Ignored {
    #entries = new Set();

    add(entry) {
        this.#entries.add(entry);
    }

    /** The warning for the image view `key`, or `undefined` when nothing was ignored. */
    warning(key) {
        return this.#entries.size
            ? ignoredWarning(key, [...this.#entries])
            : undefined;
    }
}

/**
 * A construct the source uses that would change what the diagram means if
 * Renderizr left it out, so the whole diagram fails in its place.
 */
export class NotDrawnYet extends Error {
    constructor(construct) {
        super(`${construct} isn't something Renderizr draws yet`);
        this.name = "NotDrawnYet";
    }
}
