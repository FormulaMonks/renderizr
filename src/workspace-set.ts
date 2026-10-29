import type {
    Branding,
    Crossing,
    WorkspacePayload,
} from "virtual:renderizr/set";

/**
 * The set the page holds (ADR 26): the landscape scoped workspace, where the
 * reader lands, and the software system scoped workspaces it maps, each
 * loaded the first time the reader enters it. A lone workspace is a set of
 * one, its landscape. The page draws its header, routes, branding and title
 * from the workspace the reader entered last.
 *
 * `src/current-workspace.ts` holds the page's one set; this module builds
 * one from what it is given, so a test can drive it.
 */

/** A workspace of the set, as the reader enters it. */
export type SetWorkspace = {
    /**
     * The slug of the software system the workspace is scoped to, which
     * names it in the workspace trail; `null` for the landscape scoped
     * workspace and a lone workspace.
     */
    slug: string | null;
    /** The workspace's name, which the page title and the header give. */
    name: string;
    /** The workspace JSON. */
    workspace: Record<string, unknown>;
    /** Its branding, which the page applies when the reader enters it. */
    branding: Branding;
    /** Its elements that lead into another workspace of the set. */
    crossings: Crossing[];
};

/** A software system scoped workspace the set holds, before it loads. */
export type SetMember = { slug: string; name: string };

/** What a set is made of. */
export type WorkspaceSetSource = {
    /** The landscape scoped workspace, or a lone workspace. */
    landscape: WorkspacePayload;
    /** The other workspaces, by slug and name. */
    workspaces: readonly SetMember[];
    /** The payload of the workspace `slug`, loaded. */
    load: (slug: string) => Promise<WorkspacePayload>;
};

/** Hears that the reader entered another workspace. */
export type WorkspaceListener = (entered: SetWorkspace) => void;

export type WorkspaceSet = {
    /** The other workspaces of the set, by slug and name. */
    readonly workspaces: readonly SetMember[];
    /** The workspace the reader entered last: at first, the landscape. */
    currentWorkspace(): SetWorkspace;
    /**
     * Enter the workspace `slug`, or the landscape scoped workspace for
     * `null`: load it the first time, make it current and tell every
     * listener. Entering the current workspace tells no one. Rejects on a
     * slug the set doesn't hold or a workspace that won't load, and leaves
     * the reader where they are. When the reader enters another workspace
     * before this one loads, the last entry wins.
     */
    enterWorkspace(slug: string | null): Promise<SetWorkspace>;
    /** Hear every workspace the reader enters; returns the unsubscribe. */
    onWorkspaceEntered(listener: WorkspaceListener): () => void;
};

/** The name a workspace goes by when it gives none, as the build's title. */
const UNNAMED = "Workspace";

/** `payload` as the workspace `slug` of the set. */
const setWorkspace = (
    slug: string | null,
    { workspace, branding, crossings }: WorkspacePayload,
): SetWorkspace => ({
    slug,
    name: typeof workspace.name === "string" ? workspace.name : UNNAMED,
    workspace,
    branding,
    crossings,
});

export function createWorkspaceSet({
    landscape,
    workspaces,
    load,
}: WorkspaceSetSource): WorkspaceSet {
    let current = setWorkspace(null, landscape);
    /** Each workspace entered or loading, by slug. */
    const entered = new Map<string | null, Promise<SetWorkspace>>([
        [null, Promise.resolve(current)],
    ]);
    const listeners = new Set<WorkspaceListener>();
    /** Counts entries, so a slow load never overrides a later one. */
    let entries = 0;

    const loaded = (slug: string | null) => {
        const known = entered.get(slug);
        if (known) return known;
        if (!workspaces.some((member) => member.slug === slug))
            return Promise.reject(
                new Error(`This set has no workspace "${slug}".`),
            );
        const loading = load(slug as string).then(
            (payload) => setWorkspace(slug, payload),
            (error) => {
                // The next entry tries again.
                entered.delete(slug);
                throw error;
            },
        );
        entered.set(slug, loading);
        return loading;
    };

    return {
        workspaces,
        currentWorkspace: () => current,
        async enterWorkspace(slug) {
            entries += 1;
            const entry = entries;
            const next = await loaded(slug);
            if (entry !== entries || next === current) return next;
            current = next;
            for (const listener of listeners) listener(next);
            return next;
        },
        onWorkspaceEntered(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
