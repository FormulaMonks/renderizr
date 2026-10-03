/**
 * Which elements a view draws as boundaries, and how those boundaries nest
 * (spec 8, ADR 9). One rule for every view type: an element is a boundary
 * when the view lists at least one of its children, a group is a boundary
 * while it has a member in the view, and the enterprise boundary goes around
 * every Internal element of a landscape or context view when it is switched
 * on. Only the nesting is decided here; the boxes are derived from the
 * children in `src/engine/geometry/boundary.ts`.
 */

import type { ModelElement, ModelView, ViewType } from "./types";
import type { WorkspaceModel } from "./workspace";

export type ResolvedBoundary = {
    /**
     * The element's id, `groupBoundaryId(scope, path)` for a group, or
     * `enterprise`. What `data-boundary-id` carries (spec 15.1).
     */
    id: string;
    /** The label's name: the element's, a group's last segment, the enterprise's. */
    name: string;
    /** The boundary drawn directly around this one. */
    parent?: string;
    /** Ids of the elements and boundaries drawn directly inside it. */
    children: string[];
    /** 0 for an outermost boundary, one more for each boundary around it. */
    depth: number;
} & (
    | {
          kind: "Element";
          /** The element drawn as this boundary, which the view need not list. */
          element: ModelElement;
      }
    | {
          kind: "Group";
          /** The group's full path, which its style is looked up by. */
          group: string;
      }
    | { kind: "Enterprise" }
);

/** What tells the kinds of boundary apart. */
export type BoundaryKind = ResolvedBoundary["kind"];

/** The id of the enterprise boundary. */
export const ENTERPRISE_BOUNDARY_ID = "enterprise";

/** The view types that can draw the enterprise boundary. */
const ENTERPRISE_VIEWS: ViewType[] = ["SystemLandscape", "SystemContext"];

/**
 * A group's identity: the scope it was declared in plus its full path, so
 * that two software systems can each have a group of the same name.
 */
export function groupBoundaryId(scope: string, path: string): string {
    return `group:${scope}:${path}`;
}

/**
 * Where an element's group was declared: its parent element, the deployment
 * environment for a top-level deployment node, or nothing for a top-level
 * model element. Under the enterprise boundary a top-level element's group
 * is scoped by its location too, as upstream scopes it, so that a group
 * mixing Internal and External members becomes one group inside the
 * enterprise boundary and one outside it.
 */
function scopeOf(element: ModelElement, enterprise: boolean): string {
    if (element.parentId !== undefined) return element.parentId;
    if (element.type === "DeploymentNode") {
        return `deployment:${element.environment ?? ""}`;
    }
    if (enterprise) {
        return `location:${element.location === "Internal" ? "Internal" : "External"}`;
    }
    return "";
}

/**
 * The group paths an element sits in, innermost first: with a separator,
 * `A/B/C` is inside `A/B` inside `A`; without one, the name is one group.
 */
function groupPaths(group: string, separator: string | undefined): string[] {
    if (!separator) return [group];
    const segments = group.split(separator);
    return segments
        .map((_, at) => segments.slice(0, at + 1).join(separator))
        .reverse();
}

const lastSegment = (path: string, separator: string | undefined) =>
    separator
        ? path.slice(path.lastIndexOf(separator) + separator.length)
        : path;

/**
 * Whether the view draws the enterprise boundary, if it has an Internal
 * element: `enterpriseBoundaryVisible` or `structurizr.enterpriseBoundary`
 * (spec 8).
 */
function enterpriseSwitchedOn(view: ModelView): boolean {
    return (
        ENTERPRISE_VIEWS.includes(view.type) &&
        (view.enterpriseBoundaryVisible === true ||
            view.properties?.["structurizr.enterpriseBoundary"] === "true")
    );
}

/**
 * The boundaries a view draws around `elements` (the elements it lists, in
 * view order), outer before inner. The parent of a listed element is a
 * boundary whether the view lists it or not: a container view does not list
 * its software system, and a component view does not list its container.
 * Further up, the spec 8 table holds literally: a component view draws the
 * software system around its container only when it lists one of that
 * system's containers.
 */
export function resolveBoundaries(
    model: WorkspaceModel,
    view: ModelView,
    elements: ModelElement[],
): ResolvedBoundary[] {
    const boundaries = new Map<string, ResolvedBoundary>();
    const separator: string | undefined =
        model.model.properties["structurizr.groupSeparator"] || undefined;
    const internal = elements.filter((e) => e.location === "Internal");
    const enterprise = internal.length > 0 && enterpriseSwitchedOn(view);

    // The parent of a listed element has a child in the view.
    for (const element of elements) {
        const parent = model.findElementById(element.parentId);
        if (parent && !boundaries.has(parent.id)) {
            boundaries.set(parent.id, {
                id: parent.id,
                kind: "Element",
                name: parent.name,
                element: parent,
                children: [],
                depth: 0,
            });
        }
    }

    /** What every element and boundary is drawn directly inside. */
    const parentOf = new Map<string, string>();
    const place = (id: string, container: string | undefined) => {
        const boundary = boundaries.get(container ?? "");
        if (!boundary || boundary.id === id || parentOf.has(id)) return;
        boundary.children.push(id);
        parentOf.set(id, boundary.id);
    };

    /** The group boundary for `paths[at]`, made and placed on first use. */
    const groupBoundary = (
        scope: string,
        paths: string[],
        at: number,
        outside: string | undefined,
    ): string => {
        const id = groupBoundaryId(scope, paths[at]);
        if (!boundaries.has(id)) {
            boundaries.set(id, {
                id,
                kind: "Group",
                name: lastSegment(paths[at], separator),
                group: paths[at],
                children: [],
                depth: 0,
            });
            place(
                id,
                at + 1 < paths.length
                    ? groupBoundary(scope, paths, at + 1, outside)
                    : outside,
            );
        }
        return id;
    };

    /**
     * Put `element` inside the boundary drawn directly around it: its
     * innermost group, else its parent. The parent is placed first, so
     * every boundary lists its children in the order they are reached.
     */
    const attach = (element: ModelElement) => {
        const parent = boundaries.get(element.parentId ?? "");
        if (parent?.kind === "Element" && !parentOf.has(parent.id)) {
            attach(parent.element);
        }
        const paths = element.group ? groupPaths(element.group, separator) : [];
        place(
            element.id,
            paths.length
                ? groupBoundary(
                      scopeOf(element, enterprise),
                      paths,
                      0,
                      parent?.id,
                  )
                : parent?.id,
        );
    };

    for (const element of elements) attach(element);

    if (enterprise) {
        boundaries.set(ENTERPRISE_BOUNDARY_ID, {
            id: ENTERPRISE_BOUNDARY_ID,
            kind: "Enterprise",
            name: (model.model.enterprise?.name as string) || "Enterprise",
            children: [],
            depth: 0,
        });
        // Around the outermost boundary of each Internal element, which
        // holds only Internal elements: top-level groups split by location.
        for (const element of internal) {
            let outermost = element.id;
            while (parentOf.has(outermost)) {
                outermost = parentOf.get(outermost)!;
            }
            place(outermost, ENTERPRISE_BOUNDARY_ID);
        }
    }

    const depth = (id: string): number => {
        const parent = parentOf.get(id);
        return parent === undefined ? 0 : depth(parent) + 1;
    };
    for (const boundary of boundaries.values()) {
        boundary.parent = parentOf.get(boundary.id);
        boundary.depth = depth(boundary.id);
    }
    // Outer before inner, so they can be drawn back to front in this order.
    return [...boundaries.values()].sort((a, b) => a.depth - b.depth);
}
