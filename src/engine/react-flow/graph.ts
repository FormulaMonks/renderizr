/**
 * The geometry the React Flow island draws, as plain numbers (ADR 3): which
 * elements a view puts where, at what size and in what colors, and which
 * edges join them. Nothing here knows about React.
 *
 * Edge labels are measured first. Elements are then placed, leaving room
 * for those labels: where the view stores them, by Dagre when it stores
 * nowhere (spec 7.1, ADR 4), or around the stored ones when only some are
 * unplaced (spec 7.2, ADR 10). Boundaries are then derived from their
 * children, before React renders (spec 8, ADR 9). Every edge is then routed
 * by `routeView` (spec 10), through Dagre's vertices where the automatic
 * layout keeps them, then its label is placed along the route and its
 * arrowhead drawn at its target (spec 10.8, 10.10).
 */

import {
    type BoundaryKind,
    type ElementStyle,
    type ColorScheme as ModelColorScheme,
    findBoundaryStyle,
    findElementStyle,
    findEnterpriseStyle,
    findGroupStyle,
    findRelationshipStyle,
    findViewError,
    getMetadataForElement,
    getMetadataForRelationship,
    type ImageContent,
    elementTargets,
    type ModelElement,
    type ModelRelationship,
    relationshipTargets,
    type ResolvedBoundary,
    type ResolvedRelationship,
    type ResolvedView,
    resolveView,
    SCHEME_DEFAULTS,
    type TargetKind,
    type WorkspaceModel,
} from "../../model/index";

import type { ColorScheme, Labels } from "../contract";
import {
    BOUNDARY_PADDING,
    type BoundaryInput,
    boundaryRadius,
    type DerivedBoundary,
    deriveBoundaries,
    estimateText,
    formatInstanceCount,
    labelHeightClearOf,
    type MeasureText,
    placeInstanceCount,
    type TextBlock,
} from "../geometry/boundary";
import { type Bounds, boundsOf, type Size } from "../geometry/bounds";
import {
    type EdgeLabelLayout,
    edgeLabelText,
    layoutEdgeLabel,
    layoutLabelRoom,
    placeEdgeLabels,
} from "../geometry/edge-label";
import { indicatorKinds } from "../geometry/indicators";
import {
    type IconPosition,
    iconPositionOf,
    labelText,
} from "../geometry/label";
import { arrowheadPath, type LineStyle } from "../geometry/line";
import {
    type RoutingElement,
    type RoutingMode,
    routeView,
    routingModeOf,
} from "../geometry/routing/route-view";
import { shapeGeometry, shapeSize } from "../geometry/shapes/index";
import type {
    Point,
    Shape,
    ShapeGeometry,
    ShapePart,
} from "../geometry/shapes/types";
import { spaceBoundaries } from "../geometry/spacing";
import {
    type DeriveBoundaries,
    type Placement,
    placeUnplaced,
} from "../geometry/unplaced";
import { type LayoutBoundary, layOut } from "../layout/automatic";

export type { Bounds, ColorScheme, Labels, TargetKind };

export type { Point };

/** What was activated: an element (or its boundary) or a relationship. */
export type ActivationType = "element" | "relationship";

/** The element or relationship an item activates. */
export type Activation = { type: ActivationType; id: string };

/**
 * What the reader can activate, by keyboard as by pointer (spec 6.2): an
 * element, a boundary's label band or an edge's label, by its node id or
 * edge key, with what it activates and the box focusing it brings on
 * screen, in model units.
 */
export type FocusItem = {
    type: "element" | "boundary" | "edge";
    id: string;
    activation: Activation;
    box: Bounds;
};

export type ElementBox = {
    id: string;
    /** Top-left, in model units. */
    x: number;
    y: number;
    /** The box the shape is drawn in (`shapeSize`), not always the style's. */
    width: number;
    height: number;
    /** The shape drawn: the style's, or Box when it names none of the 19. */
    shape: Shape;
    /** What the outline is drawn as, back to front (spec 9.4). */
    parts: ShapePart[];
    name: string;
    metadata: string;
    description: string;
    background: string;
    stroke: string;
    strokeWidth: number;
    color: string;
    fontSize: number;
    border: string;
    /** Real alpha on fill and stroke, 0 to 1; text and icon stay opaque. */
    opacity: number;
    /** A URL or, at runtime, a data URI. */
    icon?: string;
    iconPosition: IconPosition;
    /**
     * The rect inside the box the label template fills, relative to the
     * box's top-left: the shape's content area (spec 9.4).
     */
    content: Bounds;
    /**
     * How tall the label may grow, centered in `content`: all of it, or less
     * on a deployment node so the label ends above its instance count.
     */
    labelHeight: number;
    /** A deployment node's `x<instances>`, bottom-right inside its box. */
    instances?: TextBlock;
    /**
     * The kind of each target activating it offers, in order (spec 6.1).
     * Empty: no indicators, no pointer cursor, not focusable.
     */
    targets: TargetKind[];
};

