/**
 * Where activating an element or a relationship can take the reader (spec
 * 6.1). The engine draws one indicator per kind and makes only items with
 * targets focusable; the page acts on one target or offers several in the
 * target menu. Both ask this module, so they never disagree.
 *
 * The order is the spec's: the element link, the drill-down views, the
 * element's image views, then properties whose value is an `http(s)` URL.
 * Element-scoped documentation and decisions come fourth once Renderizr has
 * a page for them (#37); until then there are none.
 *
 * In a set (ADR 26), an element can also lead into another workspace of the
 * set, as the set loader recorded it in the carrying workspace's crossings;
 * a software system named after a workspace of the set leads there right
 * after its element link.
 */

import type { ModelElement, ModelRelationship } from "./types";
import type { WorkspaceModel } from "./workspace";

/**
 * What a target leads to, which is also the indicator drawn for it. A
 * `workspace` is another workspace of the set. A `link` is either the
 * element link or an `http(s)` property.
 */
export type TargetKind =
    | "view"
    | "documentation"
    | "decisions"
    | "workspace"
    | "link";

/** The target kinds that lead to one of Renderizr's document pages. */
export type PageKind = "documentation" | "decisions";

/**
 * Where a crossing lands in the workspace it enters: a view, the
 * documentation or decisions page (at document `id` when it is set), or
 * `null` for the target's default view.
 */
export type Landing = { view: string } | { page: PageKind; id: string } | null;

/**
 * Another workspace of the set, labeled with its name, and where the
 * crossing lands there. An authored address that names a full workspace
 * trail carries that `trail`, which replaces the reader's.
 */
export type WorkspaceTarget = {
    kind: "workspace";
    slug: string;
    label: string;
    landing: Landing;
    trail?: string[];
};

/** One destination, labeled as the target menu lists it. */
export type Target =
    | { kind: "view"; key: string; label: string }
    | { kind: "documentation"; search: string; label: string }
    | { kind: "decisions"; search: string; label: string }
    | WorkspaceTarget
    | { kind: "link"; url: string; label: string };

/**
 * An element of one workspace that leads into another workspace of the
 * set, as the set loader records it (`scripts/workspace-set.js`).
 */
export type Crossing = {
    element: string;
    slug: string;
    via: "workspace-link" | "followed-link" | "name";
    url?: string;
};

/**
 * What a workspace knows of the set it belongs to: the other workspaces
 * by slug and name, and its own crossings into them.
 */
export type SetLinks = {
    workspaces: readonly { slug: string; name: string }[];
    crossings: readonly Crossing[];
};

/** A lone workspace's: no other workspace, and nothing that crosses. */
export const NO_SET: SetLinks = { workspaces: [], crossings: [] };

/**
 * Each document page: the router's name for it, as `main.ts` registers it,
 * the query parameter that picks one document there, the workspace's list
 * of ids it may pick, and its label in the target menu. A kind's name is
 * also the path segment Structurizr gives the same page.
 */
const PAGES: Record<
    PageKind,
    {
        page: string;
        param: string;
        ids: "sections" | "decisions";
        label: string;
    }
> = {
    documentation: {
        page: "docs",
        param: "section",
        ids: "sections",
        label: "Documentation",
    },
    decisions: {
        page: "adrs",
        param: "adr",
        ids: "decisions",
        label: "Decisions",
    },
};

/** Every document page kind, in the order the lookups below try them. */
const PAGE_KINDS = Object.keys(PAGES) as PageKind[];

/** Schemes that run code in the page that opens them. */
const UNSAFE_SCHEME = /^(javascript|data|vbscript):/i;

/** Structurizr's stand-in for the workspace's own address in a link. */
const WORKSPACE_TOKEN = "{workspace}";

/** Structurizr's link into the workspace with server id `N`. */
const WORKSPACE_LINK = /^\{workspace:\d+\}/;

/** An authored address that names a full workspace trail: `#/orders/…`. */
const TRAIL_ADDRESS = /^#(\/[^?#]*[^/?#][^?#]*)(?:\?(.*))?$/;

/** A web address: the one kind of property value that is a target. */
const HTTP = /^https?:\/\//i;

