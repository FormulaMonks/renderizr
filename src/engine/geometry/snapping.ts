/**
 * Snapping for edit mode (spec 11): where a moving box comes to rest. Pure
 * geometry, so it runs under `node --test`.
 */

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
