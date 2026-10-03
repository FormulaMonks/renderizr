/**
 * Self-relationships (spec 10.7): an edge from an element to itself is a
 * loop out of one side and back in by the next side clockwise, around the
 * corner between them that has the fewest other edge ends. Several loops on
 * one element share that corner and nest outward. Where a loop's two edge
 * ends sit is spread with the other ends on those sides (spec 10.4), nearest
 * the corner; this module draws the loop between them.
 */

import type { Point, Rect, ShapeGeometry, Side } from "../shapes/types";
import {
    isHorizontal,
    onOutline,
    outward,
    type RoutingMode,
    sidePoint,
} from "./path";

/** A corner, as the side a loop leaves by and the next side clockwise. */
export type Corner = readonly [Side, Side];

/** The four corners, top-right first: the fallback when they tie. */
export const CORNERS: readonly Corner[] = [
    ["top", "right"],
    ["right", "bottom"],
    ["bottom", "left"],
    ["left", "top"],
];

/**
 * How far out the innermost loop reaches beyond what it needs to clear the
 * corner between its two edge ends.
 */
const LOOP_REACH = 40;

/** How much farther each nested loop reaches out. */
const LOOP_STEP = 20;

/**
 * The corner a loop goes round: the one whose two sides hold the fewest
 * edge ends, top-right first on a tie.
 */
export function loopCorner(endCounts: Record<Side, number>): Corner {
    let best = CORNERS[0];
    for (const corner of CORNERS) {
        const count = endCounts[corner[0]] + endCounts[corner[1]];
        if (count < endCounts[best[0]] + endCounts[best[1]]) best = corner;
    }
    return best;
}

/**
 * Which end of `side`'s span lies at `corner`: the clockwise end of the side
 * a loop leaves by, the other end of the side it enters by. Spans run left
 * to right and top to bottom, so clockwise is their `to` on the top and the
 * right.
 */
export function cornerEnd(side: Side, corner: Corner): "from" | "to" {
    const clockwise = side === "top" || side === "right" ? "to" : "from";
    if (side === corner[0]) return clockwise;
    return clockwise === "to" ? "from" : "to";
}

/** How far an edge end at `along` on `side` sits from `corner`. */
function fromCorner(box: Rect, side: Side, along: number, corner: Corner) {
    const length = isHorizontal(side) ? box.width : box.height;
    return cornerEnd(side, corner) === "to" ? length - along : along;
}

/**
 * The points of loop number `nest` (0 innermost) round `corner` of an
 * element at `box`, drawn as `geometry`, leaving at `leaveAlong` on the
 * corner's first side and entering at `enterAlong` on the second, in the
 * shape of `mode`: Direct cuts across outside the corner, Orthogonal goes
 * round it square, and Curved gives the end points and the two control
 * points of one cubic Bézier that reaches about as far. Both ends sit on the
 * drawn outline.
 */
export function selfLoop(
    box: Rect,
    geometry: ShapeGeometry,
    corner: Corner,
    leaveAlong: number,
    enterAlong: number,
    nest: number,
    mode: RoutingMode,
): Point[] {
    const [leave, enter] = corner;
    // A loop whose edge ends sit far from the corner has to reach farther
    // out, or Direct's cut across, and Curved's bow, would clip the corner:
    // the geometric mean of the two distances clears it.
    const clear = Math.sqrt(
        fromCorner(box, leave, leaveAlong, corner) *
            fromCorner(box, enter, enterAlong, corner),
    );
    const reach = LOOP_REACH + LOOP_STEP * nest + clear;
    // A cubic's control points sit a third farther out than the curve
    // reaches, so a Curved loop is as big as the others.
    const distance = mode === "Curved" ? (reach * 4) / 3 : reach;
    const out = (side: Side, along: number) => {
        const edgeEnd = sidePoint(box, side, along);
        const direction = outward(side);
        return {
            x: edgeEnd.x + direction.x * distance,
            y: edgeEnd.y + direction.y * distance,
        };
    };
    const start = onOutline(box, geometry, leave, leaveAlong);
    const end = onOutline(box, geometry, enter, enterAlong);
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
