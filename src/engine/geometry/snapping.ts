/**
 * Snapping for edit mode (spec 11): where a moving box comes to rest and the
 * alignment guides it draws. Pure geometry, so it runs under `node --test`.
 */

import { type Bounds, boundsOf } from "./bounds";
import type { Point } from "./shapes/types";

/** The grid a moving box snaps to when nothing else is in reach, in model units. */
export const GRID = 5;

const toGrid = (value: number) => Math.round(value / GRID) * GRID || 0;

/** `point` on the nearest grid point. */
export const snapToGrid = ({ x, y }: Point): Point => ({
    x: toGrid(x),
    y: toGrid(y),
});

/**
 * `point`, unless it is exactly (0,0): ADR 10 reads an element there as
 * unplaced, so an edit that lands one on it puts it at (5,0) (spec 7.3).
 */
export const offOrigin = (point: Point): Point =>
    point.x === 0 && point.y === 0 ? { x: GRID, y: 0 } : point;

/** How close, in screen pixels, a moving box comes before it snaps to a guide. */
export const GUIDE_REACH = 8;

/** `GUIDE_REACH` in model units at `zoom`, so it stays 8 pixels on screen. */
export const guideReach = (zoom: number) => GUIDE_REACH / zoom;

/** An alignment guide: a straight line in model units, drawn dashed. */
export type Guide = { from: Point; to: Point };

/** How far a moving box shifts to come to rest, and the guides it draws. */
export type Snap = { offset: Point; guides: Guide[] };

/** A box's start, middle and end on one axis. */
type Lines = [number, number, number];

const linesX = (b: Bounds): Lines => [b.x, b.x + b.width / 2, b.x + b.width];
const linesY = (b: Bounds): Lines => [b.y, b.y + b.height / 2, b.y + b.height];

/**
 * The shift on one axis that puts one of `moving`'s lines on the nearest
 * line of a target within `reach`, and that line; ties go to the first found.
 */
function nearestLine(
    moving: Lines,
    targets: readonly Lines[],
    reach: number,
): { shift: number; at: number } | undefined {
    let best: { shift: number; at: number } | undefined;
    for (const theirs of targets)
        for (const mine of moving)
            for (const at of theirs) {
                const shift = at - mine;
                if (Math.abs(shift) > reach) continue;
                if (best && Math.abs(best.shift) <= Math.abs(shift)) continue;
                best = { shift, at };
            }
    return best;
}

/** Whether a line of `lines` sits on `at`. */
const onLine = (lines: Lines, at: number) =>
    lines.some((line) => Math.abs(line - at) < 1e-6);

/**
 * Where a moving box comes to rest (spec 11): on each axis, the nearest
 * left, center or right (top, middle or bottom) of a target within `reach`
 * model units, with a guide across the box and every target on that line;
 * otherwise the box's corner on the 5-unit grid. A selection snaps by the
 * box around it.
 */
export function snapBox(
    box: Bounds,
    targets: readonly Bounds[],
    reach: number,
): Snap {
    const vertical = nearestLine(linesX(box), targets.map(linesX), reach);
    const horizontal = nearestLine(linesY(box), targets.map(linesY), reach);
    const offset = {
        x: vertical ? vertical.shift : toGrid(box.x) - box.x,
        y: horizontal ? horizontal.shift : toGrid(box.y) - box.y,
    };
    const moved = { ...box, x: box.x + offset.x, y: box.y + offset.y };
    const guides: Guide[] = [];
    if (vertical) {
        const along = boundsOf([
            moved,
            ...targets.filter((t) => onLine(linesX(t), vertical.at)),
        ]) as Bounds;
        guides.push({
            from: { x: vertical.at, y: along.y },
            to: { x: vertical.at, y: along.y + along.height },
        });
    }
    if (horizontal) {
        const along = boundsOf([
            moved,
            ...targets.filter((t) => onLine(linesY(t), horizontal.at)),
        ]) as Bounds;
        guides.push({
            from: { x: along.x, y: horizontal.at },
            to: { x: along.x + along.width, y: horizontal.at },
        });
    }
    return { offset, guides };
}
