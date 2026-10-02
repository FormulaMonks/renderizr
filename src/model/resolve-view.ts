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
    /** Ids of the elements drawn as boundaries: at least one child is in the view. */
    boundaries: string[];
    layout: LayoutMode;
    /** Ids of the unplaced elements, in view order. Empty unless `layout` is `unplaced`. */
    unplaced: string[];
    automaticLayout: AutomaticLayoutSettings;
    view: ModelView;
};

/**
 * Turn a view key into a concrete view: its type, elements with coordinates,
 * relationships, layout settings, title and description. `undefined` when the
 * workspace has no view with that key.
 */
export function resolveView(
    model: WorkspaceModel,
    key: string,
): ResolvedView | undefined {
    const view = model.findViewByKey(key);
    if (!view) return undefined;

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

    const ids = new Set(elements.map((e) => e.id));
    const parents = new Set(
        elements
            .map((e) => e.element.parentId)
            .filter((id): id is string => id !== undefined && ids.has(id)),
    );
    const boundaries = elements
        .filter((e) => e.element.type === "Group" || parents.has(e.id))
        .map((e) => e.id);
    const drawn = elements.filter((e) => !boundaries.includes(e.id));
    const atOrigin = drawn.filter((e) => e.x === 0 && e.y === 0);

    const layout: LayoutMode =
        atOrigin.length === drawn.length
            ? "automatic"
            : atOrigin.length > 0
              ? "unplaced"
              : "stored";

    const { applied: _applied, ...settings } = view.automaticLayout ?? {};

    return {
        key: view.key,
        type: view.type,
        title: model.getTitleForView(view),
        description: view.description ?? "",
        elements,
        relationships,
        boundaries,
        layout,
        unplaced: layout === "unplaced" ? atOrigin.map((e) => e.id) : [],
        automaticLayout: { ...DEFAULT_AUTOMATIC_LAYOUT, ...settings },
        view,
    };
}