/** Structurizr's own hosts: `structurizr.com` and its subdomains. */
const STRUCTURIZR_HOST = /(^|\.)structurizr\.com$/i;

const decode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

function viewTarget(model: WorkspaceModel, key: string): Target | undefined {
    const view = model.getViews().find((v) => v.key === key);
    if (!view) return undefined;
    return { kind: "view", key, label: model.getTitleForView(view) };
}

/**
 * The documentation or decisions page, opened at document `id` when the
 * workspace has it. `undefined` when the workspace has no such documents.
 */
function pageTarget(
    model: WorkspaceModel,
    kind: PageKind,
    id: string,
): Target | undefined {
    const { page, param, ids, label } = PAGES[kind];
    const known = model.documentation[ids];
    if (known.length === 0) return undefined;
    const query = new URLSearchParams({ page });
    if (known.includes(id)) query.set(param, id);
    return { kind, search: query.toString(), label };
}

/** Renderizr's own route, as its query string: `?view=key`, `?page=docs…`. */
function routeTarget(model: WorkspaceModel, query: string): Target | undefined {
    const params = new URLSearchParams(query);
    const kind = PAGE_KINDS.find((k) => PAGES[k].page === params.get("page"));
    if (kind) {
        return pageTarget(model, kind, params.get(PAGES[kind].param) ?? "");
    }
    const view = params.get("view");
    return view === null ? undefined : viewTarget(model, view);
}

/** Where Renderizr's own route `query` lands in the workspace it names. */
function routeLanding(query: string): Landing {
    const params = new URLSearchParams(query);
    const page = PAGE_KINDS.find((k) => PAGES[k].page === params.get("page"));
    if (page) return { page, id: params.get(PAGES[page].param) ?? "" };
    const view = params.get("view");
    return view ? { view } : null;
}

/**
 * Where the path after `{workspace:N}` lands in the workspace it enters,
 * read the way `structurizrTarget` reads it: `/diagrams#key` at that view,
 * `/documentation` and `/decisions` at those pages, and anything else at
 * the default view.
 */
function linkLanding(link: string): Landing {
    const rest = link.replace(WORKSPACE_LINK, "");
    const hashAt = rest.indexOf("#");
    const path = (hashAt >= 0 ? rest.slice(0, hashAt) : rest).split("?")[0];
    const fragment = hashAt >= 0 ? decode(rest.slice(hashAt + 1)) : "";
    const segments = path.split("/").filter(Boolean);
    if (segments[segments.length - 1] === "diagrams") {
        return fragment ? { view: fragment } : null;
    }
    const page = PAGE_KINDS.find((k) => segments.includes(k));
    return page ? { page, id: fragment } : null;
}

/** The query of the address a crossing to `landing` pushes. */
export function landingSearch(landing: Landing): string {
    if (landing && "page" in landing) {
        const { page, param } = PAGES[landing.page];
        const query = new URLSearchParams({ page });
        if (landing.id) query.set(param, landing.id);
        return query.toString();
    }
    const query = new URLSearchParams({ page: "diagrams" });
    if (landing) query.set("view", landing.view);
    return query.toString();
}

/**
 * What the workspace `model` lacks of `landing`, as the reader is told it
 * ("view Deployment", "documentation"), or `null` when the crossing lands
 * where it says. A document page that lacks only the document named opens
 * at its first.
 */
export function missingLanding(
    model: WorkspaceModel,
    landing: Landing,
): string | null {
    if (!landing) return null;
    if ("view" in landing) {
        return model.findViewByKey(landing.view)
            ? null
            : `view ${landing.view}`;
    }
    return model.documentation[PAGES[landing.page].ids].length === 0
        ? landing.page
        : null;
}

/** The workspace `slug` of the set, as a target landing at `landing`. */
function workspaceTarget(
    model: WorkspaceModel,
    slug: string,
    landing: Landing,
): WorkspaceTarget | undefined {
    const member = model.set.workspaces.find((w) => w.slug === slug);
    if (!member) return undefined;
    return { kind: "workspace", slug, label: member.name, landing };
}

/**
 * Where the link `link` of the element `element` crosses, as the set loader
 * recorded it: a `{workspace:N}/…` link at what its path names, a followed
 * raw-file link at the default view. `undefined` when it crosses nowhere.
 */
