/**
 * The geometry the React Flow island draws, as plain numbers (ADR 3): which
 * elements a view puts where, at what size and in what colors, and which
 * edges join them. Nothing here knows about React.
 *
 * The tracer covers stored layouts only. Boundaries, automatic layout,
 * unplaced elements and routing arrive in later tickets; until then
 * boundaries are left out and every edge is a straight line between centers,
 * cut short where it crosses each end's drawn outline.
 */

import {
    findElementStyle,
    findRelationshipStyle,
    getMetadataForElement,
    getMetadataForRelationship,
    resolveView,
    SCHEME_DEFAULTS,
    type WorkspaceModel,
} from "../../model/index";

import type { ColorScheme, Labels } from "../contract";
import { type IconPosition, iconPositionOf } from "../geometry/label";
import { shapeGeometry, shapeSize } from "../geometry/shapes/index";
import { intersect } from "../geometry/shapes/outline";
import type { Shape, ShapeGeometry, ShapePart } from "../geometry/shapes/types";

export type { ColorScheme, Labels };

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
};

export type EdgeLine = {
    /** Unique within the graph: a dynamic view draws one relationship more than once. */
    key: string;
    /** The relationship's id, which a dynamic view may repeat. */
    id: string;
    sourceId: string;
    targetId: string;
    source: Point;
    target: Point;
    /** The drawn route, as the points it passes through, source first. */
    path: Point[];
    /** The relationship's stored vertices; the tracer does not route through them yet. */
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

export type Bounds = { x: number; y: number; width: number; height: number };

export type Graph = {
    key: string;
    title: string;
    background: string;
    elements: ElementBox[];
    edges: EdgeLine[];
    bounds: Bounds;
};

const SCHEME = { light: "Light", dark: "Dark" } as const;

const center = (box: ElementBox): Point => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
});

/**
 * Where the line from the center of `geometry`, drawn with its top-left at
 * `box`, towards `toward` leaves the shape, so that an arrowhead touches the
 * outline it points at rather than the box around it (spec 10.5).
 */
export function exitPoint(
    box: Point,
    geometry: ShapeGeometry,
    toward: Point,
): Point {
    const end = intersect(geometry, {
        x: toward.x - box.x,
        y: toward.y - box.y,
    });
    return { x: box.x + end.x, y: box.y + end.y };
}

/** The box around every element, or an empty box at the origin. */
export function boundsOf(elements: ElementBox[]): Bounds {
    if (!elements.length) return { x: 0, y: 0, width: 0, height: 0 };
    const left = Math.min(...elements.map((e) => e.x));
    const top = Math.min(...elements.map((e) => e.y));
    const right = Math.max(...elements.map((e) => e.x + e.width));
    const bottom = Math.max(...elements.map((e) => e.y + e.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Lay out one view for drawing. `undefined` when the workspace has no view
 * with that key.
 */
export function buildGraph(
    model: WorkspaceModel,
    key: string,
    scheme: ColorScheme,
    labels: Labels,
): Graph | undefined {
    const view = resolveView(model, key);
    if (!view) return undefined;
    const colorScheme = SCHEME[scheme];
    const defaults = SCHEME_DEFAULTS[colorScheme];
    const boundaries = new Set(view.boundaries);

    const elements: ElementBox[] = [];
    /** Each element by id, with the geometry its edge ends are clipped to. */
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
        };
        elements.push(box);
        drawn.set(box.id, { box, geometry });
    }

    const edges: EdgeLine[] = [];
    const seen = new Map<string, number>();
    for (const placed of view.relationships) {
        const { relationship } = placed;
        const from = drawn.get(relationship.sourceId);
        const to = drawn.get(relationship.destinationId);
        if (!from || !to || from === to) continue;
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
        const start = exitPoint(from.box, from.geometry, center(to.box));
        const end = exitPoint(to.box, to.geometry, center(from.box));
        edges.push({
            key: repeat === 0 ? placed.id : `${placed.id}#${repeat}`,
            id: placed.id,
            sourceId: from.box.id,
            targetId: to.box.id,
            source: start,
            target: end,
            path: [start, end],
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

    return {
        key: view.key,
        title: view.title,
        background: defaults.background,
        elements,
        edges,
        bounds: boundsOf(elements),
    };
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
