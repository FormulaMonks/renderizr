/**
 * Where activating an element or a relationship can take the reader (spec
 * 6.1). The engine draws one indicator per kind and makes only items with
 * targets focusable; the page acts on one target or offers several in the
 * target menu. Both ask this module, so they never disagree.
 *
 * The order is the spec's: the element link, the drill-down views, the
 * element's image views, the element's own documentation and decisions,
 * then properties whose value is an `http(s)` URL. An element offers only
 * its own documentation scope, and an instance the one of the element it
 * instantiates.
 *
 * In a set (ADR 26), an element can also lead into another workspace of the
 * set, as the set loader recorded it in the carrying workspace's crossings;
 * a software system named after a workspace of the set leads there right
 * after its element link.
 */

import {
    decisionOrder,
    EVERY_SCOPE,
    FILTER_PARAM,
    scopeFilterOf,
} from "./decisions";
import {
    type DocumentationScope,
    scopedId,
    scopeLabel,
    searchOf,
    sectionId,
    slugOf,
    WORKSPACE_SCOPE,
} from "./documentation";
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
 * documentation or decisions page (at document `id` when it is set, and
 * the decisions index under `filter` when that is), or `null` for the
 * target's default view. A document's `id` carries its documentation
 * scope's slug path (ADR 30); a slug path alone opens that scope's first
 * section.
 */
export type Landing =
    | { view: string }
    | { page: PageKind; id: string; filter?: string }
    | null;

/**
 * Another workspace of the set, labeled with its name, and where the
 * crossing lands there. An authored address that names a full workspace
 * trail carries that `trail`, which replaces the reader's. A crossing into
 * the documentation or decisions of the software system a workspace is
 * scoped to `shows` them: it is labeled and drawn as the element's own
 * documents are.
 */
export type WorkspaceTarget = {
    kind: "workspace";
    slug: string;
    label: string;
    landing: Landing;
    trail?: string[];
    shows?: PageKind;
};

/** One destination, labeled as the target menu lists it. */
export type Target =
    | { kind: "view"; key: string; label: string }
    | { kind: "documentation"; search: string; label: string }
    | { kind: "decisions"; search: string; label: string }
    | WorkspaceTarget
    | { kind: "link"; url: string; label: string };

/**
 * An element or relationship of one workspace that leads into another
 * workspace of the set, as the set loader records it
 * (`scripts/workspace-set.js`). `element` is its id.
 */
export type Crossing = {
    element: string;
    slug: string;
    via: "workspace-link" | "followed-link" | "name";
    url?: string;
};

/**
 * What the software system a workspace of the set is scoped to carries as
 * a documentation scope, as the set loader records it: its slug path in
 * that workspace, and whether it carries sections and decisions.
 */
export type SetDocuments = {
    scope: string;
    documentation: boolean;
    decisions: boolean;
};

/**
 * Another workspace of the set, named before it loads: its slug, its name,
 * and what its software system carries as a documentation scope when it
 * carries anything. The set loader writes it (`setMemberOf` in
 * `scripts/plugins.js`), and the page and the model read this one shape.
 */
export type SetMember = {
    slug: string;
    name: string;
    documents?: SetDocuments;
};

/**
 * What a workspace knows of the set it belongs to: the other workspaces,
 * and its own crossings into them.
 */
