/**
 * The geometry the React Flow island draws, as plain numbers (ADR 3): which
 * elements a view puts where, at what size and in what colors, and which
 * edges join them. Nothing here knows about React.
 *
 * Elements are placed first: where the view stores them, by Dagre when it
 * stores nowhere (spec 7.1, ADR 4), or around the stored ones when only some
 * are unplaced (spec 7.2, ADR 10). Boundaries are then derived from their
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
    getMetadataForElement,
    getMetadataForRelationship,
    type ResolvedBoundary,
    type ResolvedRelationship,
    type ResolvedView,
    resolveView,
    SCHEME_DEFAULTS,
    type WorkspaceModel,
} from "../../model/index";

import type { ColorScheme, Labels } from "../contract";
import {
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
import { type Bounds, boundsOf } from "../geometry/bounds";
import {
    type EdgeLabelLayout,
    edgeLabelText,
    layoutEdgeLabel,
    placeEdgeLabels,
} from "../geometry/edge-label";
import { type IconPosition, iconPositionOf } from "../geometry/label";
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
import {
    type DeriveBoundaries,
    type Placement,
    placeUnplaced,
} from "../geometry/unplaced";
import { layOut } from "../layout/automatic";

export type { Bounds, ColorScheme, Labels };

export type { Point };

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
};

/** A boundary drawn around its children, with its label band (spec 8). */
export type BoundaryBox = DerivedBoundary & {
    kind: BoundaryKind;
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
};

const SCHEME = { light: "Light", dark: "Dark" } as const;

/** The bounds of an empty view: nothing, at the origin. */
const NO_BOUNDS: Bounds = { x: 0, y: 0, width: 0, height: 0 };

/**
 * A route point as an empty box, so the view's bounds take in every route:
 * a self-relationship's loop reaches outside its element.
 */
const pointBox = ({ x, y }: Point): Bounds => ({ x, y, width: 0, height: 0 });

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
 * no view with that key.
 */
export function buildGraph(
    model: WorkspaceModel,
    key: string,
    scheme: ColorScheme,
    labels: Labels,
    measure: MeasureText = estimateText,
): Graph | undefined {
    const view = resolveView(model, key);
    if (!view) return undefined;
    const colorScheme = SCHEME[scheme];
    const defaults = SCHEME_DEFAULTS[colorScheme];
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
    const inputs = boundaryInputs(model, view.boundaries, styles, labels);
    const keys = edgeKeys(view.relationships, drawn);
    const { moved, vertices, placements } = positionElements(
        view,
        elements,
        keys,
        (placed) =>
            new Map(
                deriveBoundaries(inputs, placed, measure).map((b) => [b.id, b]),
            ),
    );
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
        elements,
        colorScheme,
        measure,
    );

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
        const label = layoutEdgeLabel(
            text,
            style.fontSize,
            style.width,
            measure,
        );
        edges.push({
            key,
            id: placed.id,
            sourceId: from.box.id,
            targetId: to.box.id,
            routing: routingModeOf(placed.routing ?? style.routing),
            jump: placed.jump ?? style.jump ?? false,
            vertices: vertices.get(key) ?? placed.vertices ?? [],
            ...(placed.order !== undefined && { order: placed.order }),
            ...text,
            ...(label && { label }),
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
            };
        },
    );

    return {
        key: view.key,
        title: view.title,
        background: defaults.background,
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
    };
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

/**
 * Where the view's layout puts `elements` (spec 7): all of them by Dagre in
 * an automatic layout, only the unplaced ones in a stored layout that has
 * some, none otherwise.
 */
function positionElements(
    view: ResolvedView,
    elements: ElementBox[],
    keys: (string | undefined)[],
    boundaries: DeriveBoundaries,
): Positions {
    const vertices = new Map<string, Point[]>();
    if (view.layout === "stored")
        return { moved: new Map(), vertices, placements: [] };

    const parent = new Map<string, string>();
    for (const boundary of view.boundaries)
        for (const child of boundary.children) parent.set(child, boundary.id);
    // A self-relationship is a loop at its element's corner (spec 10.7): it
    // neither ranks Dagre's layout nor makes an element its own neighbor.
    const edges = view.relationships.flatMap(({ relationship }, index) => {
        const id = keys[index];
        return id === undefined ||
            relationship.sourceId === relationship.destinationId
            ? []
            : [
                  {
                      id,
                      source: relationship.sourceId,
                      target: relationship.destinationId,
                  },
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
                boundaries: view.boundaries.map(({ id, parent }) => ({
                    id,
                    parent,
                })),
                edges,
            },
            view.automaticLayout,
        );
        const moved = new Map<string, Point>();
        for (const [id, { x, y }] of layout.boxes) moved.set(id, { x, y });
        return { moved, vertices: layout.edges, placements: [] };
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
        relationships: edges.map((e) => [e.source, e.target] as const),
        // One separation away: the wider of the view's two, so a slot is
        // as far from its neighbor along either axis.
        separation: Math.max(rankSeparation, nodeSeparation),
        boundaries,
    });
    const moved = new Map(placements.map(({ id, x, y }) => [id, { x, y }]));
    return { moved, vertices, placements };
}

/* ----------------------------------------------------------- boundaries */

/** What deriving each boundary of the view needs: its children and label. */
function boundaryInputs(
    model: WorkspaceModel,
    resolved: ResolvedBoundary[],
    styles: ReadonlyMap<string, ElementStyle>,
    labels: Labels,
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
    elements: ElementBox[],
    scheme: ModelColorScheme,
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
        boxes.push({
            ...box,
            kind: boundary.kind,
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
