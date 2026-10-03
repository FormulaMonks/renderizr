/**
 * The geometry the React Flow island draws, as plain numbers (ADR 3): which
 * elements a view puts where, at what size and in what colors, and which
 * edges join them. Nothing here knows about React.
 *
 * Elements are placed first: where the view stores them, by Dagre when it
 * stores nowhere (spec 7.1, ADR 4), or around the stored ones when only some
 * are unplaced (spec 7.2, ADR 10). Boundaries are then derived from their
 * children, before React renders (spec 8, ADR 9). Routing arrives in a later
 * ticket; until then every edge is a straight line between centers, cut
 * short where it crosses each end's drawn outline.
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
import { type IconPosition, iconPositionOf } from "../geometry/label";
import { shapeGeometry, shapeSize } from "../geometry/shapes/index";
import { intersect } from "../geometry/shapes/outline";
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
    source: Point;
    target: Point;
    /** The drawn route, as the points it passes through, source first. */
    route: Point[];
    /**
     * The relationship's stored vertices, or Dagre's in an automatic layout
     * that keeps them; the tracer does not route through them yet.
     */
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
    bounds: Bounds;
    /**
     * Where each unplaced element of a stored layout was put, in view order,
     * for the console line that names it (spec 7.2).
     */
    placements: (Placement & { name: string })[];
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

/** The bounds of an empty view: nothing, at the origin. */
const NO_BOUNDS: Bounds = { x: 0, y: 0, width: 0, height: 0 };

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

    const edges: EdgeLine[] = [];
    for (const [index, placed] of view.relationships.entries()) {
        const { relationship } = placed;
        const key = keys[index];
        const from = drawn.get(relationship.sourceId);
        const to = drawn.get(relationship.destinationId);
        if (key === undefined || !from || !to) continue;
        const style = findRelationshipStyle(model, relationship, colorScheme);
        const description =
            labels.descriptions && style.description
                ? placed.description ?? relationship.description ?? ""
                : "";
        const technology =
            style.metadata && labels.technologies
                ? getMetadataForRelationship(model, relationship)
                : "";
        const start = exitPoint(from.box, from.geometry, center(to.box));
        const end = exitPoint(to.box, to.geometry, center(from.box));
        edges.push({
            key,
            id: placed.id,
            sourceId: from.box.id,
            targetId: to.box.id,
            source: start,
            target: end,
            route: [start, end],
            vertices: vertices.get(key) ?? placed.vertices ?? [],
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
        boundaries: drawnBoundaries,
        edges,
        bounds: boundsOf([...elements, ...drawnBoundaries]) ?? NO_BOUNDS,
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
 * something the view does not draw (spec 10.6), or at its own source. A
 * dynamic view may draw one relationship more than once, so a repeat gets
 * `#1`, `#2` and so on.
 */
function edgeKeys(
    relationships: ResolvedRelationship[],
    drawn: ReadonlyMap<string, unknown>,
): (string | undefined)[] {
    const seen = new Map<string, number>();
    return relationships.map(({ id, relationship }) => {
        const { sourceId, destinationId } = relationship;
        if (
            !drawn.has(sourceId) ||
            !drawn.has(destinationId) ||
            sourceId === destinationId
        )
            return undefined;
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
    const edges = view.relationships.flatMap(({ relationship }, index) => {
        const id = keys[index];
        return id === undefined
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
