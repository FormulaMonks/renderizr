/**
 * The perspective a reader picks (glossary), held by the address alone:
 * `?perspective=<name>` beside `view`. No reader preference stores it.
 *
 *     const follower = followPerspective({ history, model, ... });
 *     mountEngine(target, { perspective: follower.selected(), ... });
 *     follower.pick("Security");
 *
 * A pick replaces the history entry, so a shared link reopens it and Back
 * never walks through picks. The name stays across views: a view that
 * carries none of it draws as with none, and the address keeps it for the
 * next view that does. A name the workspace lacks leaves the address, with
 * a notice when a shared link or a typed address brought it and silently
 * when a crossing did.
 */

import type { History } from "history";
import {
    hasPerspective,
    perspectiveOf,
    withPerspective,
} from "./model/perspectives";
import type { WorkspaceModel } from "./model/workspace";
import { inOtherWorkspace, workspaceOf } from "./workspace-trail";

/** What the toast says when the workspace lacks the name. */
export const unknownPerspective = (workspace: string, name: string) =>
    `${workspace} has no perspective ${name}, so the page shows none.`;

/** What the toast says when the view a link opens carries none of it. */
export const nothingCarries = (view: string, name: string) =>
    `Nothing in ${view} carries the ${name} perspective.`;

/** What a follower is given. */
export type PerspectiveSource = {
    /** The page's history, whose address holds the perspective. */
    history: History;
    /** The workspace the page draws, which decides the names it knows. */
    model: WorkspaceModel;
    /** The workspace's name, as the notices say it. */
    workspace: string;
    /**
     * Whether a crossing brought the reader into this workspace, which
     * drops a name it lacks without a word.
     */
    crossed: boolean;
    /** Shows `text` in a notice toast. */
    notice: (text: string) => void;
    /** Draws under the perspective `name`, or none, once the address changes it. */
    apply: (name: string | null) => void;
};

export type PerspectiveFollower = {
    /** The perspective the address names now, or `null`. */
    selected(): string | null;
    /** Write `name` to the address, or remove it for `null`, and apply it. */
    pick(name: string | null): void;
    /**
     * A view is shown, named `view` as the drawer lists it, and draws the
     * perspectives `names`. The view a shared link opens says when it
     * carries none of the name.
     */
    viewShown(view: string, names: readonly string[]): void;
    /**
     * Read names from `model`, a workspace edit mode took from disk: a name
     * it lacks leaves the address, with a notice, and the page draws none.
     */
    swap(model: WorkspaceModel): void;
    /** Follow the address no more. */
    stop(): void;
};

/**
 * Follow the perspective in `history`'s address for the diagrams page of
 * the workspace it shows now. Addresses of another workspace or page are
 * not the follower's.
 */
export function followPerspective({
    history,
    model: first,
    workspace,
    crossed,
    notice,
    apply,
}: PerspectiveSource): PerspectiveFollower {
    const shown = workspaceOf(history.location.pathname);
    /** The workspace whose names the follower knows. */
    let model = first;
    /** The name the page draws under. */
    let current: string | null = null;
    /** Whether the next view shown tells when it carries none of it. */
    let announce = false;
    /** The names the view on screen draws, once one is. */
    let names: readonly string[] | null = null;

    /**
     * The name the address names, after dropping one the workspace lacks,
     * telling the reader when `loud`.
     */
    const read = (loud: boolean): string | null => {
        const { location } = history;
        const name = perspectiveOf(location.search);
        if (name === null || hasPerspective(model, name)) return name;
        history.replace({
            pathname: location.pathname,
            search: `?${withPerspective(location.search, null)}`,
            hash: location.hash,
        });
        if (loud) notice(unknownPerspective(workspace, name));
        return null;
    };

    const ours = (pathname: string, search: string) => {
        if (inOtherWorkspace(pathname, shown)) return false;
        const page = new URLSearchParams(search).get("page");
        return page === null || page === "diagrams";
    };

    current = read(!crossed);
    announce = !crossed && current !== null;

    const unlisten = history.listen(({ location }) => {
        if (!ours(location.pathname, location.search)) return;
        const next = read(true);
        if (next === current) return;
        const typed = perspectiveOf(location.search) === next && next !== null;
        current = next;
        apply(next);
        // A name typed into the address is a link of its own.
        if (typed && names && !names.includes(next)) announce = true;
    });

    return {
        selected: () => current,
        pick(name) {
            const { location } = history;
            history.replace({
                pathname: location.pathname,
                search: `?${withPerspective(location.search, name)}`,
                hash: location.hash,
            });
        },
        viewShown(view, drawn) {
            names = drawn;
            if (!announce) return;
            announce = false;
            if (current !== null && !drawn.includes(current))
                notice(nothingCarries(view, current));
        },
        swap(arrived) {
            model = arrived;
            const next = read(true);
            if (next === current) return;
            current = next;
            apply(next);
        },
        stop: unlisten,
    };
}
