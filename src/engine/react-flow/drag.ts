/**
 * Dragging elements in edit mode (spec 9.1, 10.1, ADR 18), as plain
 * functions over a built graph. A drag moves elements inside the island frame
 * by frame and never crosses the contract; its drop becomes one layout change
 * for the page, which hands the layout back or lets the drop revert.
 */

import type {
    EditedLayout,
    EditedRoute,
    LayoutChange,
} from "../../model/index";
import { offOrigin } from "../geometry/snapping";
import type { Point } from "../geometry/shapes/types";
import { storedRoutes } from "./commands";
import type { Graph } from "./graph";

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Where each dragged element is now, by element id. */
export type DragPositions = ReadonlyMap<string, Point>;

/**
 * The edited layout a drag frame draws: every element of `graph` where it is
 * drawn, the dragged ones where the pointer has them. Naming every element
 * keeps a view without coordinates, or with unplaced elements, from being
 * laid out again around the drag.
 */
export function dragLayout(
    graph: Graph,
    positions: DragPositions,
): EditedLayout {
    const elements: Record<string, Point> = {};
    for (const { id, x, y } of graph.elements)
        elements[id] = positions.get(id) ?? { x, y };
    const relationships = carriedRoutes(graph, positions);
    return relationships ? { elements, relationships } : { elements };
}

/**
 * The stored vertices of every relationship of `graph` whose two ends
 * `positions` moves by the same amount, moved along with them, by
 * relationship key; `undefined` when there are none. Other vertices stay
 * (spec 12.3).
 */
export function carriedRoutes(
    graph: Graph,
    positions: DragPositions,
): Record<string, EditedRoute> | undefined {
    const drawn = new Map(graph.elements.map((e) => [e.id, e]));
    const shiftOf = (id: string) => {
        const to = positions.get(id);
        const from = drawn.get(id);
        return to && from && { x: to.x - from.x, y: to.y - from.y };
    };
    const routes = storedRoutes(graph);
    let carried: Record<string, EditedRoute> | undefined;
    for (const { key, sourceId, targetId } of graph.edges) {
        const vertices = routes.get(key);
        const shift = shiftOf(sourceId);
        const other = shiftOf(targetId);
        if (!vertices || !shift || !other) continue;
        if (!same(shift, other) || same(shift, { x: 0, y: 0 })) continue;
        carried ??= {};
        carried[key] = {
            vertices: vertices.map((v) => ({
                x: v.x + shift.x,
                y: v.y + shift.y,
            })),
        };
    }
    return carried;
}

/** `point` as it would be saved: whole units, never on (0,0). */
const saved = ({ x, y }: Point) =>
    offOrigin({ x: Math.round(x) || 0, y: Math.round(y) || 0 });

/**
 * The layout change a drop on view `view` makes, or `null` when nothing
 * moved. `graph` is the view as drawn before the drag and `edited` its
 * edited layout.
 *
 * `before` holds what the engine drew, computed positions included. The
 * first change to a view (one whose edited layout doesn't place every
 * element) carries every element and the canvas, so the view looks the same
 * after a reload and its first save writes its canvas (spec 7.3, 14); a
 * later one carries only the elements that moved.
 */
export function dropChange(
    view: string,
    graph: Graph,
    edited: EditedLayout | undefined,
    positions: DragPositions,
): LayoutChange | null {
    const drawn = new Map(graph.elements.map(({ id, x, y }) => [id, { x, y }]));
    const moved = [...positions].filter(([id, point]) => {
        const from = drawn.get(id);
        return from !== undefined && !same(saved(point), from);
    });
    if (moved.length === 0) return null;

    const first = graph.elements.some((e) => !edited?.elements?.[e.id]);
    const before: Record<string, Point> = {};
    const after: Record<string, Point> = {};
    if (first) {
        for (const [id, point] of drawn) {
            before[id] = point;
            after[id] = saved(point);
        }
    }
    for (const [id, point] of moved) {
        before[id] = drawn.get(id) as Point;
        after[id] = saved(point);
    }
    if (!first)
        return {
            view,
            before: { elements: before },
            after: { elements: after },
        };
    return {
        view,
        before: { elements: before, dimensions: graph.canvas },
        after: { elements: after, dimensions: graph.canvas },
    };
}
