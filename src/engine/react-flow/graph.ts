/**
 * The geometry the React Flow island draws, as plain numbers (ADR 3): which
 * elements a view puts where, at what size and in what colors, and which
 * edges join them. Nothing here knows about React.
 *
 * Boundaries are derived from their children here, before React renders
 * (spec 8, ADR 9). Automatic layout and unplaced elements arrive in later
 * tickets. Every edge is routed by `routeView` (spec 10).
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
import { type IconPosition, iconPositionOf } from "../geometry/label";
import {
    type RoutingElement,
    type RoutingMode,
    routeView,
    routingModeOf,
} from "../geometry/routing/route-view";
import { shapeGeometry, shapeSize } from "../geometry/shapes/index";
import type { Shape, ShapeGeometry, ShapePart } from "../geometry/shapes/types";

export type { Bounds, ColorScheme, Labels };

export type Point = { x: number; y: number };

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
    /** SVG path data for the edge as drawn, curves and jump-overs included. */
    path: string;
    routing: RoutingMode;
    /** Whether it draws a jump-over where it crosses an edge (spec 10.11). */
    jump: boolean;
    /** The relationship's stored vertices, which the route passes through. */
    vertices: Point[];
    /** In a dynamic view, the order the view gives this edge. */
    order?: string;
    label: string;
    fontSize: number;
    /** The label's wrap width. */
    labelWidth: number;
    color: string;
    thickness: number;
    style: "Solid" | "Dashed" | "Dotted";
    opacity: number;
};

export type Graph = {
    key: string;
    title: string;
    background: string;
    elements: ElementBox[];
    /** Outer before inner, the order they are drawn in. */
    boundaries: BoundaryBox[];
    edges: EdgeLine[];
    /** The box around every element and every route. */
    bounds: Bounds;
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

    const drawnBoundaries = boundaryBoxes(
        model,
        view.boundaries,
        elements,
        colorScheme,
        labels,
        measure,
    );

    const edges: Omit<EdgeLine, "source" | "target" | "route" | "path">[] = [];
    const warnings: string[] = [];
    const seen = new Map<string, number>();
    for (const placed of view.relationships) {
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
        const from = drawn.get(relationship.sourceId);
        const to = drawn.get(relationship.destinationId);
        if (!from || !to) continue;
        const style = findRelationshipStyle(model, relationship, colorScheme);
        const description =
            labels.descriptions && style.description
                ? placed.description ?? relationship.description ?? ""
                : "";
        const technology =
            style.metadata && labels.technologies
                ? getMetadataForRelationship(model, relationship)
                : "";
        const repeat = seen.get(placed.id) ?? 0;
        seen.set(placed.id, repeat + 1);
        edges.push({
            key: repeat === 0 ? placed.id : `${placed.id}#${repeat}`,
            id: placed.id,
            sourceId: from.box.id,
            targetId: to.box.id,
            routing: routingModeOf(placed.routing ?? style.routing),
            jump: placed.jump ?? style.jump ?? false,
            vertices: placed.vertices ?? [],
            ...(placed.order !== undefined && { order: placed.order }),
            label: [description, technology].filter(Boolean).join("\n"),
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
    const routed: EdgeLine[] = edges.map((edge, index) => {
        const { route, path } = routes[index];
        return {
            ...edge,
            source: route[0],
            target: route[route.length - 1],
            route,
            path,
        };
    });

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
            ]) ?? NO_BOUNDS,
        warnings,
    };
}

/**
 * Every boundary of the view derived around the drawn `elements` and
 * styled, outer before inner. Children never move (spec 8).
 */
function boundaryBoxes(
    model: WorkspaceModel,
    resolved: ResolvedBoundary[],
    elements: ElementBox[],
    scheme: ModelColorScheme,
    labels: Labels,
    measure: MeasureText,
): BoundaryBox[] {
    const styles = new Map(
        resolved.map((b) => [b.id, boundaryStyle(model, b, scheme)]),
    );
    const inputs: BoundaryInput[] = resolved.map((boundary) => {
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