function crossingTarget(
    model: WorkspaceModel,
    link: string,
    element: string | undefined,
): WorkspaceTarget | undefined {
    if (element === undefined) return undefined;
    const crossing = model.set.crossings.find(
        (c) => c.element === element && c.via !== "name" && c.url === link,
    );
    if (!crossing) return undefined;
    const landing =
        crossing.via === "workspace-link" ? linkLanding(link) : null;
    return workspaceTarget(model, crossing.slug, landing);
}

/**
 * An authored address that names a full workspace trail, `#/orders/…`,
 * which leads to the workspace it ends at. `undefined` when a workspace on
 * it isn't in the set.
 */
function trailTarget(
    model: WorkspaceModel,
    path: string,
    query: string,
): WorkspaceTarget | undefined {
    const trail = path.split("/").filter(Boolean).map(decode);
    const known = (slug: string) =>
        model.set.workspaces.some((w) => w.slug === slug);
    if (!trail.every(known)) return undefined;
    const target = workspaceTarget(
        model,
        trail[trail.length - 1],
        routeLanding(query),
    );
    return target && { ...target, trail };
}

/**
 * Structurizr's own pages under a workspace's address: `…/diagrams#key`,
 * `…/documentation…` and `…/decisions…`. `undefined` for any other
 * path.
 */
function structurizrTarget(
    model: WorkspaceModel,
    path: string,
    fragment: string,
): Target | undefined {
    const segments = path.split("/").filter(Boolean);
    if (segments[segments.length - 1] === "diagrams") {
        return viewTarget(model, fragment);
    }
    const kind = PAGE_KINDS.find((k) => segments.includes(k));
    return kind && pageTarget(model, kind, fragment);
}

/** The path of a link to a page on Structurizr's hosts, or `undefined`. */
function structurizrPath(url: string): string | undefined {
    try {
        const { hostname, pathname } = new URL(url);
        return STRUCTURIZR_HOST.test(hostname) ? pathname : undefined;
    } catch {
        return undefined;
    }
}

/** The link's host, or the link itself when it has none, as `mailto:`. */
function hostOf(url: string): string {
    try {
        return new URL(url).host || url;
    } catch {
        return url;
    }
}

/**
 * What an element link leads to (spec 6.1, rule 1): a view in this
 * workspace, the documentation or the decisions, another workspace of the
 * set, or anywhere else, which opens in a new tab. Only Renderizr's own
 * routes, the `{workspace}/…` form and pages on Structurizr's hosts lead
 * inside the workspace. A link leads into another workspace when the set
 * loader matched it on `element`, the element carrying it, or when it is
 * an address that names a full workspace trail (ADR 26). `undefined` when
 * the link leads nowhere: a view or page this workspace does not have, a
 * `{workspace:N}` link that matches no workspace, or a script.
 */
export function classifyLink(
    model: WorkspaceModel,
    url: string | undefined,
    element?: string,
): Target | undefined {
    const link = url?.trim() ?? "";
    if (!link || UNSAFE_SCHEME.test(link)) return undefined;

    const crossing = crossingTarget(model, link, element);
    if (crossing) return crossing;
    if (WORKSPACE_LINK.test(link)) return undefined;

    const hashAt = link.indexOf("#");
    const before = hashAt >= 0 ? link.slice(0, hashAt) : link;
    const fragment = hashAt >= 0 ? decode(link.slice(hashAt + 1)) : "";

    // Renderizr's hash routes: `#/?page=…`, and `#/orders/?…` in a set.
    if (link.startsWith("#/?") || link.startsWith("#?")) {
        return routeTarget(model, link.slice(link.indexOf("?") + 1));
    }
    const trail = TRAIL_ADDRESS.exec(link);
    if (trail) return trailTarget(model, trail[1], trail[2] ?? "");
    if (link.startsWith("#")) return viewTarget(model, fragment);
    if (link.startsWith("?")) return routeTarget(model, before.slice(1));

    if (link.startsWith(WORKSPACE_TOKEN)) {
        const path = before.slice(WORKSPACE_TOKEN.length).split("?")[0];
        return structurizrTarget(model, path, fragment);
    }

    // A Structurizr page this workspace lacks opens there, like any link.
    const hosted = structurizrPath(link);
    const own = hosted && structurizrTarget(model, hosted, fragment);
    return own || { kind: "link", url: link, label: hostOf(link) };
}

