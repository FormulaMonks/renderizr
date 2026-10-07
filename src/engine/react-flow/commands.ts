/**
 * Edit mode's commands on a whole view (spec 9.2, 14, 15): the three canvas
 * commands, "Bring elements back onto the diagram" and "Calculate layout",
 * as plain functions from a built graph to one layout change. The page
 * hands each change back through `setLayout`, as it does a drop (ADR 18).
 */

import type {
    Dimensions,
    EditedLayout,
    EditedRoute,
    LayoutChange,
} from "../../model/index";
import type { Bounds } from "../geometry/bounds";
import {
    type CanvasCommand,
    centeringShift,
    clampBox,
    clampPoint,
    resizedCanvas,
} from "../geometry/canvas";
import type { Point } from "../geometry/shapes/types";
import { offOrigin } from "../geometry/snapping";
import type { Graph } from "./graph";

/** What "Calculate layout" needs of the dialog's options here. */
export type CalculateOptions = { vertices: boolean };

type Fields = {
    elements: Record<string, Point>;
    relationships: Record<string, EditedRoute>;
    dimensions?: Dimensions;
    paperSize?: string | null;
};

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const sameRoute = (a: readonly Point[], b: readonly Point[]) =>
    a.length === b.length && a.every((point, i) => same(point, b[i]));

const sameSize = (a: Dimensions, b: Dimensions) =>
    a.width === b.width && a.height === b.height;

/** `point` in whole units, never on (0,0) (spec 7.3). */
const saved = ({ x, y }: Point) =>
    offOrigin({ x: Math.round(x) || 0, y: Math.round(y) || 0 });

const shifted = ({ x, y }: Point, by: Point) => ({ x: x + by.x, y: y + by.y });

/**
 * The vertices each relationship stores, by relationship key: none in an
 * automatic layout, whose drawn vertices are Dagre's and never saved by a
 * first edit (spec 8). The first listing of an edge wins.
 */
export function storedRoutes(graph: Graph): Map<string, readonly Point[]> {
    const routes = new Map<string, readonly Point[]>();
    if (graph.layout === "automatic") return routes;
    for (const edge of graph.edges)
        if (edge.vertices.length > 0 && !routes.has(edge.key))
            routes.set(edge.key, edge.vertices);
    return routes;
}

/**
 * Whether a change to the view drawn as `graph` is its first: its edited
 * layout doesn't place every element yet. The first change carries every
 * element and the canvas, so the view looks the same after a reload and its
 * first save writes its canvas (spec 7.3, 14).
 */
export const isFirstChange = (graph: Graph, edited: EditedLayout | undefined) =>
    graph.elements.some((e) => !edited?.elements?.[e.id]);

/** The fields every first change carries, before and after alike. */
function firstFields(graph: Graph, edited: EditedLayout | undefined) {
    const before: Fields = { elements: {}, relationships: {} };
    const after: Fields = { elements: {}, relationships: {} };
    if (!isFirstChange(graph, edited)) return { before, after };
    for (const { id, x, y } of graph.elements) {
        before.elements[id] = { x, y };
        after.elements[id] = saved({ x, y });
    }
    before.dimensions = graph.canvas;
    after.dimensions = graph.canvas;
    return { before, after };
}

/** `fields` as an edited layout, without the empty maps. */
function layoutOf({ elements, relationships, ...rest }: Fields): EditedLayout {
    return {
        ...(Object.keys(elements).length > 0 && { elements }),
        ...(Object.keys(relationships).length > 0 && { relationships }),
        ...rest,
    };
}

/** Move every element and stored vertex of `graph` by `shift`. */
function shiftAll(graph: Graph, shift: Point, before: Fields, after: Fields) {
    if (shift.x === 0 && shift.y === 0) return;
    for (const { id, x, y } of graph.elements) {
        before.elements[id] = { x, y };
        after.elements[id] = saved(shifted({ x, y }, shift));
    }
    for (const [key, vertices] of storedRoutes(graph)) {
        before.relationships[key] = { vertices };
        after.relationships[key] = {
            vertices: vertices.map((v) => shifted(v, shift)),
        };
    }
}

