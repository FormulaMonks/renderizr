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

/** What a target leads to, which is also the indicator drawn for it. */
export type TargetKind = "view" | "documentation" | "decisions" | "link";

/** One destination, labelled as the target menu lists it. */
export type Target =
    | { kind: "view"; key: string; label: string }
    | { kind: "documentation"; search: string; label: string }
    | { kind: "decisions"; search: string; label: string }
    | { kind: "link"; url: string; label: string };

/**
 * The router's names for the documentation and decisions pages, as
 * `main.ts` registers them.
 */
const DOCS_PAGE = "docs";
const DECISIONS_PAGE = "adrs";

/** `https:`, `mailto:`… anything with a scheme is somewhere else. */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** Schemes that run something instead of going somewhere. */
const UNSAFE_SCHEME = /^(javascript|data|vbscript):/i;

/** Structurizr's stand-in for the workspace's own address in a link. */
const WORKSPACE_TOKEN = "{workspace}";

const HTTP = /^https?:\/\//i;

const decode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

const search = (params: Record<string, string>) =>
    new URLSearchParams(params).toString();

function viewTarget(model: WorkspaceModel, key: string): Target | undefined {
    const view = model.getViews().find((v) => v.key === key);
    if (!view) return undefined;
    return { kind: "view", key, label: model.getTitleForView(view) };
}

function documentationTarget(
    model: WorkspaceModel,
    section: string,
): Target | undefined {
    const { sections } = model.documentation;
    if (sections.length === 0) return undefined;
    return {
        kind: "documentation",
        search: search({
            page: DOCS_PAGE,
            ...(sections.includes(section) && { section }),
        }),
        label: "Documentation",
    };
}

function decisionsTarget(
    model: WorkspaceModel,
    adr: string,
): Target | undefined {
    const { decisions } = model.documentation;
    if (decisions.length === 0) return undefined;
    return {
        kind: "decisions",
        search: search({
            page: DECISIONS_PAGE,
            ...(decisions.includes(adr) && { adr }),
        }),
        label: "Decisions",
    };
}

/** Renderizr's own route, as its query string: `?view=key`, `?page=docs…`. */
function routeTarget(model: WorkspaceModel, query: string): Target | undefined {
    const params = new URLSearchParams(query);
    const page = params.get("page");
    if (page === DOCS_PAGE) {
        return documentationTarget(model, params.get("section") ?? "");
    }
    if (page === DECISIONS_PAGE) {
        return decisionsTarget(model, params.get("adr") ?? "");
    }
    const view = params.get("view");
    return view === null ? undefined : viewTarget(model, view);
}

/**
 * Structurizr's own pages under a workspace's address:
 * `{workspace}/diagrams#key`, `{workspace}/documentation…` and
 * `{workspace}/decisions…`. `undefined` for any other path.
 */
function structurizrTarget(
    model: WorkspaceModel,
    path: string,
    fragment: string,
): Target | undefined {
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last === "diagrams") return viewTarget(model, fragment);
    if (segments.includes("documentation")) {
        return documentationTarget(model, fragment);
    }
    if (segments.includes("decisions")) {
        return decisionsTarget(model, fragment);
    }
    return undefined;
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
 * opens in a new tab. `undefined` when it leads nowhere: a view or page this
 * workspace does not have, a bare relative path, or a script.
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
        return structurizrTarget(
            model,
            before.slice(WORKSPACE_TOKEN.length),
            fragment,
        );
    }

    if (!HAS_SCHEME.test(link)) return undefined;
    if (HTTP.test(link)) {
        const path = before.replace(/^https?:\/\/[^/]*/i, "").split("?")[0];
        const own = structurizrTarget(model, path, fragment);
        if (own) return own;
    }
    return { kind: "link", url: link, label: hostOf(link) };
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