/** A boundary drawn around its children, with its label band (spec 8). */
export type BoundaryBox = DerivedBoundary & {
    kind: BoundaryKind;
    /** The element the boundary is drawn for, which its band activates. */
    elementId?: string;
    /** As an element's: what activating its label band offers. */
    targets: TargetKind[];
    /**
     * Its accessible name and title: name, metadata and description, as an
     * element's (spec 6.2).
     */
    accessibleName: string;
    /** 0 for an outermost boundary; inner ones are drawn above outer ones. */
    depth: number;
    /** 20 for the RoundedBox family, square otherwise. */
    radius: number;
    background: string;
    stroke: string;
    strokeWidth: number;
    color: string;
    border: string;
    /** Real alpha on fill and stroke, 0 to 1; text and icon stay opaque. */
    opacity: number;
    icon?: string;
};

export type EdgeLine = {
    /** Unique within the graph: a dynamic view draws one relationship more than once. */
    key: string;
    /** The relationship's id, which a dynamic view may repeat. */
    id: string;
    sourceId: string;
    targetId: string;
    /** The source end, on the source's drawn outline: `route`'s first point. */
    source: Point;
    /** The target end, where the arrowhead's tip lands: `route`'s last point. */
    target: Point;
    /** The drawn route, as the points it passes through, source first. */
    route: Point[];
    /**
     * SVG path data for the line as drawn, curves and jump-overs included,
     * ending short of the arrowhead's tip by the thickness (`routeView`).
     */
    path: string;
    /** SVG path data for the filled arrowhead, its tip on `target`. */
    arrowhead: string;
    routing: RoutingMode;
    /** Whether it draws a jump-over where it crosses an edge (spec 10.11). */
    jump: boolean;
    /**
     * The relationship's stored vertices, or Dagre's in an automatic layout
     * that keeps them, which the route passes through.
     */
    vertices: Point[];
    /** In a dynamic view, the order the view gives this edge. */
    order?: string;
    /** The label's first part, prefixed with its order in a dynamic view. */
    description: string;
    /** The label's second part, at the metadata size; never breaks. */
    technology: string;
    /** Where the label sits, in percent along `route`. */
    labelPosition: number;
    /** The label's opaque backing; absent when the label says nothing. */
    labelBox?: Bounds;
    /**
     * The lines `labelBox` was measured from, which the island draws as
     * they are; absent when the label says nothing.
     */
    labelLines?: Pick<EdgeLabelLayout, "description" | "technology">;
    /** The indicator row inside `labelBox`, relative to its top-left. */
    labelIndicators?: Bounds;
    /** What activating it offers: its link and `http(s)` properties. */
    targets: TargetKind[];
    /** Its accessible name: "source → target: description" (spec 6.2). */
    name: string;
    fontSize: number;
    /** The label's wrap width: the style's `width`. */
    labelWidth: number;
    color: string;
    /** In model units, 1 to 10. */
    thickness: number;
    style: LineStyle;
    /** Real alpha on line, arrowhead and label text, 0 to 1. */
    opacity: number;
};

/** What an image view draws: the variant for the scheme, if it has one. */
export type GraphImage = {
    /** A data URI once the build has inlined it; undefined with no content. */
    src?: string;
    /** The view's title, the picture's accessible name. */
    alt: string;
};

/** The extra tag a dynamic view's response step is styled with (spec 10.10). */
const RESPONSE_TAG = "Relationship/Response";

/** An edge before it is routed and its label placed. */
type EdgeDraft = Omit<
    EdgeLine,
    | "source"
    | "target"
    | "route"
    | "path"
    | "arrowhead"
    | "labelPosition"
    | "labelBox"
    | "labelLines"
    | "labelIndicators"
> & {
    /** The view's stored position, which placement never nudges. */
    storedPosition?: number;
    /** Where the label search starts: the view's position, then the style's. */
    startPosition: number;
    /** The label's lines and size; absent when it says nothing. */
    label?: EdgeLabelLayout;
};

