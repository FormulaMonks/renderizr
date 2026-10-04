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
 */

import type { ModelElement, ModelRelationship } from "./types";
import type { WorkspaceModel } from "./workspace";

/**
 * What a target leads to, which is also the indicator drawn for it. A
 * `link` is either the element link or an `http(s)` property.
 */
export type TargetKind = "view" | "documentation" | "decisions" | "link";

/** One destination, labeled as the target menu lists it. */
export type Target =
    | { kind: "view"; key: string; label: string }
    | { kind: "documentation"; search: string; label: string }
    | { kind: "decisions"; search: string; label: string }
    | { kind: "link"; url: string; label: string };

/** The target kinds that lead to one of Renderizr's document pages. */
type PageKind = "documentation" | "decisions";

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

/** Schemes that run something instead of going somewhere. */
const UNSAFE_SCHEME = /^(javascript|data|vbscript):/i;

/** Structurizr's stand-in for the workspace's own address in a link. */
const WORKSPACE_TOKEN = "{workspace}";

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

/**
 * Structurizr's own pages under a workspace's address: `…/diagrams#key`,
 * `…/documentation…` and `…/decisions…`. `undefined` for any other path.
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
 * workspace, the documentation or the decisions, or anywhere else, which
 * opens in a new tab. Only Renderizr's own routes, the `{workspace}/…` form
 * and pages on Structurizr's hosts lead inside the workspace. `undefined`
 * when the link leads nowhere: a view or page this workspace does not have,
 * or a script.
 */
export function classifyLink(
    model: WorkspaceModel,
    url: string | undefined,
): Target | undefined {
    const link = url?.trim() ?? "";
    if (!link || UNSAFE_SCHEME.test(link)) return undefined;

    const hashAt = link.indexOf("#");
    const before = hashAt >= 0 ? link.slice(0, hashAt) : link;
    const fragment = hashAt >= 0 ? decode(link.slice(hashAt + 1)) : "";

    // Renderizr's hash routes: `#/?page=…`.
    if (link.startsWith("#/?") || link.startsWith("#?")) {
        return routeTarget(model, link.slice(link.indexOf("?") + 1));
    }
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
                    : element.softwareSystemId ?? "";
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
                    : element.containerId ?? "",
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

/** Everything activating `element` offers, from the view `current`. */
export function elementTargets(
    model: WorkspaceModel,
    element: ModelElement,
    current: string,
): Target[] {
    return distinct(
        [
            classifyLink(model, element.url),
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
