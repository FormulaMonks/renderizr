/**
 * The edges a hovered element highlights, as plain functions: every edge
 * that starts or ends at it. The highlighted edges draw last, so they paint
 * over the edges they cross.
 */

/** An edge as hovering sees it: the elements at its two ends. */
export type HoverableEdge = { sourceId: string; targetId: string };

/** Whether `edge` starts or ends at element `id`. */
export const touches = (edge: HoverableEdge, id: string | undefined) =>
    id !== undefined && (edge.sourceId === id || edge.targetId === id);

/**
 * `edges` with the ones touching the hovered element `id` flagged and moved
 * to the end, each group in its own order; with nothing hovered, `edges` as
 * they are and none flagged.
 */
export function hoverEdges<T extends HoverableEdge>(
    edges: readonly T[],
    id: string | undefined,
): { edge: T; highlighted: boolean }[] {
    const rest: { edge: T; highlighted: boolean }[] = [];
    const raised: { edge: T; highlighted: boolean }[] = [];
    for (const edge of edges)
        if (touches(edge, id)) raised.push({ edge, highlighted: true });
        else rest.push({ edge, highlighted: false });
    return [...rest, ...raised];
}

/** An element as hovering sees it: its id and its box in model units. */
export type HoverableBox = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

/**
 * The element under `point`, in model units: the last of `boxes` whose box
 * holds it, since later elements draw over earlier ones; undefined over
 * none.
 */
export function elementAt(
    boxes: readonly HoverableBox[],
    point: { x: number; y: number },
): string | undefined {
    for (let i = boxes.length - 1; i >= 0; i--) {
        const box = boxes[i];
        if (
            point.x >= box.x &&
            point.x <= box.x + box.width &&
            point.y >= box.y &&
            point.y <= box.y + box.height
        )
            return box.id;
    }
    return undefined;
}
