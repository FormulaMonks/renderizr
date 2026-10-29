/**
 * What the page says when `pnpm dev`'s set doesn't load (spec 264, _The
 * toast_): the tools' output, or the set loader's message, in an error toast
 * over the last set that loaded, or in place of the canvas while no set has
 * loaded. Only `pnpm dev` sends one (`scripts/dev-set.js`); builds never do.
 */

import { showError, showErrorInPlace } from "./toast";

/** A set that didn't load, as the dev server says it. */
export type SetError = {
    /** What the tools or the set loader said. */
    message: string;
    /** The `workspace.dsl` the tools refused, or `null` for a set error. */
    source: string | null;
    /** Whether no set has loaded yet, so the page has nothing to draw. */
    blank: boolean;
};

/** What failed: the DSL the tools refused, else the set. */
const what = ({ source }: SetError) => source ?? "The set";

/**
 * Say `error`: in place of `canvas` while no set has loaded, else in an
 * error toast over the last set that did, which stays until the next set
 * loads and the page reloads.
 */
export function showSetError(error: SetError, canvas: HTMLElement | null) {
    if (error.blank && canvas) {
        showErrorInPlace(
            canvas,
            `${what(error)} didn't load, so there is nothing to draw yet. The page follows once you fix it.`,
            error.message,
        );
        return;
    }
    showError(
        `${what(error)} didn't load. The page keeps the last set that did, and follows once you fix it.`,
        { detail: error.message },
    );
}
