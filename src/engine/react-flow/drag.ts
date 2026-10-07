/**
 * Dragging elements in edit mode (spec 9.1, 10.1, ADR 18), as plain
 * functions over a built graph. A drag moves elements inside the island frame
 * by frame and never crosses the contract; its drop becomes one layout change
 * for the page, which hands the layout back or lets the drop revert.
 */

import type { EditedLayout, LayoutChange } from "../../model/index";
import { offOrigin } from "../geometry/snapping";
import type { Point } from "../geometry/shapes/types";
import type { Graph } from "./graph";

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
    return { elements };
}

/** `point` as it would be saved: whole units, never on (0,0). */
const saved = ({ x, y }: Point) =>
    offOrigin({ x: Math.round(x) || 0, y: Math.round(y) || 0 });

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/**
 * The layout change a drop on view `view` makes, or `null` when nothing
 * moved. `graph` is the view as drawn before the drag and `edited` its
 * edited layout.
 *
 * `before` holds what the engine drew, computed positions included. The
 * first change to a view (one whose edited layout doesn't place every
 * element) carries every element, so the view looks the same after a reload
 * (spec 7.3); a later one carries only the elements that moved.
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
    return { view, before: { elements: before }, after: { elements: after } };
}
