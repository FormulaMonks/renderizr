import { orderOf } from "./animation";
import { type ResolvedBoundary, resolveBoundaries } from "./boundaries";
import { type EditedLayout, relationshipKey } from "./edited-layout";
import {
    elementPasses,
    filterOf,
    relationshipPasses,
    type ViewFilter,
} from "./filter";
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

/**
 * The fields of an image view that hold its picture, one per variant; the
 * engine picks one by the diagram's scheme. `IMAGE_FIELDS` in
 * `scripts/assets.js` names the same three, for the build to inline.
 */
const IMAGE_FIELDS = ["content", "contentLight", "contentDark"] as const;

/** An image view's variants. */
export type ImageContent = Pick<ModelView, (typeof IMAGE_FIELDS)[number]>;

/** The picture fields `view` sets, and no others. */
const imageContentOf = (view: ModelView): ImageContent =>
    Object.fromEntries(IMAGE_FIELDS.map((field) => [field, view[field]]));

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
    /** Set on a filtered view: its base view and the tag filter applied to it. */
    filter?: ViewFilter;
    /** Set on an image view: its picture in each variant it has. */
    image?: ImageContent;
    view: ModelView;
};

/**
 * Turn a view key into a concrete view: its type, elements with coordinates,
 * relationships, layout settings, title and description.
 *
 * A filtered view resolves to its base view minus what its tag filter drops,
 * under its own key, title and description (spec 12): a filtered view with
 * no description has none, rather than its base's. A relationship survives
 * only when it passes the filter and both its ends survive. A dynamic view
 * listing one relationship twice at one order draws it once (spec 11).
 * Boundaries and the layout mode are worked out from the survivors, so a
 * stored base keeps their coordinates and an automatic one lays out what is
 * left.
 *
 * An `edited` layout (ADR 18) is laid over the view's own coordinates and
 * vertices before any of that is worked out, so the layout mode follows the
 * coordinates the author sees.
 *
 * `undefined` when the workspace has no view with that key, or a filtered
 * view's base is missing or itself filtered (`findViewError` says why).
 */
export function resolveView(
    model: WorkspaceModel,
    key: string,
    edited?: EditedLayout,
): ResolvedView | undefined {
    const requested = model.findViewByKey(key);
    if (!requested) return undefined;
    const filter =
        requested.type === "Filtered" ? filterOf(requested) : undefined;
    const view = filter ? model.findViewByKey(filter.baseViewKey) : requested;
    if (!view || view.type === "Filtered") return undefined;

    const elements: ResolvedElement[] = [];
    for (const placement of view.elements ?? []) {
        const element = model.findElementById(placement.id);
        if (!element) continue;
        if (filter && !elementPasses(model, filter, element)) continue;
        const at = edited?.elements?.[placement.id] ?? placement;
        elements.push({
            id: placement.id,
            x: at.x ?? 0,
            y: at.y ?? 0,
            element,
        });
    }

    const survivors = new Set(elements.map((e) => e.id));
    const relationships: ResolvedRelationship[] = [];
    /**
     * A dynamic view draws one edge per relationship per order, read as an
     * integer, so "1" and "01" are one edge (spec 11). An order that isn't
     * an integer keeps its text; `findViewError` refuses the view anyway.
     */
    const listed = new Set<string>();
    /** How often each relationship is listed so far, for its key. */
    const repeats = new Map<string, number>();
    for (const placement of view.relationships ?? []) {
        const relationship = model.findRelationshipById(placement.id);
        if (!relationship) continue;
        if (view.type === "Dynamic") {
            const at = `${placement.id}\n${orderOf(placement) ?? placement.order}`;
            if (listed.has(at)) continue;
            listed.add(at);
        }
        if (
            filter &&
            (!relationshipPasses(model, filter, relationship) ||
                !survivors.has(relationship.sourceId) ||
                !survivors.has(relationship.destinationId))
        ) {
            continue;
        }
        const repeat = repeats.get(placement.id) ?? 0;
        repeats.set(placement.id, repeat + 1);
        const route =
            edited?.relationships?.[relationshipKey(placement.id, repeat)];
        relationships.push({
            ...placement,
            // Its vertices, routing mode and label position; nothing
            // downstream changes the vertex list it is handed.
            ...(route as RelationshipView | undefined),
            relationship,
        });
    }

    const boundaries = resolveBoundaries(
        model,
        view,
        elements.map((e) => e.element),
        filter ? requested : undefined,
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
        description: requested.description ?? "",
        elements,
        relationships,
        boundaries,
        layout,
        unplaced: layout === "unplaced" ? atOrigin.map((e) => e.id) : [],
        automaticLayout: { ...DEFAULT_AUTOMATIC_LAYOUT, ...settings },
        ...(filter && { filter }),
        ...(view.type === "Image" && { image: imageContentOf(view) }),
        view: requested,
    };
}
