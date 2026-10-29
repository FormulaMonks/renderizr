import type { History, Location } from "history";
import {
    landingSearch,
    missingLanding,
    WorkspaceModel,
    type Landing,
    type WorkspaceTarget,
} from "./model";
import type { SetWorkspace, WorkspaceSet } from "./workspace-set";

/**
 * The workspace trail (ADR 26): the workspaces a reader crossed into from
 * the landscape scoped workspace, in order, which the page address records
 * as one segment each, the slug of the software system the workspace is
 * scoped to: `#/orders/payments/?view=Containers`. The landscape scoped
 * workspace adds no segment, so every address that names none leads to it,
 * and the trail never repeats a workspace.
 *
 *     const follower = followTrail({ set, history, notice, error });
 *     await follower.ready;
 *     follower.cross(target);
 *
 * Every address names the workspace it shows, so the page sets the address
 * first and enters the workspace after: the follower is the one part of the
 * page that enters a workspace for an address. Everything else that follows
 * the address leaves one in another workspace to it (`inOtherWorkspace`).
 */

/** The workspaces on a trail, by slug, from the landscape's first crossing. */
export type Trail = readonly string[];

/**
 * The trail `trail` once the reader crosses into `slug`: entering the
 * landscape, `null`, clears it, entering a workspace already on it cuts it
 * back there, and any other crossing appends.
 */
export function crossInto(trail: Trail, slug: string | null): string[] {
    if (slug === null) return [];
    const at = trail.indexOf(slug);
    return at >= 0 ? trail.slice(0, at + 1) : [...trail, slug];
}

const decode = (segment: string) => {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
};

/**
 * The trail the address path `pathname` records, read as crossings from the
 * landscape, so a repeated workspace cuts it back there.
 */
export const trailOf = (pathname: string): string[] =>
    pathname
        .split("/")
        .filter(Boolean)
        .map(decode)
        .reduce<string[]>(crossInto, []);

/** The address path that records `trail`: `/` for the landscape. */
export const trailPath = (trail: Trail): string =>
    trail.length === 0
        ? "/"
        : `/${trail.map((slug) => encodeURIComponent(slug)).join("/")}/`;

/**
 * The workspace the address path `pathname` shows: the last on its trail,
 * or `null` for the landscape scoped workspace.
 */
export const workspaceOf = (pathname: string): string | null =>
    trailOf(pathname).at(-1) ?? null;

/**
 * Whether the address `pathname` shows another workspace than `shown`, the
 * one a component drew from: such an address is the follower's to enter,
 * and the page draws again once it has.
 */
export const inOtherWorkspace = (pathname: string, shown: string | null) =>
    workspaceOf(pathname) !== shown;

/**
 * Where the header's button leads back to from `trail`: the previous
 * workspace on it and the trail that ends there, or the landscape, `null`,
 * on a one-workspace trail. `undefined` on the landscape, which has none.
 */
export function parentOf(
    trail: Trail,
): { slug: string | null; trail: string[] } | undefined {
    if (trail.length === 0) return undefined;
    const rest = trail.slice(0, -1);
    return { slug: rest.at(-1) ?? null, trail: rest };
}

/**
 * The part of `trail` before the first workspace `has` rejects, and that
 * workspace, or `null` when the set has every one.
 */
export function existingTrail(
    trail: Trail,
    has: (slug: string) => boolean,
): { trail: string[]; missing: string | null } {
    const at = trail.findIndex((slug) => !has(slug));
    return at < 0
        ? { trail: [...trail], missing: null }
        : { trail: trail.slice(0, at), missing: trail[at] };
}

/* -------------------------------------------------------------- follower */

/** What a follower is given. */
export type TrailSource = {
    /** The set the page holds, which the follower enters workspaces of. */
    set: WorkspaceSet;
    /** The page's history, whose address records the trail. */
    history: History;
    /** Shows `text` in a notice toast. */
    notice: (text: string) => void;
    /** Shows `text` in an error toast. */
    error: (text: string) => void;
};