export type Graph = {
    key: string;
    title: string;
    background: string;
    /** The scheme's default text color, for what the canvas itself says. */
    color: string;
    /** Set on an image view, which draws this and nothing else (spec 12). */
    image?: GraphImage;
    /**
     * Why the view cannot be drawn (spec 13); the canvas shows it in place
     * of the diagram, and the graph is otherwise empty.
     */
    error?: string;
    elements: ElementBox[];
    /** Outer before inner, the order they are drawn in. */
    boundaries: BoundaryBox[];
    edges: EdgeLine[];
    /** The box around every element, every route and every edge label. */
    bounds: Bounds;
    /**
     * Where each unplaced element of a stored layout was put, in view order,
     * for the console line that names it (spec 7.2).
     */
    placements: (Placement & { name: string })[];
    /** Authoring problems found while drawing, for the island to log once. */
    warnings: string[];
    /** Every item with targets, in reading order: the Tab order (spec 6.2). */
    focusOrder: FocusItem[];
};

const SCHEME = { light: "Light", dark: "Dark" } as const;

/** The bounds of an empty view: nothing, at the origin. */
const NO_BOUNDS: Bounds = { x: 0, y: 0, width: 0, height: 0 };

/**
 * A route point as an empty box, so the view's bounds take in every route:
 * a self-relationship's loop reaches outside its element.
 */
const pointBox = ({ x, y }: Point): Bounds => ({ x, y, width: 0, height: 0 });

/**
 * The image variant an image view shows in `scheme` (spec 12): dark prefers
 * `contentDark`, then `content`, then `contentLight`; light mirrors it.
 */
export function imageVariant(
    image: ImageContent,
    scheme: ColorScheme,
): string | undefined {
    const preferred =
        scheme === "dark"
            ? [image.contentDark, image.content, image.contentLight]
            : [image.contentLight, image.content, image.contentDark];
    return preferred.find((src) => typeof src === "string" && src !== "");
}

/**
 * Where an image view's picture is, as the island learns it. A loaded one
 * carries the `src` it loaded, so what draws it never has to re-check that
 * the view had one.
 */
export type ImageState =
    | { status: "loading" }
    | { status: "loaded"; src: string; width: number; height: number }
    | { status: "failed"; reason: string };

/** The size of the "Image not available" placeholder, a default element's. */
export const IMAGE_PLACEHOLDER = { width: 450, height: 300 } as const;

/**
 * The one box an image view draws, typed as the island's node of that kind:
 * the picture at its natural size, or the placeholder.
 */
export type ImageBox =
    | {
          type: "image";
          width: number;
          height: number;
          data: { src: string; alt: string };
      }
    | {
          type: "placeholder";
          width: number;
          height: number;
          data: { color: string };
      };

/**
 * What an image view draws in each state (spec 12): the picture at its
 * natural size once loaded, the placeholder in `color` once it has failed,
 * and nothing while it loads, so the view is neither fitted nor painted
 * before its size is known. The canvas fits the box it returns.
 */
export function imageBox(
    picture: GraphImage,
    color: string,
    state: ImageState,
): ImageBox | undefined {
    switch (state.status) {
        case "loading":
            return undefined;
        case "loaded":
            return {
                type: "image",
                width: state.width,
                height: state.height,
                data: { src: state.src, alt: picture.alt },
            };
        case "failed":
            return {
                type: "placeholder",
                ...IMAGE_PLACEHOLDER,
                data: { color },
            };
    }
}

/**
 * The most the canvas may zoom in to fit `graph`: an image view is shown at
 * its natural size at most, never upscaled (spec 12); any other view is
 * fitted however small it is.
 */
export const fitMaxZoom = (graph: Graph) =>
    graph.image ? 1 : Number.POSITIVE_INFINITY;

/** The style a boundary of any kind is drawn in. */
function boundaryStyle(
    model: WorkspaceModel,
    boundary: ResolvedBoundary,
    scheme: ModelColorScheme,
): ElementStyle {
    switch (boundary.kind) {
        case "Element":
            return findBoundaryStyle(model, boundary.element, scheme);
        case "Group":
            return findGroupStyle(model, boundary.group, scheme);
        case "Enterprise":
            return findEnterpriseStyle(model, scheme);
    }
}

/**
 * What a boundary's band says under its name: an element's metadata, unless
 * its style hides it. A group and the enterprise boundary show their name
 * alone (spec 8).
 */
function boundaryMetadata(
    model: WorkspaceModel,
    boundary: ResolvedBoundary,
    style: ElementStyle,
    labels: Labels,
): string {
    if (boundary.kind !== "Element" || !style.metadata) return "";
    return getMetadataForElement(model, boundary.element, labels.technologies);
}

/**
 * Lay out one view for drawing, measuring boundary labels with `measure`
 * (canvas `measureText` in the island). `undefined` when the workspace has
 * no view with that key. A view that cannot be drawn is an empty graph with
 * its `error`; an image view an empty graph with its `image`.
 */