/** Rule 5: properties whose value is an `http(s)` URL, in written order. */
function propertyTargets(properties: Record<string, string>): Target[] {
    return Object.entries(properties)
        .filter(([, value]) => HTTP.test(value.trim()))
        .map(([name, value]) => ({
            kind: "link",
            url: value.trim(),
            label: `${name} (${hostOf(value.trim())})`,
        }));
}

/**
 * Rule 2: a software system (or an instance of one) drills down to its
 * system context and container views, a container (or an instance of one)
 * to its component views. Deployment nodes have none; an author who wants
 * one sets the node's `url`.
 */
function drillDownViews(model: WorkspaceModel, element: ModelElement) {
    switch (element.type) {
        case "SoftwareSystem":
        case "SoftwareSystemInstance": {
            const id =
                element.type === "SoftwareSystem"
                    ? element.id
                    : (element.softwareSystemId ?? "");
            return [
                ...model.findSystemContextViewsForSoftwareSystem(id),
                ...model.findContainerViewsForSoftwareSystem(id),
            ];
        }
        case "Container":
        case "ContainerInstance":
            return model.findComponentViewsForContainer(
                element.type === "Container"
                    ? element.id
                    : (element.containerId ?? ""),
            );
        default:
            return [];
    }
}

/** The same destination reached two ways. */
const identity = (target: Target) => {
    switch (target.kind) {
        case "view":
            return `view:${target.key}`;
        case "documentation":
        case "decisions":
            return `${target.kind}:${target.search}`;
        case "workspace":
            return `workspace:${target.slug}`;
        case "link":
            return `link:${target.url}`;
    }
};

/**
 * Each destination once, where it first appears, leaving out the view on
 * screen: following it would go nowhere.
 */
function distinct(targets: (Target | undefined)[], current: string) {
    const seen = new Set<string>();
    const kept: Target[] = [];
    for (const target of targets) {
        if (!target) continue;
        if (target.kind === "view" && target.key === current) continue;
        const id = identity(target);
        if (seen.has(id)) continue;
        seen.add(id);
        kept.push(target);
    }
    return kept;
}

/**
 * The workspaces of the set `element` leads into by its name alone, at
 * their default views. A software system never leads into the workspace
 * scoped to it: the set loader records no such crossing.
 */
const nameMatches = (model: WorkspaceModel, element: ModelElement) =>
    model.set.crossings
        .filter((c) => c.element === element.id && c.via === "name")
        .map((c) => workspaceTarget(model, c.slug, null));

/** Everything activating `element` offers, from the view `current`. */
export function elementTargets(
    model: WorkspaceModel,
    element: ModelElement,
    current: string,
): Target[] {
    return distinct(
        [
            classifyLink(model, element.url, element.id),
            ...nameMatches(model, element),
            ...drillDownViews(model, element).map((view) =>
                viewTarget(model, view.key),
            ),
            ...model
                .findImageViewsForElement(element.id)
                .map((view) => viewTarget(model, view.key)),
            ...propertyTargets(element.properties ?? {}),
        ],
        current,
    );
}

/**
 * Everything activating `relationship` offers: its link, then its `http(s)`
 * properties. Relationships have no drill-down (spec 10.9).
 */
export function relationshipTargets(
    model: WorkspaceModel,
    relationship: ModelRelationship,
    current: string,
): Target[] {
    return distinct(
        [
            classifyLink(model, relationship.url),
            ...propertyTargets(relationship.properties ?? {}),
        ],
        current,
    );
}

/**
 * What activating a Mermaid flowchart node offers, from the view `current`:
 * its one `click` link, classified as an element link would be (spec:
 * Activation targets). A link to the view on screen, to a view the
 * workspace lacks or to a script offers nothing. The graph and the page
 * both ask here, since `findElementById` doesn't know the node.
 */
export function mermaidNodeTargets(
    model: WorkspaceModel,
    link: string | undefined,
    current: string,
): Target[] {
    return distinct([classifyLink(model, link)], current);
}
