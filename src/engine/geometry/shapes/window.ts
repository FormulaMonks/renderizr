/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createWebBrowser, createWindow, createTerminal, createShell and the
 * structurizr.shapes.WebBrowser, structurizr.shapes.Window,
 * structurizr.shapes.Terminal and structurizr.shapes.Shell markup defaults).
 *
 * Copyright Structurizr. Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Modified by Renderizr: the proportions ported to pure functions returning
 * path data, a content area and side spans instead of JointJS cells; the
 * frame is the element's height rather than overhanging it by the stroke
 * width, with the panel ending a stroke width above its bottom; the `>_`
 * prompt is a path rather than Courier New text.
 */

/**
 * WebBrowser, Window, Terminal and Shell: a frame painted in the stroke color
 * with a title bar of three buttons over a panel in the background color, and
 * a plain rounded rectangle for Shell. The label fills the panel.
 */

import {
    ellipse,
    insetSpans,
    pathOf,
    point,
    polygon,
    rect,
    roundedRect,
    type ShapeBuilder,
    type ShapeDrawing,
} from "./outline";
import type { ShapePart } from "./types";

/** The title bar's height, above the panel. */
const BAR = 40;

/** The corner radius of the frame, the panel, the URL bar and the Shell. */
const RADIUS = 10;

/** The three title bar buttons: radius 10, 30 apart, centered 20 down. */
const BUTTONS = [20, 50, 80]
    .map((x) => pathOf(ellipse(point(x, 20), 10, 10)))
    .join(" ");

/**
 * The `>_` prompt upstream writes in Courier New bold 50 centered on `x`, on
 * the baseline `baseline`: a chevron in the left character cell and a bar
 * below the baseline in the right one. A path needs no font, and a missing
 * Courier New would otherwise move it.
 */
const prompt = (x: number, baseline: number): ShapePart => ({
    d: [
        pathOf(
            polygon(
                [
                    [-27, -33],
                    [-3, -21.5],
                    [-3, -16.5],
                    [-27, -5],
                    [-27, -10.5],
                    [-10, -19],
                    [-27, -27.5],
                ].map(([dx, dy]) => point(x + dx, baseline + dy)),
            ),
        ),
        pathOf(roundedRect(x + 1, baseline + 6, 28, 5, 0)),
    ].join(" "),
    paint: "ink",
});

/** The frame and panel every windowed shape shares, plus its extras. */
function windowed(
    width: number,
    height: number,
    strokeWidth: number,
    extras: ShapePart[],
): ShapeDrawing {
    const bar = Math.min(BAR, height);
    const segments = roundedRect(0, 0, width, height, RADIUS);
    const panel = rect(
        strokeWidth,
        bar,
        width - 2 * strokeWidth,
        height - bar - strokeWidth,
    );
    return {
        parts: [
            { d: pathOf(segments), paint: "frame" },
            {
                d: pathOf(
                    roundedRect(
                        panel.x,
                        panel.y,
                        panel.width,
                        panel.height,
                        RADIUS,
                    ),
                ),
                paint: "screen",
            },
            ...extras,
        ],
        segments,
        content: panel,
        spans: insetSpans(
            width,
            height,
            Math.min(RADIUS, width / 2, height / 2),
        ),
    };
}

const buttons: ShapePart = { d: BUTTONS, paint: "screen" };

export const webBrowser: ShapeBuilder = (width, height, strokeWidth) =>
    windowed(width, height, strokeWidth, [
        buttons,
        {
            d: pathOf(roundedRect(100, 10, width - 110, 20, RADIUS)),
            paint: "screen",
        },
    ]);

export const window: ShapeBuilder = (width, height, strokeWidth) =>
    windowed(width, height, strokeWidth, [buttons]);

/** A Window with the prompt in the panel's top-left, under the buttons. */
export const terminal: ShapeBuilder = (width, height, strokeWidth) =>
    windowed(width, height, strokeWidth, [prompt(50, 90), buttons]);

/** A rounded rectangle with the prompt in its top-left; the label can overlap it. */
export const shell: ShapeBuilder = (width, height) => {
    const segments = roundedRect(0, 0, width, height, RADIUS);
    return {
        parts: [{ d: pathOf(segments), paint: "body" }, prompt(50, 50)],
        segments,
        content: rect(0, 0, width, height),
        spans: insetSpans(
            width,
            height,
            Math.min(RADIUS, width / 2, height / 2),
        ),
    };
};
