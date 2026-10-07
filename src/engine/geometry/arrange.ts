/**
 * Arranging a selection in edit mode (spec 13): align, distribute and
 * nudge, as pure geometry over the selected elements' boxes in selection
 * order, the reference element first. Each answers with the new top-left of
 * every element it moves, in whole units, and leaves the rest out.
 */

import type { Bounds } from "./bounds";
import type { Point } from "./shapes/types";

/** An element's box in model units, with its id. */
export type ArrangedBox = Bounds & { id: string };

/** Where align lines the selection up (spec 13.1). */
export type AlignEdge =
    | "left"
    | "center"
    | "right"
    | "top"
    | "middle"
    | "bottom";

/** Which way distribute spaces the selection (spec 13.2). */
export type DistributeAxis = "horizontal" | "vertical";

/** How many elements align needs (spec 13.1). */
export const ALIGN_MINIMUM = 2;

/** How many elements distribute needs (spec 13.2). */
export const DISTRIBUTE_MINIMUM = 3;

/** The new top-left of each element moved, by id. */
export type Positions = Map<string, Point>;

/** Which axis each edge aligns on, and how far along the box it measures. */
const EDGES: Record<AlignEdge, ["x" | "y", number]> = {
    left: ["x", 0],
    center: ["x", 0.5],
    right: ["x", 1],
    top: ["y", 0],
    middle: ["y", 0.5],
    bottom: ["y", 1],
};

const size = (axis: "x" | "y") => (axis === "x" ? "width" : "height");

/** `positions` with `box` moved to `at` on `axis`, when that moves it. */
function place(
    positions: Positions,
    box: ArrangedBox,
    axis: "x" | "y",
    at: number,
) {
    const to = { x: box.x, y: box.y, [axis]: Math.round(at) };
    if (to.x !== box.x || to.y !== box.y) positions.set(box.id, to);
}

/**
 * Align `boxes` on `edge` of the first, the reference element (spec 13.1):
 * left, horizontal center or right; top, vertical center or bottom. Nothing
 * moves below `ALIGN_MINIMUM`.
 */
export function align(
    boxes: readonly ArrangedBox[],
    edge: AlignEdge,
): Positions {
    const positions: Positions = new Map();
    if (boxes.length < ALIGN_MINIMUM) return positions;
    const [axis, along] = EDGES[edge];
    const [reference, ...others] = boxes;
    const line = reference[axis] + reference[size(axis)] * along;
    for (const box of others)
        place(positions, box, axis, line - box[size(axis)] * along);
    return positions;
}

/**
 * Distribute `boxes` along `axis` (spec 13.2): the outermost two by
 * position stay, and the others move so the gaps between neighbors are
 * equal, edge to edge. Neighbors go by position, a tie by selection order,
 * and the selection order itself is left alone. Nothing moves below
 * `DISTRIBUTE_MINIMUM`.
 */
export function distribute(
    boxes: readonly ArrangedBox[],
    axis: DistributeAxis,
): Positions {
    const positions: Positions = new Map();
    if (boxes.length < DISTRIBUTE_MINIMUM) return positions;
    const on = axis === "horizontal" ? "x" : "y";
    const length = size(on);
    // `sort` is stable, so a tie keeps the selection order.
    const sorted = [...boxes].sort((a, b) => a[on] - b[on]);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const taken = sorted.reduce((sum, box) => sum + box[length], 0);
    const gap =
        (last[on] + last[length] - first[on] - taken) / (sorted.length - 1);
    let at = first[on] + first[length] + gap;
    for (const box of sorted.slice(1, -1)) {
        place(positions, box, on, at);
        at += box[length] + gap;
    }
    return positions;
}

/**
 * Move every box by `step` (spec 13.3), from where it is and with no
 * snapping: 5 units for an arrow key, 50 with Shift.
 */
export function nudge(boxes: readonly ArrangedBox[], step: Point): Positions {
    return new Map(
        boxes.map((box) => [box.id, { x: box.x + step.x, y: box.y + step.y }]),
    );
}