export function buildGraph(
    model: WorkspaceModel,
    key: string,
    scheme: ColorScheme,
    labels: Labels,
    measure: MeasureText = estimateText,
): Graph | undefined {
    const colorScheme = SCHEME[scheme];
    const defaults = SCHEME_DEFAULTS[colorScheme];
    const empty = (view: { key: string; title: string }): Graph => ({
        key: view.key,
        title: view.title,
        background: defaults.background,
        color: defaults.color,
        elements: [],
        boundaries: [],
        edges: [],
        bounds: NO_BOUNDS,
        placements: [],
        warnings: [],
        focusOrder: [],
    });
    const kindsFor = (element: ModelElement) =>
        elementTargets(model, element, key).map((target) => target.kind);
    const relationshipKinds = (relationship: ModelRelationship) =>
        relationshipTargets(model, relationship, key).map(
            (target) => target.kind,
        );

    const error = findViewError(model, key);
    if (error) {
        const view = model.findViewByKey(key)!;
        return { ...empty({ key, title: model.getTitleForView(view) }), error };
    }

    const view = resolveView(model, key);
    if (!view) return undefined;
    if (view.image) {
        return {
            ...empty(view),
            image: {
                src: imageVariant(view.image, scheme),
                alt: view.title,
            },
        };
    }
    const boundaries = new Set(view.boundaries.map((b) => b.id));

    const elements: ElementBox[] = [];
    /** Each element by id, with the geometry its edge ends touch. */
    const drawn = new Map<
        string,
        { box: ElementBox; geometry: ShapeGeometry }
    >();
    for (const placed of view.elements) {
        if (boundaries.has(placed.id)) continue;
        const style = findElementStyle(model, placed.element, colorScheme);
        // An unknown shape draws as a Box, at the style's size.
        const shape = style.shape ?? "Box";
        const { width, height } = shapeSize(shape, style.width, style.height);
        const strokeWidth = style.strokeWidth ?? defaults.strokeWidth;
        const geometry = shapeGeometry(shape, width, height, strokeWidth);
        const count = formatInstanceCount(placed.element.instances);
        const instances =
            count === undefined
                ? undefined
                : placeInstanceCount(
                      geometry.content,
                      style.fontSize,
                      count,
                      measure,
                  );
        const box: ElementBox = {
            id: placed.id,
            x: placed.x,
            y: placed.y,
            width,
            height,
            shape: geometry.shape,
            parts: geometry.parts,
            name: placed.element.name,
            metadata: style.metadata
                ? getMetadataForElement(
                      model,
                      placed.element,
                      labels.technologies,
                  )
                : "",
            description:
                labels.descriptions && style.description
                    ? placed.element.description ?? ""
                    : "",
            background: style.background,
            stroke: style.stroke ?? defaults.color,
            strokeWidth,
            color: style.color ?? defaults.color,
            fontSize: style.fontSize,
            border: style.border ?? "Solid",
            opacity: style.opacity / 100,
            icon: style.icon,
            iconPosition: iconPositionOf(style.iconPosition),
            content: geometry.content,
            labelHeight: instances
                ? labelHeightClearOf(geometry.content, instances)
                : geometry.content.height,
            ...(instances && { instances }),
            targets: kindsFor(placed.element),
        };
        elements.push(box);
        drawn.set(box.id, { box, geometry });
    }

    const styles = new Map(
        view.boundaries.map((b) => [
            b.id,
            boundaryStyle(model, b, colorScheme),
        ]),
    );
    // Groups and the enterprise boundary lead nowhere.
    const boundaryTargets = new Map(
        view.boundaries.map((b) => [
            b.id,
            b.kind === "Element" ? kindsFor(b.element) : [],
        ]),
    );
    const inputs = boundaryInputs(
        model,
        view.boundaries,
        styles,
        labels,
        boundaryTargets,
    );
    const keys = edgeKeys(view.relationships, drawn);
    const edges: EdgeDraft[] = [];
    const warnings: string[] = [];
    const dynamic = view.type === "Dynamic";
    for (const [index, placed] of view.relationships.entries()) {
        const { relationship } = placed;
        if (
            boundaries.has(relationship.sourceId) ||
            boundaries.has(relationship.destinationId)
        ) {
            // Spec 10.6: an edge to a box drawn round other elements has no
            // outline of its own to end on.
            const name = (id: string) => model.findElementById(id)?.name ?? id;
            warnings.push(
                `Relationship ${placed.id} from "${name(relationship.sourceId)}" to "${name(relationship.destinationId)}" ends at a boundary, so it is not drawn.`,
            );
            continue;
        }
        const key = keys[index];
        if (key === undefined) continue;
        // A response step runs back from the destination to the source and
        // takes the extra Relationship/Response tag, as upstream draws it.
        const response = dynamic && placed.response === true;
        const ends = [relationship.sourceId, relationship.destinationId];
        const [fromId, toId] = response ? ends.reverse() : ends;
        const from = drawn.get(fromId);
        const to = drawn.get(toId);
        if (!from || !to) continue;
        const style = findRelationshipStyle(
            model,
            response
                ? {
                      ...relationship,
                      tags: `${relationship.tags ?? ""},${RESPONSE_TAG}`,
                  }
                : relationship,
            colorScheme,
        );
        // Only a dynamic view tells its own story about a relationship.
        const description =
            labels.descriptions && style.description
                ? (dynamic && placed.description) ||
                  relationship.description ||
                  ""
                : "";
        const technology =
            style.metadata && labels.technologies
                ? getMetadataForRelationship(model, relationship)
                : "";
        // The descriptions toggle leaves a step's order showing; the style's
        // `description: false` hides it with the description, as upstream.
        const text = edgeLabelText({
            description,
            technology,
            order: dynamic && style.description ? placed.order : undefined,
        });
        const targets = relationshipKinds(relationship);
        const label = layoutEdgeLabel(
            text,
            style.fontSize,
            style.width,
            measure,
            indicatorKinds(targets).length,
        );
        // The full description, whatever the toggles and styles hide.
        const said =
            (dynamic && placed.description) || relationship.description;
        edges.push({
            key,
            id: placed.id,
            sourceId: from.box.id,
            targetId: to.box.id,
            routing: routingModeOf(placed.routing ?? style.routing),
            jump: placed.jump ?? style.jump ?? false,
            vertices: placed.vertices ?? [],
            ...(placed.order !== undefined && { order: placed.order }),
            ...text,
            ...(label && { label }),
            targets,
            name: `${from.box.name} → ${to.box.name}${said ? `: ${said}` : ""}`,
            storedPosition: placed.position,
            startPosition: placed.position ?? style.position,
            fontSize: style.fontSize,
            labelWidth: style.width,
            color: style.color,
            thickness: style.thickness,
            style: style.style,
            opacity: style.opacity / 100,
        });
    }

    const { moved, vertices, placements } = positionElements(
        view,
        elements,
        keys,
        new Map(
            edges.map((edge) => [
                edge.key,
                {
                    room: layoutLabelRoom(
                        edge.label,
                        edge.fontSize,
                        edge.labelWidth,
                    ),
                    size: edge.label?.size,
                },
            ]),
        ),
        (placed) =>
            new Map(
                deriveBoundaries(inputs, placed, measure).map((b) => [b.id, b]),
            ),
    );
    for (const edge of edges)
        edge.vertices = vertices.get(edge.key) ?? edge.vertices;
    const names = new Map<string, string>();
    for (const element of elements) {
        names.set(element.id, element.name);
        const at = moved.get(element.id);
        if (!at) continue;
        element.x = at.x;
        element.y = at.y;
    }

    const drawnBoundaries = boundaryBoxes(
        view.boundaries,
        inputs,
        styles,
        boundaryTargets,
        elements,
        colorScheme,
        labels,
        measure,
    );

    // Each edge already carries every field a `RoutingEdge` names.
    const routes = routeView(
        [...drawn.values()].map(
            ({ box, geometry }): RoutingElement => ({
                id: box.id,
                x: box.x,
                y: box.y,
                geometry,
            }),
        ),
        edges,
    );
    // Labels are placed in view order, clear of the elements, the boundary
    // label bands and the labels before them (spec 10.8).
    const placedLabels = placeEdgeLabels(
        edges.map((edge, index) => ({
            route: routes[index].route,
            size: edge.label?.size,
            position: edge.startPosition,
            stored: edge.storedPosition !== undefined,
        })),
        [
            ...elements,
            ...drawnBoundaries.map((b) => ({
                ...b.band,
                x: b.x + b.band.x,
                y: b.y + b.band.y,
            })),
        ],
    );
    const routed: EdgeLine[] = edges.map(
        ({ storedPosition: _stored, startPosition, label, ...edge }, index) => {
            const { route, path, heading } = routes[index];
            const target = route[route.length - 1];
            const placedLabel = placedLabels[index];
            return {
                ...edge,
                source: route[0],
                target,
                route,
                path,
                arrowhead: arrowheadPath(target, heading, edge.thickness),
                labelPosition: placedLabel?.position ?? startPosition,
                ...(placedLabel && { labelBox: placedLabel.box }),
                ...(label && {
                    labelLines: {
                        description: label.description,
                        technology: label.technology,
                    },
                }),
                ...(label?.indicators && {
                    labelIndicators: label.indicators,
                }),
            };
        },
    );

    return {
        key: view.key,
        title: view.title,
        background: defaults.background,
        color: defaults.color,
        elements,
        boundaries: drawnBoundaries,
        edges: routed,
        bounds:
            boundsOf([
                ...elements,
                ...drawnBoundaries,
                ...routed.flatMap((edge) => edge.route.map(pointBox)),
                ...routed.flatMap((edge) => edge.labelBox ?? []),
            ]) ?? NO_BOUNDS,
        warnings,
        placements: placements.map((p) => ({
            ...p,
            name: names.get(p.id) ?? "",
        })),
        focusOrder: readingOrder(elements, drawnBoundaries, routed),
    };
}

