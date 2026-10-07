/**
 * The selection in edit mode (spec 10.2, ADR 18), as plain functions: the
 * order a click, a modifier-click or a marquee leaves it in. The selection
 * lists element ids in selection order, the reference element first; it
 * lives in the engine and is never saved or undone.
 */

import type { Bounds } from "../geometry/bounds";
import type { Point } from "../geometry/shapes/types";

/** Element ids in selection order, the reference element first. */
export type SelectionOrder = readonly string[];

/** An element as a marquee sees it: its id and its box in model units. */
export type SelectableBox = Bounds & { id: string };

/**
 * The selection after a click on element `id`: that element alone; the same
 * selection when it is already in it, so a drag moves all of it; with
 * Shift, Cmd or Ctrl (`modifier`), the element added at the end or taken out.
 */
export function clickSelection(
    selection: SelectionOrder,
    id: string,
    modifier: boolean,
): SelectionOrder {
    const selected = selection.includes(id);
    if (modifier)
        return selected
            ? selection.filter((other) => other !== id)
            : [...selection, id];
    return selected ? selection : [id];
}

/** The elements of `boxes` wholly inside `rect`. */
export const insideMarquee = <Box extends Bounds>(
    boxes: readonly Box[],
    rect: Bounds,
): Box[] =>
    boxes.filter(
        (box) =>
            box.x >= rect.x &&
            box.y >= rect.y &&
            box.x + box.width <= rect.x + rect.width &&
            box.y + box.height <= rect.y + rect.height,
    );

/** How far `point` is from the nearest point of `box`. */
const distanceTo = (box: Bounds, point: Point) =>
    Math.hypot(
        Math.max(box.x - point.x, 0, point.x - (box.x + box.width)),
        Math.max(box.y - point.y, 0, point.y - (box.y + box.height)),
    );

/**
 * The selection a marquee `rect`, drawn from `corner`, leaves: `kept` (the
 * selection when Shift, Cmd or Ctrl was held, else empty) followed by the
 * elements wholly inside it, nearest the starting corner first. With nothing
 * kept, that nearest element becomes the reference element.
 */
export function marqueeSelection(
    kept: SelectionOrder,
    boxes: readonly SelectableBox[],
    rect: Bounds,
    corner: Point,
): SelectionOrder {
    const added = insideMarquee(boxes, rect)
        .filter((box) => !kept.includes(box.id))
        .map((box) => ({ id: box.id, distance: distanceTo(box, corner) }))
        .sort((a, b) => a.distance - b.distance)
        .map((box) => box.id);
    return [...kept, ...added];
}
