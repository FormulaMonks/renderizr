import landscapeWorkspace from "virtual:renderizr/workspace";
import {
    crossings,
    inlined,
    type WorkspacePayload,
    workspaces,
} from "virtual:renderizr/set";
import { createWorkspaceSet } from "./workspace-set";

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