/**
 * The change canvas command `command` makes on view `view`, drawn as
 * `graph` with edited layout `edited`, or `null` when it changes nothing.
 * Decrease and Increase delete `paperSize`; Auto keeps it. With `recenter`
 * every element and stored vertex moves so the content sits in the middle
 * of the new canvas (spec 14).
 */
export function canvasChange(
    view: string,
    graph: Graph,
    edited: EditedLayout | undefined,
    command: CanvasCommand,
    recenter: boolean,
): LayoutChange | null {
    const { before, after } = firstFields(graph, edited);
    const dimensions = resizedCanvas(command, graph.canvas, graph.bounds);
    const shift = recenter
        ? centeringShift(dimensions, graph.bounds)
        : { x: 0, y: 0 };
    const deletesPaper =
        command !== "auto" &&
        (edited?.paperSize !== undefined
            ? edited.paperSize !== null
            : graph.paperSize !== undefined);
    if (
        sameSize(dimensions, graph.canvas) &&
        !deletesPaper &&
        shift.x === 0 &&
        shift.y === 0 &&
        Object.keys(after.elements).length === 0
    )
        return null;

    before.dimensions = graph.canvas;
    after.dimensions = dimensions;
    if (deletesPaper) {
        before.paperSize = edited?.paperSize ?? graph.paperSize;
        after.paperSize = null;
    }
    shiftAll(graph, shift, before, after);
    return { view, before: layoutOf(before), after: layoutOf(after) };
}

/**
 * "Bring elements back onto the diagram" (spec 15): every element moved
 * just inside the canvas, and every stored vertex onto it, as one change;
 * `null` when everything is on it already.
 */
export function bringBackChange(
    view: string,
    graph: Graph,
    edited: EditedLayout | undefined,
): LayoutChange | null {
    const { before, after } = firstFields(graph, edited);
    let changed = false;
    for (const { id, x, y, width, height } of graph.elements) {
        const to = saved(clampBox({ x, y }, { width, height }, graph.canvas));
        if (same(to, { x, y })) continue;
        changed = true;
        before.elements[id] = { x, y };
        after.elements[id] = to;
    }
    for (const [key, vertices] of storedRoutes(graph)) {
        const to = vertices.map((v) => clampPoint(v, graph.canvas));
        if (sameRoute(to, vertices)) continue;
        changed = true;
        before.relationships[key] = { vertices };
        after.relationships[key] = { vertices: to };
    }
    if (!changed) return null;
    return { view, before: layoutOf(before), after: layoutOf(after) };
}

/**
 * The calculated layout (spec 15) of view `view`, drawn now as `graph`,
 * from `calculated`, the same view laid out by
 * `calculatedGraph`: every element in whole units, Dagre's vertices on
 * every relationship (none with `vertices` off), and the canvas fitted by
 * Auto's rule with the content in its middle, which keeps every element off
 * (0,0). `routing`, `position` and `jump` stay as they are. Always one
 * change, which undoes positions, vertices and canvas together.
 */
export function calculatedChange(
    view: string,
    graph: Graph,
    calculated: Graph,
    options: CalculateOptions,
): LayoutChange {
    const rounded = (point: Point) => ({
        x: Math.round(point.x) || 0,
        y: Math.round(point.y) || 0,
    });
    const content: Bounds = calculated.bounds;
    const dimensions = resizedCanvas("auto", graph.canvas, content);
    const shift = centeringShift(dimensions, content);

    const before: Fields = {
        elements: {},
        relationships: {},
        dimensions: graph.canvas,
    };
    const after: Fields = { elements: {}, relationships: {}, dimensions };
    for (const { id, x, y } of graph.elements) before.elements[id] = { x, y };
    for (const { id, x, y } of calculated.elements)
        after.elements[id] = offOrigin(rounded(shifted({ x, y }, shift)));

    const stored = storedRoutes(graph);
    for (const edge of calculated.edges) {
        if (after.relationships[edge.key]) continue;
        before.relationships[edge.key] = {
            vertices: stored.get(edge.key) ?? [],
        };
        after.relationships[edge.key] = {
            vertices: options.vertices
                ? edge.vertices.map((v) => rounded(shifted(v, shift)))
                : [],
        };
    }
    return { view, before: layoutOf(before), after: layoutOf(after) };
}
