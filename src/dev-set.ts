import { error as servedError } from "virtual:renderizr/workspace";
import { type SetError, showSetError } from "./components/set-error";

/**
 * The page's side of `pnpm dev`'s set (spec 264, _Previewing a set with
 * `pnpm dev`_). The dev server reloads the page once a set loads; until
 * then it serves the last set that did with the error, and sends each new
 * error over its websocket. `import.meta.hot` is `undefined` outside the
 * dev server, so builds compile all of this out, and edit mode has its own
 * (`pages/diagrams-edit.ts`).
 */

/** The custom event a set error arrives on. `scripts/dev-set.js` names it too. */
const SET_ERROR_EVENT = "renderizr:set-error";

/** Why the set didn't load, as the server last said; `null` while it did. */
let failure: SetError | null = null;

/** The canvas the error shows in place of, while no set has loaded. */
let canvas: HTMLElement | null = null;

/**
 * Show the set error the page loaded with, and each one the server sends
 * from now on.
 */
export function followDevSet() {
    const hot = import.meta.hot;
    if (!hot || __RENDERIZR_EDIT_MODE__) return;
    failure = servedError as SetError | null;
    if (failure && !failure.blank) showSetError(failure, null);
    hot.on(SET_ERROR_EVENT, (error: SetError) => {
        failure = error;
        showSetError(error, canvas);
    });
}

/**
 * Show the error in place of the canvas `target` while no set has loaded,
 * and say whether it did.
 */
export function showDevBlank(target: HTMLElement): boolean {
    if (!import.meta.hot || __RENDERIZR_EDIT_MODE__ || !failure?.blank)
        return false;
    canvas = target;
    showSetError(failure, target);
    return true;
}
