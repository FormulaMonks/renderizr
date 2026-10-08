/**
 * Canvas geometry for edit mode (spec 14, 15): the three canvas commands
 * with Structurizr Local's numbers, re-centering, and the clamp behind
 * "Bring elements back onto the diagram". Pure, so it runs under
 * `node --test`.
 */

import { MIN_CANVAS_SIDE } from "../../model/canvas";
import type { CanvasCommand } from "../contract";
import type { Bounds, Size } from "./bounds";
import type { Point } from "./shapes/types";

export type { CanvasCommand };

/** How far Decrease and Increase move each side. */
export const CANVAS_STEP = 100;

/** What Auto adds to the content's size, half of it on each side. */
export const AUTO_MARGIN = 400;

/**
 * The canvas `command` makes of `canvas` around `content`, the box of
 * everything drawn: 100 smaller or larger each way, or the content plus 400.
 * Decrease stops at 500, below which the canvas would show as 2000 again.
 */
export function resizedCanvas(
    command: CanvasCommand,
    canvas: Size,
    content: Bounds,
): Size {
    switch (command) {
        case "decrease":
            return {
                width: Math.max(MIN_CANVAS_SIDE, canvas.width - CANVAS_STEP),
                height: Math.max(MIN_CANVAS_SIDE, canvas.height - CANVAS_STEP),
            };
        case "increase":
            return {
                width: canvas.width + CANVAS_STEP,
                height: canvas.height + CANVAS_STEP,
            };
        case "auto":
            return {
                width: Math.ceil(content.width) + AUTO_MARGIN,
                height: Math.ceil(content.height) + AUTO_MARGIN,
            };
    }
}

/** The whole-unit shift that puts the middle of `content` in the middle of `canvas`. */
export const centeringShift = (canvas: Size, content: Bounds): Point => ({
    x: Math.round((canvas.width - content.width) / 2 - content.x) || 0,
    y: Math.round((canvas.height - content.height) / 2 - content.y) || 0,
});

const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), Math.max(low, high));

/**
 * The top-left that keeps a box of `size` at `point` inside `canvas`, or
 * at its top-left corner when the box is larger than the canvas.
 */
export const clampBox = (point: Point, size: Size, canvas: Size): Point => ({
    x: clamp(point.x, 0, canvas.width - size.width),
    y: clamp(point.y, 0, canvas.height - size.height),
});

/** `point` moved onto `canvas`. */
export const clampPoint = (point: Point, canvas: Size): Point => ({
    x: clamp(point.x, 0, canvas.width),
    y: clamp(point.y, 0, canvas.height),
});
