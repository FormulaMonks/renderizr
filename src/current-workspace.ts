import history from "history/hash";
import landscapeWorkspace from "virtual:renderizr/workspace";
import {
    crossings,
    inlined,
    type WorkspacePayload,
    workspaces,
} from "virtual:renderizr/set";
import { showError, showNotice } from "./components/toast";
import type { SetLinks, WorkspaceTarget } from "./model";
import { createWorkspaceSet, type SetWorkspace } from "./workspace-set";
import {
    followTrail,
    parentOf,
    type TrailFollower,
    trailOf,
    trailPath,
} from "./workspace-trail";

/**
 * The page's one set (ADR 26), and the workspace the reader is in.
 *
 *     onWorkspaceEntered((entered) => ...);
 *     await enterWorkspace("payments");
 *
 * The landscape scoped workspace, or a lone workspace, is compiled into the
 * page with its branding; its slug is `null`. Each other workspace loads the
 * first time the reader enters it: from `./<slug>.json` beside the page in a
 * multi-file build, or from the page itself under `--single-file`. Edit mode
 * holds one workspace, so its set has no other.
 *
 * The address names the workspace the reader is in, through the workspace
 * trail; once `followWorkspaceTrail` starts, every address that names
 * another workspace enters it.
 */

/** The payload of the workspace `slug`, from the page or its file. */
async function load(slug: string): Promise<WorkspacePayload> {
    const held = inlined?.[slug];
    if (held) return held;
    const response = await fetch(`./${encodeURIComponent(slug)}.json`);
    if (!response.ok)
        throw new Error(
            `Couldn't load ${slug}.json: ${response.status} ${response.statusText}`,
        );
    return response.json();
}

const set = createWorkspaceSet({
    landscape: {
        workspace: landscapeWorkspace,
        branding: {
            logo: __RENDERIZR_LOGO__,
            // Its faces are in the page from first paint.
            font: __RENDERIZR_FONT__
                ? { family: __RENDERIZR_FONT__, css: null }
                : null,
            primaryColor: __RENDERIZR_PRIMARY_COLOR__,
        },
        crossings,
    },
    workspaces,
    load,
});

/** The set's other workspaces, by slug and name. */
export const setWorkspaces = set.workspaces;

/** The workspace the reader entered last: at first, the landscape. */
export const currentWorkspace = set.currentWorkspace;

/**
 * Enter the workspace `slug`, or the landscape scoped workspace for
 * `null`. The page applies its branding and title and draws its header and
 * the page the address names from it. See `WorkspaceSet.enterWorkspace`.
 */
export const enterWorkspace = set.enterWorkspace;

/** Hear every workspace the reader enters; returns the unsubscribe. */
export const onWorkspaceEntered = set.onWorkspaceEntered;

/** What `entered` knows of the set: the other workspaces, its crossings. */
export const setLinksOf = (entered: SetWorkspace): SetLinks => ({
    workspaces: set.workspaces,
    crossings: entered.crossings,
});

let follower: TrailFollower | null = null;

/**
 * Enter the workspace the address names and follow the workspace trail
 * from there on; settles once the reader is in it. Reader messages go to
 * the toast.
 */
export function followWorkspaceTrail(): Promise<void> {
    follower ??= followTrail({
        set,
        history,
        notice: (text) => void showNotice(text),
        error: (text) => void showError(text),
    });
    return follower.ready;
}

/** Cross into the workspace `target` leads to, in the same tab. */
export function crossWorkspace(target: WorkspaceTarget): void {
    follower?.cross(target);
}

/**
 * The workspace the header leads back to from the address `pathname`, by
 * name and address path; `null` on the landscape.
 */
export function parentWorkspace(
    pathname: string,
): { name: string; pathname: string } | null {
    const parent = parentOf(trailOf(pathname));
    if (!parent) return null;
    const name =
        parent.slug === null
            ? set.landscape.name
            : (set.workspaces.find((member) => member.slug === parent.slug)
                  ?.name ?? parent.slug);
    return { name, pathname: trailPath(parent.trail) };
}