/**
 * Every item with targets in reading order (spec 6.2): by the top, then the
 * left, of an element's box, a boundary's label band or an edge's label.
 */
function readingOrder(
    elements: ElementBox[],
    boundaries: BoundaryBox[],
    edges: EdgeLine[],
): FocusItem[] {
    const items: FocusItem[] = [
        ...elements
            .filter((e) => e.targets.length > 0)
            .map((e) => ({
                type: "element" as const,
                id: e.id,
                activation: { type: "element" as const, id: e.id },
                box: { x: e.x, y: e.y, width: e.width, height: e.height },
            })),
        ...boundaries.flatMap((b) =>
            b.targets.length > 0 && b.elementId
                ? [
                      {
                          type: "boundary" as const,
                          id: b.id,
                          activation: {
                              type: "element" as const,
                              id: b.elementId,
                          },
                          box: {
                              ...b.band,
                              x: b.x + b.band.x,
                              y: b.y + b.band.y,
                          },
                      },
                  ]
                : [],
        ),
        ...edges.flatMap((e) =>
            e.targets.length > 0 && e.labelBox
                ? [
                      {
                          type: "edge" as const,
                          id: e.key,
                          activation: {
                              type: "relationship" as const,
                              id: e.id,
                          },
                          box: e.labelBox,
                      },
                  ]
                : [],
        ),
    ];
    return items.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

/* --------------------------------------------------------------- layout */

/**
 * The key each relationship of the view is drawn under, by index, or
 * `undefined` for one that is not drawn: one that ends at a boundary or at
 * something the view does not draw (spec 10.6). A dynamic view may draw one
 * relationship more than once, so a repeat gets `#1`, `#2` and so on.
 */
function edgeKeys(
    relationships: ResolvedRelationship[],
    drawn: ReadonlyMap<string, unknown>,
): (string | undefined)[] {
    const seen = new Map<string, number>();
    return relationships.map(({ id, relationship }) => {
        const { sourceId, destinationId } = relationship;
        if (!drawn.has(sourceId) || !drawn.has(destinationId)) return undefined;
        const repeat = seen.get(id) ?? 0;
        seen.set(id, repeat + 1);
        return repeat === 0 ? id : `${id}#${repeat}`;
    });
}

/** Where the view's layout moves elements, and the vertices Dagre kept. */
type Positions = {
    /** The new top-left of each element that moves, by id. */
    moved: Map<string, Point>;
    /** Dagre's vertices by edge key, in an automatic layout. */
    vertices: Map<string, Point[]>;
    /** Where each unplaced element went, in view order. */
    placements: Placement[];
};

/** What placement knows of an edge's label, by edge key. */
type LabelRoom = {
    /** What an automatic layout keeps for it, as upstream sizes it. */
    room: Size;
    /** Its drawn backing; absent when it says nothing. */
    size?: Size;
};

/**
 * Where the view's layout puts `elements` (spec 7): all of them by Dagre in
 * an automatic layout, only the unplaced ones in a stored layout that has
 * some, none otherwise. Both leave room for each edge's label in `labels`.
 */
function positionElements(
    view: ResolvedView,
    elements: ElementBox[],
    keys: (string | undefined)[],
    labels: ReadonlyMap<string, LabelRoom>,
    boundaries: DeriveBoundaries,
): Positions {
    const vertices = new Map<string, Point[]>();
    if (view.layout === "stored")
        return { moved: new Map(), vertices, placements: [] };

    const parent = new Map<string, string>();
    for (const boundary of view.boundaries)
        for (const child of boundary.children) parent.set(child, boundary.id);
    // A self-relationship is a loop at its element's corner (spec 10.7): it
    // neither ranks Dagre's layout nor makes an element its own neighbor. A
    // dynamic view's response step runs the way it is drawn, back to the
    // source, as upstream hands it to Dagre.
    const edges = view.relationships.flatMap((placed, index) => {
        const id = keys[index];
        const { sourceId, destinationId } = placed.relationship;
        if (id === undefined || sourceId === destinationId) return [];
        const response = view.type === "Dynamic" && placed.response === true;
        return [
            response
                ? { id, source: destinationId, target: sourceId }
                : { id, source: sourceId, target: destinationId },
        ];
    });

    if (view.layout === "automatic") {
        const layout = layOut(
            {
                nodes: elements.map(({ id, width, height }) => ({
                    id,
                    width,
                    height,
                    parent: parent.get(id),
                })),
                boundaries: layoutBoundaries(view),
                edges: edges.map((edge) => ({
                    ...edge,
                    label: labels.get(edge.id)?.room,
                })),
            },
            view.automaticLayout,
        );
        // Dagre never sees how big a derived boundary is, so make the room
        // it did not leave between a boundary and its neighbors: the padding
        // a boundary keeps from its own children. At Structurizr's 300
        // separations Dagre leaves at least that, and nothing moves; spec
        // 7.2's 60 would move Big Bank's Live deployment.
        const { rankDirection } = view.automaticLayout;
        const spaced = spaceBoundaries({
            elements: layout.boxes,
            parent,
            boundaries,
            vertices: layout.edges,
            gap: BOUNDARY_PADDING,
            rankAxis:
                rankDirection === "LeftRight" || rankDirection === "RightLeft"
                    ? "x"
                    : "y",
        });
        const moved = new Map<string, Point>();
        for (const [id, { x, y }] of spaced.elements) moved.set(id, { x, y });
        return { moved, vertices: spaced.vertices, placements: [] };
    }

    const unplaced = new Set(view.unplaced);
    const ancestorsOf = (id: string) => {
        const around: string[] = [];
        for (let p = parent.get(id); p; p = parent.get(p)) around.push(p);
        return around;
    };
    const { rankSeparation, nodeSeparation } = view.automaticLayout;
    const placements = placeUnplaced({
        placed: new Map(
            elements.filter((e) => !unplaced.has(e.id)).map((e) => [e.id, e]),
        ),
        unplaced: elements
            .filter((e) => unplaced.has(e.id))
            .map(({ id, width, height }) => ({
                id,
                width,
                height,
                ancestors: ancestorsOf(id),
            })),
        relationships: edges.map(
            (e) => [e.source, e.target, labels.get(e.id)?.size] as const,
        ),
        // One separation away: the wider of the view's two, so a slot is
        // as far from its neighbor along either axis.
        separation: Math.max(rankSeparation, nodeSeparation),
        boundaries,
    });
    const moved = new Map(placements.map(({ id, x, y }) => [id, { x, y }]));
    return { moved, vertices, placements };
}

/**
 * The view's boundaries as automatic layout takes them. Upstream draws a
 * deployment node behind everything else, sending each to the back as it
 * makes it in view order, so they are marked and given in that order.
 */
function layoutBoundaries(view: ResolvedView): LayoutBoundary[] {
    const listed = new Map(view.elements.map((e, index) => [e.id, index]));
    const made = (b: ResolvedBoundary) =>
        listed.get(b.id) ?? Number.POSITIVE_INFINITY;
    return (
        [...view.boundaries]
            // Two unlisted boundaries compare as NaN, which `|| 0` keeps as equal.
            .sort((a, b) => made(a) - made(b) || 0)
            .map((boundary) => ({
                id: boundary.id,
                parent: boundary.parent,
                behind:
                    boundary.kind === "Element" &&
                    boundary.element.type === "DeploymentNode",
            }))
    );
}

/* ----------------------------------------------------------- boundaries */

/** What deriving each boundary of the view needs: its children and label. */
function boundaryInputs(
    model: WorkspaceModel,
    resolved: ResolvedBoundary[],
    styles: ReadonlyMap<string, ElementStyle>,
    labels: Labels,
    targets: ReadonlyMap<string, TargetKind[]>,
): BoundaryInput[] {
    return resolved.map((boundary) => {
        const style = styles.get(boundary.id)!;
        const element = boundary.kind === "Element" ? boundary.element : null;
        return {
            id: boundary.id,
            children: boundary.children,
            label: {
                name: boundary.name,
                metadata: boundaryMetadata(model, boundary, style, labels),
                fontSize: style.fontSize,
                icon: Boolean(style.icon),
                instances: formatInstanceCount(element?.instances),
                metadataSetsWidth: element?.type === "DeploymentNode",
                indicators: indicatorKinds(targets.get(boundary.id) ?? [])
                    .length,
            },
        };
    });
}

/**
 * Every boundary of the view derived around the drawn `elements` and
 * styled, outer before inner. Children never move (spec 8).
 */
function boundaryBoxes(
    resolved: ResolvedBoundary[],
    inputs: BoundaryInput[],
    styles: ReadonlyMap<string, ElementStyle>,
    targets: ReadonlyMap<string, TargetKind[]>,
    elements: ElementBox[],
    scheme: ModelColorScheme,
    labels: Labels,
    measure: MeasureText,
): BoundaryBox[] {
    const derived = new Map(
        deriveBoundaries(
            inputs,
            new Map(elements.map((e) => [e.id, e])),
            measure,
        ).map((b) => [b.id, b]),
    );

    const boxes: BoundaryBox[] = [];
    for (const boundary of resolved) {
        const box = derived.get(boundary.id);
        if (!box) continue;
        const style = styles.get(boundary.id)!;
        const defaults = SCHEME_DEFAULTS[scheme];
        const description =
            boundary.kind === "Element" &&
            labels.descriptions &&
            style.description
                ? boundary.element.description ?? ""
                : "";
        boxes.push({
            ...box,
            kind: boundary.kind,
            ...(boundary.kind === "Element" && {
                elementId: boundary.element.id,
            }),
            targets: targets.get(boundary.id) ?? [],
            accessibleName: labelText(
                box.name.lines.join(" "),
                box.metadata?.lines.join(" ") ?? "",
                description,
            ),
            depth: boundary.depth,
            radius: boundaryRadius(style.shape),
            background: style.background,
            stroke: style.stroke ?? defaults.color,
            strokeWidth: style.strokeWidth ?? defaults.strokeWidth,
            color: style.color ?? defaults.color,
            border: style.border ?? "Solid",
            opacity: style.opacity / 100,
            icon: style.icon,
        });
    }
    return boxes;
}

/** One notch of `zoomIn` and `zoomOut`. */
export const ZOOM_STEP = 1.2;

/** The next zoom one notch in or out, never below `floor`. */
export function stepZoom(
    zoom: number,
    direction: "in" | "out",
    floor: number,
    ceiling = 4,
): number {
    const next = direction === "in" ? zoom * ZOOM_STEP : zoom / ZOOM_STEP;
    return Math.min(ceiling, Math.max(floor, next));
}

/**
 * The zoom range the canvas allows. Zooming out stops at `fitted`, the scale
 * that shows the whole view, and zooming in at four times that (at least 4).
 * Once the reader has moved, `fitted` still shifts with every resize, so the
 * range widens to take in their `zoom`: a resize never clamps it.
 */
export function zoomLimits(
    fitted: number | null,
    zoom: number,
    moved: boolean,
): { floor: number; ceiling: number } {
    const fit = fitted ?? 0.05;
    const floor = moved ? Math.min(fit, zoom) : fit;
    const ceiling = Math.max(4, fit * 4, moved ? zoom : 0);
    return { floor, ceiling };
}

/** A React Flow viewport: a model point `p` is on screen at `p * zoom + x`. */
export type Viewport = { x: number; y: number; zoom: number };

/** How far inside the canvas an item focused off screen comes to rest. */
const FOCUS_MARGIN = 16;

/** The shift along one axis that brings `[start, end]` inside `[0, length]`. */
function shiftInto(start: number, end: number, length: number): number {
    const low = FOCUS_MARGIN;
    const high = length - FOCUS_MARGIN;
    // Too big to fit: show its start.
    if (end - start > high - low || start < low) return low - start;
    if (end > high) return high - end;
    return 0;
}

/**
 * The viewport that brings `box` (model units) on screen in a canvas of
 * `size`, moved as little as possible and at the same zoom; `null` when it
 * is already in view (spec 6.2).
 */
export function panIntoView(
    viewport: Viewport,
    box: Bounds,
    size: Size,
): Viewport | null {
    const { zoom } = viewport;
    const left = box.x * zoom + viewport.x;
    const top = box.y * zoom + viewport.y;
    const dx = shiftInto(left, left + box.width * zoom, size.width);
    const dy = shiftInto(top, top + box.height * zoom, size.height);
    if (dx === 0 && dy === 0) return null;
    return { x: viewport.x + dx, y: viewport.y + dy, zoom };
}

/**
 * Whether the canvas showing `viewKey` is ready: only once that same view,
 * and not an earlier one, has been painted.
 */
export function readyFor(
    viewKey: string | undefined,
    paintedKey: string | null | undefined,
): boolean {
    return (
        viewKey !== undefined && paintedKey != null && viewKey === paintedKey
    );
}
