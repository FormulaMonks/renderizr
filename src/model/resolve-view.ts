import { type ResolvedBoundary, resolveBoundaries } from "./boundaries";
import type {
    AutomaticLayoutSettings,
    ModelElement,
    ModelRelationship,
    ModelView,
    RelationshipView,
    ViewType,
} from "./types";
import type { WorkspaceModel } from "./workspace";

/** Structurizr's defaults for a view that names no layout of its own. */
export const DEFAULT_AUTOMATIC_LAYOUT: AutomaticLayoutSettings = {
    implementation: "Dagre",
    rankDirection: "LeftRight",
    rankSeparation: 100,
    nodeSeparation: 50,
    edgeSeparation: 50,
    vertices: true,
};

/**
 * Which layout a view gets (spec section 7), counting only elements that are
 * not drawn as boundaries:
 *
 * - `automatic`: every element at (0,0), so the whole view is laid out.
 * - `stored`: none at (0,0), drawn where the workspace says.
 * - `unplaced`: some at (0,0); the stored layout is kept and each unplaced
 *   element is placed around it.
 */
export type LayoutMode = "automatic" | "stored" | "unplaced";

export type ResolvedElement = {
    id: string;
    /** Top-left, in model units; a missing coordinate is 0. */
    x: number;
    y: number;
    element: ModelElement;
};

export type ResolvedRelationship = RelationshipView & {
    relationship: ModelRelationship;
};

export type ResolvedView = {
    key: string;
    type: ViewType;
    title: string;
    description: string;
    elements: ResolvedElement[];
    relationships: ResolvedRelationship[];
    /**
     * Everything drawn as a boundary (spec 8), outer before inner: elements
     * with at least one child in the view, whether the view lists them or
     * not, groups and the enterprise boundary.
     */
    boundaries: ResolvedBoundary[];
    layout: LayoutMode;
    /** Ids of the unplaced elements, in view order. Empty unless `layout` is `unplaced`. */
    unplaced: string[];
    automaticLayout: AutomaticLayoutSettings;
    /** Set on a filtered view: its base view and the tag filter to apply to it. */
    filter?: ViewFilter;
    view: ModelView;
};

export type ViewFilter = {
    baseViewKey: string;
    mode: "Include" | "Exclude";
    tags: string[];
};

/**
 * Turn a view key into a concrete view: its type, elements with coordinates,
 * relationships, layout settings, title and description. A filtered view
 * resolves to its base view's contents under its own key, with `filter` set;
 * the tags are not applied here. `undefined` when the workspace has no view
 * with that key, or a filtered view's base is missing.
 */
export function resolveView(
    model: WorkspaceModel,
    key: string,
): ResolvedView | undefined {
    const requested = model.findViewByKey(key);
    if (!requested) return undefined;
    const filtered = requested.type === "Filtered";
    const view = filtered
        ? model.findViewByKey(requested.baseViewKey)
        : requested;
    if (!view || view.type === "Filtered") return undefined;

    const elements: ResolvedElement[] = [];
    for (const placement of view.elements ?? []) {
        const element = model.findElementById(placement.id);
        if (!element) continue;
        elements.push({
            id: placement.id,
            x: placement.x ?? 0,
            y: placement.y ?? 0,
            element,
        });
    }

    const relationships: ResolvedRelationship[] = [];
    for (const placement of view.relationships ?? []) {
        const relationship = model.findRelationshipById(placement.id);
        if (!relationship) continue;
        relationships.push({ ...placement, relationship });
    }

    const boundaries = resolveBoundaries(
        model,
        view,
        elements.map((e) => e.element),
    );
    const boundaryIds = new Set(boundaries.map((b) => b.id));
    const drawn = elements.filter((e) => !boundaryIds.has(e.id));
    const atOrigin = drawn.filter((e) => e.x === 0 && e.y === 0);

    const layout: LayoutMode =
        atOrigin.length === drawn.length
            ? "automatic"
            : atOrigin.length > 0
              ? "unplaced"
              : "stored";

    const { applied: _applied, ...settings } = view.automaticLayout ?? {};

    return {
        key: requested.key,
        type: view.type,
        title: model.getTitleForView(requested),
        description: requested.description || view.description || "",
        elements,
        relationships,
        boundaries,
        layout,
        unplaced: layout === "unplaced" ? atOrigin.map((e) => e.id) : [],
        automaticLayout: { ...DEFAULT_AUTOMATIC_LAYOUT, ...settings },
        ...(filtered && {
            filter: {
                baseViewKey: view.key,
                mode: requested.mode === "Include" ? "Include" : "Exclude",
                tags: (requested.tags as string[] | undefined) ?? [],
            },
        }),
        view: requested,
    };
}
