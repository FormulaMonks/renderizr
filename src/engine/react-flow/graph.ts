/**
 * The geometry the React Flow island draws, as plain numbers (ADR 3): which
 * elements a view puts where, at what size and in what colors, and which
 * edges join them. Nothing here knows about React.
 *
 * The tracer covers stored layouts only. Boundaries, automatic layout,
 * unplaced elements, shapes and routing arrive in later tickets; until then
 * boundaries are left out and every edge is a straight line between centers.
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

export type { ColorScheme, Labels };

export type Point = { x: number; y: number };

export type ElementBox = {
    id: string;
    /** Top-left, in model units. */
    x: number;
    y: number;
    width: number;
    height: number;
    shape: string;
    name: string;
    metadata: string;
    description: string;
    background: string;
    stroke: string;
    strokeWidth: number;
    color: string;
    fontSize: number;
    border: string;
    opacity: number;
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
 * Where the line from `box`'s center towards `toward` leaves the box. The
 * tracer's stand-in for edge ends on the drawn outline (spec 10.5), so that
 * an arrowhead is not hidden underneath the element it points at.
 */
export function exitPoint(box: ElementBox, toward: Point): Point {
    const from = center(box);
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    if (dx === 0 && dy === 0) return from;
    const scale = Math.min(
        dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx),
        dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy),
    );
    return { x: from.x + dx * scale, y: from.y + dy * scale };
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
    for (const placed of view.elements) {
        if (boundaries.has(placed.id)) continue;
        const style = findElementStyle(model, placed.element, colorScheme);
        elements.push({
            id: placed.id,
            x: placed.x,
            y: placed.y,
            width: style.width,
            height: style.height,
            shape: style.shape ?? "Box",
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
            strokeWidth: style.strokeWidth ?? defaults.strokeWidth,
            color: style.color ?? defaults.color,
            fontSize: style.fontSize,
            border: style.border ?? "Solid",
            opacity: style.opacity / 100,
        });
    }

    const byId = new Map(elements.map((e) => [e.id, e]));
    const edges: EdgeLine[] = [];
    const seen = new Map<string, number>();
    for (const placed of view.relationships) {
        const { relationship } = placed;
        const source = byId.get(relationship.sourceId);
        const target = byId.get(relationship.destinationId);
        if (!source || !target || source === target) continue;
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
            sourceId: source.id,
            targetId: target.id,
            source: exitPoint(source, center(target)),
            target: exitPoint(target, center(source)),
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
