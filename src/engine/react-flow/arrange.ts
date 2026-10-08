/**
 * The layout change an arranging command makes (spec 13): align,
 * distribute or a nudge moves some elements of a built graph, and the
 * relationships whose two ends move alike take their vertices along (spec
 * 12.3). The page hands the change back through `setLayout`, as it does a
 * drop (ADR 18).
 */

import type {
    EditedLayout,
    EditedRoute,
    LayoutChange,
} from "../../model/index";
import {
    type AlignEdge,
    align,
    type DistributeAxis,
    distribute,
    nudge,
} from "../geometry/arrange";
import type { Point } from "../geometry/shapes/types";
import { storedRoutes } from "./commands";
import { type DragPositions, dropChange } from "./drag";
import type { Graph } from "./graph";

/** An arranging command and what it takes. */
export type Arrangement =
    | { align: AlignEdge }
    | { distribute: DistributeAxis }
    | { nudge: Point };

/**
 * The change `arrangement` makes to `selection`, element ids in selection
 * order with the reference element first, on view `view` drawn as `graph`;
 * `null` below the command's minimum or when nothing moves (spec 13.4).
 */
export function arrangeChange(
    view: string,
    graph: Graph,
    edited: EditedLayout | undefined,
    selection: readonly string[],
    arrangement: Arrangement,
): LayoutChange | null {
    const drawn = new Map(
        graph.elements.map((element) => [element.id, element]),
    );
    const boxes = selection.flatMap((id) => {
        const element = drawn.get(id);
        return element
            ? [
                  {
                      id,
                      x: element.x,
                      y: element.y,
                      width: element.width,
                      height: element.height,
                  },
              ]
            : [];
    });
    const positions =
        "align" in arrangement
            ? align(boxes, arrangement.align)
            : "distribute" in arrangement
              ? distribute(boxes, arrangement.distribute)
              : nudge(boxes, arrangement.nudge);
    return moveChange(view, graph, edited, positions);
}

/**
 * The change that moves the elements of `positions` on view `view`, drawn
 * as `graph` with edited layout `edited`, or `null` when none of them
 * moves. Like a drop, it saves whole units and never (0,0), and the first
 * change to a view carries every element and the canvas. A relationship
 * whose source and target both move by the same amount moves its stored
 * vertices by that amount too; every other relationship keeps them.
 */
export function moveChange(
    view: string,
    graph: Graph,
    edited: EditedLayout | undefined,
    positions: DragPositions,
): LayoutChange | null {
    const change = dropChange(view, graph, edited, positions);
    if (!change) return null;

    const moved = change.after.elements ?? {};
    const shifts = new Map<string, Point>();
    for (const { id, x, y } of graph.elements) {
        const to = positions.has(id) ? moved[id] : undefined;
        if (to && (to.x !== x || to.y !== y))
            shifts.set(id, { x: to.x - x, y: to.y - y });
    }

    const before: Record<string, EditedRoute> = {};
    const after: Record<string, EditedRoute> = {};
    const ends = new Map(graph.edges.map((edge) => [edge.key, edge]));
    for (const [key, vertices] of storedRoutes(graph)) {
        const edge = ends.get(key);
        const source = edge && shifts.get(edge.sourceId);
        const target = edge && shifts.get(edge.targetId);
        if (!source || !target) continue;
        if (source.x !== target.x || source.y !== target.y) continue;
        before[key] = { vertices };
        after[key] = {
            vertices: vertices.map((v) => ({
                x: v.x + source.x,
                y: v.y + source.y,
            })),
        };
    }
    if (Object.keys(after).length === 0) return change;
    return {
        view,
        before: { ...change.before, relationships: before },
        after: { ...change.after, relationships: after },
    };
}
