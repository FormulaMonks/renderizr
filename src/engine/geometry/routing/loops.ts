/**
 * Self-relationships (spec 10.7): an edge from an element to itself is a
 * loop out of one side and back in by the next side clockwise, around the
 * corner between them that has the fewest other edge ends. Several loops on
 * one element share that corner and nest outward.
 */

import { touch } from "../shapes/outline";
import type { Point, Rect, ShapeGeometry, Side, Span } from "../shapes/types";
import { outward, type RoutingMode, sidePoint } from "./path";

/** A corner, as the side a loop leaves by and the next side clockwise. */
export type Corner = readonly [Side, Side];

/** The four corners, top-right first: the fallback when they tie. */
export const CORNERS: readonly Corner[] = [
    ["top", "right"],
    ["right", "bottom"],
    ["bottom", "left"],
    ["left", "top"],
];

/** How far from the corner the innermost loop leaves and enters. */
const LOOP_ANCHOR = 20;

/** How far out from the element the innermost loop reaches. */
const LOOP_REACH = 40;

/** How much farther each nested loop sits from the corner and reaches out. */
const LOOP_STEP = 20;

/**
 * The corner a loop goes round: the one whose two sides hold the fewest
 * edge ends, top-right first on a tie.
 */
export function loopCorner(ends: Record<Side, number>): Corner {
    let best = CORNERS[0];
    for (const corner of CORNERS) {
        const count = ends[corner[0]] + ends[corner[1]];
        if (count < ends[best[0]] + ends[best[1]]) best = corner;
    }
    return best;
}

/** Whether the corner-ward end of a side's span is its `to`, walking clockwise. */
const clockwiseIsTo = (side: Side) => side === "top" || side === "right";

/**
 * A point on `span` `by` in from one of its ends, never past its middle, so
 * a large nest still leaves and enters on the side it belongs to.
 */
const inFrom = (span: Span, fromTo: boolean, by: number) => {
    const middle = (span.from + span.to) / 2;
    return fromTo
        ? Math.max(middle, span.to - by)
        : Math.min(middle, span.from + by);
};

/**
 * The points of loop number `nest` (0 innermost) round `corner` of an
 * element at `box`, drawn as `geometry`, in the shape of `mode`: Direct cuts
 * across outside the corner, Orthogonal goes round it square, and Curved
 * gives the end points and the two control points of one cubic Bézier that
 * reaches about as far. Both ends sit on the drawn outline.
 */
export function selfLoop(
    box: Rect,
    geometry: ShapeGeometry,
    corner: Corner,
    nest: number,
    mode: RoutingMode,
): Point[] {
    const [leave, enter] = corner;
    const anchor = LOOP_ANCHOR + LOOP_STEP * nest;
    const reach = LOOP_REACH + LOOP_STEP * nest;
    const leaveAlong = inFrom(
        geometry.spans[leave],
        clockwiseIsTo(leave),
        anchor,
    );
    const enterAlong = inFrom(
        geometry.spans[enter],
        !clockwiseIsTo(enter),
        anchor,
    );
    const onOutline = (side: Side, along: number) => {
        const local = touch(geometry, side, along);
        return { x: box.x + local.x, y: box.y + local.y };
    };
    // A cubic's control points sit a third farther out than the curve
    // reaches, so a Curved loop is as big as the others.
    const distance = mode === "Curved" ? (reach * 4) / 3 : reach;
    const out = (side: Side, along: number) => {
        const port = sidePoint(box, side, along);
        const direction = outward(side);
        return {
            x: port.x + direction.x * distance,
            y: port.y + direction.y * distance,
        };
    };
    const start = onOutline(leave, leaveAlong);
    const end = onOutline(enter, enterAlong);
    const first = out(leave, leaveAlong);
    const last = out(enter, enterAlong);
    if (mode !== "Orthogonal") return [start, first, last, end];
    const across = outward(enter);
    const turn = {
        x: across.x !== 0 ? last.x : first.x,
        y: across.y !== 0 ? last.y : first.y,
    };
    return [start, first, turn, last, end];
}