export type SetLinks = {
    workspaces: readonly SetMember[];
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

/** The documentation scopes of `model` that carry documents of `kind`. */
const scopesWith = (model: WorkspaceModel, kind: PageKind) =>
    model.scopes.filter((scope) => scope[PAGES[kind].ids].length);

/**
 * The ids of `scope`'s documents of `kind`, in the order its page lists
 * them: sections by their order, decisions newest first.
 */
const idsOf = (scope: DocumentationScope, kind: PageKind): string[] =>
    kind === "documentation"
        ? scope.sections
              .toSorted((a, b) => (a.order < b.order ? -1 : 1))
              .map(sectionId)
        : decisionOrder(scope.decisions).map((decision) => decision.id);

/** Where on a document page a target opens; every part may be left out. */
type PageRoute = {
    /** The documentation scope whose document it opens. */
    scope?: DocumentationScope;
    /** The document's own id in `scope`. */
    id?: string;
    /** The decisions page's filter, as `scopeFilterOf` names a scope. */
    filter?: string | null;
};

/**
 * The documentation or decisions page, opened at document `id` of `scope`.
 * An id the scope lacks opens the scope's first document, or the page's
 * landing for the workspace's own, as it always did. A scope that carries
 * no such documents, or no scope at all, opens the landing. A route to the
 * decisions keeps a `filter` that some scope answers to. `undefined` when
 * no documentation scope carries such documents.
 */
function pageTarget(
    model: WorkspaceModel,
    kind: PageKind,
    { scope, id = "", filter = null }: PageRoute = {},
): Target | undefined {
    const { page, param, label } = PAGES[kind];
    const scopes = scopesWith(model, kind);
    if (scopes.length === 0) return undefined;
    const query: Record<string, string> = { page };
    if (scope && scopes.includes(scope)) {
        const ids = idsOf(scope, kind);
        const known = ids.includes(id) ? id : scope.path ? ids[0] : undefined;
        if (known !== undefined) query[param] = scopedId(scope.path, known);
    }
    if (filter && scopes.some((s) => scopeFilterOf(s) === filter)) {
        query[FILTER_PARAM] = filter;
    }
    return { kind, search: searchOf(query), label };
}

/**
 * The documentation scope and document id that `address` names, a
 * document's id as Renderizr addresses it: the scope's slug path, then the
 * document's own id (`internet-banking-system/01-context`, ADR 30). An id
 * of the workspace's own reads as written. The scope is `undefined` when
 * the slug path names no documentation scope.
 */
function addressed(
    model: WorkspaceModel,
    kind: PageKind,
    address: string,
): [DocumentationScope | undefined, string] {
    const own = model.scopes.find((scope) => scope.path === "");
    const slash = address.lastIndexOf("/");
    if (slash < 0 || (own && idsOf(own, kind).includes(address))) {
        return [own, address];
    }
    const path = address.slice(0, slash);
    const scope = model.scopes.find((s) => s.path !== "" && s.path === path);
    return [scope, address.slice(slash + 1)];
}

/** Renderizr's own route, as its query string: `?view=key`, `?page=docs…`. */
function routeTarget(model: WorkspaceModel, query: string): Target | undefined {
    const params = new URLSearchParams(query);
    const kind = PAGE_KINDS.find((k) => PAGES[k].page === params.get("page"));
    if (kind) {
        const address = params.get(PAGES[kind].param) ?? "";
        const [scope, id] = addressed(model, kind, address);
        const filter = kind === "decisions" ? params.get(FILTER_PARAM) : null;
        return pageTarget(model, kind, { scope, id, filter });
    }
    const view = params.get("view");
    return view === null ? undefined : viewTarget(model, view);
}

/** Where Renderizr's own route `query` lands in the workspace it names. */
function routeLanding(query: string): Landing {
    const params = new URLSearchParams(query);
    const page = PAGE_KINDS.find((k) => PAGES[k].page === params.get("page"));
    if (page) {
        const id = params.get(PAGES[page].param) ?? "";
        const filter = page === "decisions" && params.get(FILTER_PARAM);
        return filter ? { page, id, filter } : { page, id };
    }
    const view = params.get("view");
    return view ? { view } : null;
}

/**
 * The document page a Structurizr path names, `…/documentation/<name>…` or
 * `…/decisions/<name>…`: its kind, and the names after it, which name a
 * documentation scope. `undefined` when no segment names one.
 */
function pageSegments(
    segments: readonly string[],
): { kind: PageKind; names: string[] } | undefined {
    const at = segments.findIndex((segment) =>
        PAGE_KINDS.includes(segment as PageKind),
    );
    if (at < 0) return undefined;
    return { kind: segments[at] as PageKind, names: segments.slice(at + 1) };
}

/**
 * The slug path that Structurizr's name path `names` gives a documentation
 * scope in a workspace this one hasn't loaded: each name's slug, from the
 * software system down. No name, or `*`, is the workspace's own, `""`.
 */
const namedPath = (names: readonly string[]) =>
    names.length === 0 || (names.length === 1 && names[0] === WORKSPACE_SCOPE)
        ? ""
        : names.map((name) => slugOf(decode(name))).join("/");

/**
 * Where the path after `{workspace:N}` lands in the workspace it enters,
 * read the way `structurizrTarget` reads it: `/diagrams#key` at that view,
 * `/documentation` and `/decisions` at those pages, and anything else at
 * the default view. Names after the page's name the documentation scope:
 * the documentation lands at the section the fragment names in it, or its
 * first; the decisions at the decision the fragment names, or the index
 * filtered to the scope.
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
    const named = pageSegments(segments);
    if (!named) return null;
    const page = named.kind;
    const scope = namedPath(named.names);
    if (!scope || fragment) return { page, id: scopedId(scope, fragment) };
    return page === "documentation"
        ? { page, id: scope }
        : { page, id: "", filter: scope };
}

/** The query of the address a crossing to `landing` pushes. */
export function landingSearch(landing: Landing): string {
    if (landing && "page" in landing) {
        const { page, param } = PAGES[landing.page];
        const query = new URLSearchParams({ page });
        if (landing.id) query.set(param, landing.id);
        if (landing.filter) query.set(FILTER_PARAM, landing.filter);
        return searchOf(query);
    }
    const query = new URLSearchParams({ page: "diagrams" });
    if (landing) query.set("view", landing.view);
    return query.toString();
}

/**
 * What the workspace `model` lacks of `landing`, as the reader is told it
 * ("view Deployment", "documentation"), or `null` when the crossing lands
 * where it says. A document page that lacks only the document named opens
 * at its first. A page counts every documentation scope of `model`.
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
    return scopesWith(model, landing.page).length === 0 ? landing.page : null;
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
 * The documentation scope that Structurizr's name path `names` names, one
 * element name from the software system down, matched as written or
 * percent-encoded and ignoring case. No name, or `*`, names the
 * workspace's. `undefined` when no documentation scope answers to it.
 */
function scopeNamed(
    model: WorkspaceModel,
    names: readonly string[],
): DocumentationScope | undefined {
    const wanted = names.map((name) => decode(name).toLowerCase());
    if (wanted.length === 0 || wanted.join("/") === WORKSPACE_SCOPE) {
        return model.scopes.find((scope) => scope.path === "");
    }
    return model.scopes.find(
        (scope) =>
            scope.names.length === wanted.length &&
            scope.names.every((name, i) => name.toLowerCase() === wanted[i]),
    );
}

/**
 * Structurizr's own pages under a workspace's address: `…/diagrams#key`,
 * `…/documentation[/<name>…]#section` and `…/decisions[/<name>…]#id`,
 * where the names after the page's name an element's documentation scope.
 * `undefined` for any other path.
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
    const named = pageSegments(segments);
    if (!named) return undefined;
    return pageTarget(model, named.kind, {
        scope: scopeNamed(model, named.names),
        id: fragment,
    });
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
 * loader matched it on `element`, the id of the element or relationship
 * carrying it, or when it is an address that names a full workspace trail
 * (ADR 26). `undefined` when the link leads nowhere: a view or page this
 * workspace does not have, a `{workspace:N}` link that matches no
 * workspace, or a script.
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

/**
 * The indicator drawn for `target`: its kind, or for a crossing into
 * another workspace's documentation or decisions, the glyph of those
 * documents.
 */
export const indicatorOf = (target: Target): TargetKind =>
    target.kind === "workspace" && target.shows ? target.shows : target.kind;

/** The same destination reached two ways. */
const identity = (target: Target) => {
    switch (target.kind) {
        case "view":
            return `view:${target.key}`;
        case "documentation":
        case "decisions":
            return `${target.kind}:${target.search}`;
        case "workspace":
            return target.shows
                ? `workspace:${target.slug}:${target.shows}`
                : `workspace:${target.slug}`;
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

/**
 * The documentation scope `element` offers: its own, or for a software
 * system instance or container instance the one of the element it
 * instantiates. `undefined` when that element carries no documents. An
 * element never offers an ancestor's.
 */
function ownScope(
    model: WorkspaceModel,
    element: ModelElement,
): DocumentationScope | undefined {
    const id =
        element.type === "SoftwareSystemInstance"
            ? element.softwareSystemId
            : element.type === "ContainerInstance"
              ? element.containerId
              : element.id;
    if (!id) return undefined;
    return model.scopes.find((scope) => scope.elementId === id);
}

/**
 * The targets of `scope`'s own documents: "Documentation" at its first
 * section and "Decisions" at the index filtered to it, each only when the
 * scope carries such documents.
 */
function scopeTargets(
    model: WorkspaceModel,
    scope: DocumentationScope,
): Target[] {
    const targets: (Target | undefined)[] = [
        scope.sections.length
            ? pageTarget(model, "documentation", { scope })
            : undefined,
        scope.decisions.length
            ? pageTarget(model, "decisions", { filter: scopeFilterOf(scope) })
            : undefined,
    ];
    return targets.filter((target) => target !== undefined);
}

/**
 * The documentation scope a documentation or decisions target lands in:
 * the one its document's id names, the one its decisions filter names, or
 * for the docs page's landing the first scope with sections. `undefined`
 * for the decisions index of every scope.
 */
function landingScope(
    model: WorkspaceModel,
    target: Target & { kind: PageKind },
): DocumentationScope | undefined {
    const params = new URLSearchParams(target.search);
    const address = params.get(PAGES[target.kind].param);
    if (address !== null) return addressed(model, target.kind, address)[0];
    if (target.kind === "documentation") {
        return scopesWith(model, "documentation")[0];
    }
    const filter = params.get(FILTER_PARAM);
    return model.scopes.find((scope) => scopeFilterOf(scope) === filter);
}

/**
 * The element link of an element whose own documentation scope is `own`,
 * and that scope's targets. A link to a page of another documentation
 * scope names that scope after a middle dot ("Documentation · Workspace"),
 * and a link to the decisions of every scope says so ("Decisions · All
 * documentation scopes"), so it never reads as `own`'s "Decisions"; a link
 * to `own`'s page of the same kind stands in for `own`'s target, in the
 * link's place.
 */
function ownDocuments(
    model: WorkspaceModel,
    link: Target | undefined,
    own: DocumentationScope | undefined,
): [Target | undefined, Target[]] {
    if (!own) return [link, []];
    const targets = scopeTargets(model, own);
    if (link?.kind !== "documentation" && link?.kind !== "decisions") {
        return [link, targets];
    }
    const scope = landingScope(model, link);
    if (scope === own) {
        return [link, targets.filter((target) => target.kind !== link.kind)];
    }
    const named = scope ? scopeLabel(scope) : EVERY_SCOPE;
    return [{ ...link, label: `${link.label} · ${named}` }, targets];
}

/**
 * The workspace of the set scoped to the software system `element`, and
 * what that software system carries there, when `element` crosses into
 * it. `undefined` for any other element, and in that workspace itself,
 * which records no crossing to itself.
 */
function scopedWorkspace(model: WorkspaceModel, element: ModelElement) {
    if (element.type !== "SoftwareSystem") return undefined;
    const slug = slugOf(element.name);
    const member = model.set.workspaces.find((w) => w.slug === slug);
    const crosses = model.set.crossings.some(
        (c) => c.element === element.id && c.slug === slug,
    );
    return member?.documents && crosses
        ? { slug, documents: member.documents }
        : undefined;
}

/** The slug path of the documentation scope `landing` lands in. */
function landingPath(landing: Landing): string | undefined {
    if (!landing || !("page" in landing)) return undefined;
    if (landing.filter) return landing.filter;
    const slash = landing.id.lastIndexOf("/");
    if (slash >= 0) return landing.id.slice(0, slash);
    // A slug path alone names the scope whose first section opens.
    return landing.page === "documentation" ? landing.id : undefined;
}

/**
 * The element link of the software system `element`, and the crossings
 * into the documentation and decisions its software system scoped
 * workspace carries on it (spec: _Across a set_): "Documentation" at
 * its first section and "Decisions" at the index filtered to it. A link
 * into that workspace that lands on the same documentation scope's page of
 * one kind stands in for that crossing, in the link's place.
 */
function crossingDocuments(
    model: WorkspaceModel,
    link: Target | undefined,
    element: ModelElement,
): [Target | undefined, Target[]] {
    const scoped = scopedWorkspace(model, element);
    if (!scoped) return [link, []];
    const { slug, documents } = scoped;
    const landings: Record<PageKind, Landing> = {
        documentation: { page: "documentation", id: documents.scope },
        decisions: { page: "decisions", id: "", filter: documents.scope },
    };
    const targets = PAGE_KINDS.filter((kind) => documents[kind]).map(
        (kind): WorkspaceTarget => ({
            kind: "workspace",
            slug,
            label: PAGES[kind].label,
            landing: landings[kind],
            shows: kind,
        }),
    );
    if (link?.kind !== "workspace" || link.slug !== slug) {
        return [link, targets];
    }
    const landing = link.landing;
    const merged = targets.find(
        (target) =>
            landing !== null &&
            "page" in landing &&
            target.shows === landing.page &&
            landingPath(landing) === documents.scope,
    );
    if (!merged) return [link, targets];
    return [
        { ...link, label: merged.label, shows: merged.shows },
        targets.filter((target) => target !== merged),
    ];
}

/** Everything activating `element` offers, from the view `current`. */
export function elementTargets(
    model: WorkspaceModel,
    element: ModelElement,
    current: string,
): Target[] {
    const link = classifyLink(model, element.url, element.id);
    const own = ownScope(model, element);
    const [first, documents] = own
        ? ownDocuments(model, link, own)
        : crossingDocuments(model, link, element);
    return distinct(
        [
            first,
            ...nameMatches(model, element),
            ...drillDownViews(model, element).map((view) =>
                viewTarget(model, view.key),
            ),
            ...model
                .findImageViewsForElement(element.id)
                .map((view) => viewTarget(model, view.key)),
            ...documents,
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
            classifyLink(model, relationship.url, relationship.id),
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