export type TrailFollower = {
    /** Settles once the page is in the workspace its first address names. */
    readonly ready: Promise<void>;
    /**
     * Cross along `target`: push the trail it leads to and where it lands,
     * then enter its workspace. A crossing to a view or page the target
     * lacks lands on its default view, and a notice says so.
     */
    cross(target: WorkspaceTarget): void;
    /** Follow the address no more. */
    stop(): void;
};

/** The address query of a workspace's default view. */
const DEFAULT_VIEW = `?${landingSearch(null)}`;

/**
 * Follow the workspace trail in `history`'s address: enter the workspace
 * each address shows, the first one at once. A workspace on the trail that
 * the set no longer has sends the reader to the nearest earlier one that it
 * has, ending at the landscape, at its default view, and a notice says so.
 * A workspace that won't load says why in an error toast and puts the
 * address back where the reader was.
 */
export function followTrail({
    set,
    history,
    notice,
    error,
}: TrailSource): TrailFollower {
    const has = (slug: string) =>
        set.workspaces.some((member) => member.slug === slug);
    const nameOf = (slug: string | null) =>
        slug === null
            ? set.landscape.name
            : (set.workspaces.find((member) => member.slug === slug)?.name ??
              slug);

    /** The crossing whose landing waits on its workspace to load. */
    let crossing: { slug: string; landing: Landing } | null = null;
    /**
     * Where the reader was last in a workspace that loaded; before any has,
     * the landscape's default view.
     */
    let settled: { pathname: string; search: string } = {
        pathname: "/",
        search: DEFAULT_VIEW,
    };
    /** The address path last entered, so moving within it enters nothing. */
    let entered: string | null = null;
    let ready: Promise<void> = Promise.resolve();

    /** Tell the reader when the crossing landed short of where it said. */
    const landed = (workspace: SetWorkspace, landing: Landing) => {
        const model = new WorkspaceModel(workspace.workspace);
        const missing = missingLanding(model, landing);
        const shown = model.getViews()[0];
        if (missing && shown) {
            notice(
                `${workspace.name} has no ${missing}, so the page shows ${shown.key}.`,
            );
        }
    };

    /**
     * Put the reader in the workspace `location` shows, after rewriting an
     * address whose trail repeats a workspace or names one the set lacks.
     * Returns whether `location` stands.
     */
    const follow = (location: Location): boolean => {
        const written = location.pathname.split("/").filter(Boolean);
        const { trail, missing } = existingTrail(
            trailOf(location.pathname),
            has,
        );
        if (missing !== null || trail.length !== written.length) {
            history.replace({
                pathname: trailPath(trail),
                search: missing === null ? location.search : DEFAULT_VIEW,
            });
            if (missing !== null) {
                notice(
                    `This site no longer has the ${missing} workspace, so the page shows ${nameOf(trail.at(-1) ?? null)}.`,
                );
            }
            return false;
        }

        if (location.pathname === entered) {
            settled = location;
            return true;
        }
        entered = location.pathname;
        const slug = trail.at(-1) ?? null;
        const waiting = crossing?.slug === slug ? crossing : null;
        crossing = null;
        ready = set.enterWorkspace(slug).then(
            (workspace) => {
                if (entered !== location.pathname) return;
                settled = history.location;
                if (waiting) landed(workspace, waiting.landing);
            },
            (failure: unknown) => {
                if (entered !== location.pathname) return;
                error(
                    failure instanceof Error
                        ? failure.message
                        : String(failure),
                );
                entered = settled.pathname;
                history.replace(settled);
            },
        );
        return true;
    };

    const first = history.location;
    // The first address rewrites itself before anything follows it.
    if (!follow(first)) follow(history.location);
    const unlisten = history.listen(({ location }) => {
        follow(location);
    });

    return {
        get ready() {
            return ready;
        },
        cross(target) {
            const trail =
                target.trail ??
                crossInto(trailOf(history.location.pathname), target.slug);
            crossing = { slug: target.slug, landing: target.landing };
            history.push({
                pathname: trailPath(trail),
                search: `?${landingSearch(target.landing)}`,
            });
        },
        stop: unlisten,
    };
}
