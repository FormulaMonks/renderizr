/**
 * Edit mode's changes to one edge (spec 12): a vertex added, moved or
 * removed, a side chosen for an edge end, a label slid along its route and
 * a routing mode set, as plain functions from a built graph to one layout
 * change. The page hands each change back through `setLayout`, as it does a
 * drop (ADR 18).
 */

import type {
    EditedLayout,
    EditedRoute,
    LayoutChange,
} from "../../model/index";
import type { Bounds } from "../geometry/bounds";
import {
    holdsSide,
    nearestSide,
    sideVertex,
    vertexIndex,
} from "../geometry/edge-editing";
import type { Point, Rect } from "../geometry/shapes/types";
import { fieldsChange, firstChangeFields } from "./commands";
import type { EdgeLine, Graph } from "./graph";

const rounded = ({ x, y }: Point): Point => ({
    x: Math.round(x) || 0,
    y: Math.round(y) || 0,
});

const sameRoute = (a: readonly Point[] = [], b: readonly Point[] = []) =>
    a.length === b.length &&
    a.every((point, i) => point.x === b[i].x && point.y === b[i].y);

/** The fields of `route` as `edge` draws them now, computed values included. */
const drawnRoute = (edge: EdgeLine, route: EditedRoute): EditedRoute => ({
    ...(route.vertices && { vertices: edge.vertices }),
    ...(route.routing && { routing: edge.routing }),
    ...(route.position !== undefined && { position: edge.labelPosition }),
});

/**
 * The change that sets `route` on the edge `key` of view `view`, drawn as
 * `graph` with edited layout `edited`, or `null` when the edge draws that
 * way already. `before` holds the fields as drawn, routing modes from
 * styles and placed labels included; the view's first change also carries
 * every element and the canvas (spec 7.3, 9.2).
 */
export function routeChange(
    view: string,
    graph: Graph,
    edited: EditedLayout | undefined,
    key: string,
    route: EditedRoute,
): LayoutChange | null {
    const edge = graph.edges.find((each) => each.key === key);
    if (!edge) return null;
    const was = drawnRoute(edge, route);
    if (
        sameRoute(was.vertices, route.vertices) &&
        was.routing === route.routing &&
        was.position === route.position
    )
        return null;
    const { before, after } = firstChangeFields(graph, edited);
    before.relationships[key] = was;
    after.relationships[key] = route;
    return fieldsChange(view, before, after);
}

/**
 * `edge`'s vertices with one added at `point`, in whole units, on the leg
 * of its route the point is on (spec 12.3).
 */
export function withVertex(edge: EdgeLine, point: Point): Point[] {
    const vertices = [...edge.vertices];
    vertices.splice(
        vertexIndex(edge.route, vertices, point),
        0,
        rounded(point),
    );
    return vertices;
}

/**
 * `edge`'s vertices once an edge-end drag on its `end`, the end on `box`,
 * drops at `pointer` (spec 12.4): the vertex that holds the side nearest
 * the pointer goes first (or last), in place of the one there while that
 * one still holds a side, ahead of it otherwise. `reach` is how near the
 * side's middle snaps, in model units.
 */
export function sideChange(
    edge: EdgeLine,
    box: Rect,
    end: "source" | "target",
    pointer: Point,
    reach: number,
): Point[] {
    const vertex = sideVertex(box, nearestSide(box, pointer), pointer, reach);
    const vertices = [...edge.vertices];
    const source = end === "source";
    const nearest = source ? vertices[0] : vertices[vertices.length - 1];
    const replace = nearest !== undefined && holdsSide(box, nearest) ? 1 : 0;
    if (source) vertices.splice(0, replace, vertex);
    else vertices.splice(vertices.length - replace, replace, vertex);
    return vertices;
}

/**
 * What a vertex of edge `key` dragged at `index` snaps to (spec 11): every
 * element, every other vertex in the view and the edge's own edge ends,
 * each vertex and end as a box of no size.
 */
export function vertexTargets(
    graph: Graph,
    key: string,
    index: number,
): Bounds[] {
    const point = ({ x, y }: Point): Bounds => ({ x, y, width: 0, height: 0 });
    const targets: Bounds[] = [...graph.elements];
    for (const edge of graph.edges) {
        const own = edge.key === key;
        for (const [i, vertex] of edge.vertices.entries())
            if (!own || i !== index) targets.push(point(vertex));
        if (own) targets.push(point(edge.source), point(edge.target));
    }
    return targets;
}
