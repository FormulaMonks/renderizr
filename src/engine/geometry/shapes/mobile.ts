/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createMobileDevicePortrait, createMobileDeviceLandscape and the
 * structurizr.shapes.MobileDevicePortrait and
 * structurizr.shapes.MobileDeviceLandscape markup defaults).
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
 * landscape frame is the element's height rather than overhanging it by the
 * stroke width; the label fills the display instead of the whole frame.
 */

/**
 * MobileDevicePortrait and MobileDeviceLandscape: a frame painted in the
 * stroke color around a display, with a round button and a speaker grille on
 * either end. Upstream centers the label on the whole frame; here it fills
 * the display, which the 30 label padding already kept it inside.
 */

import {
    ellipse,
    insetSpans,
    num,
    pathOf,
    point,
    rect,
    roundedRect,
    type ShapeBuilder,
} from "./outline";
import type { Point, Rect } from "./types";

/** The frame's corner radius. */
const FRAME_RADIUS = 20;

/** The display's corner radius. */
const DISPLAY_RADIUS = 5;

/** The speaker grille's length. */
const SPEAKER = 50;

const device = (
    width: number,
    height: number,
    display: Rect,
    button: Point,
    speaker: [Point, Point],
) => {
    const segments = roundedRect(0, 0, width, height, FRAME_RADIUS);
    const [from, to] = speaker;
    return {
        parts: [
            { d: pathOf(segments), paint: "frame" as const },
            {
                d: pathOf(
                    roundedRect(
                        display.x,
                        display.y,
                        display.width,
                        display.height,
                        DISPLAY_RADIUS,
                    ),
                ),
                paint: "screen" as const,
            },
            { d: pathOf(ellipse(button, 10, 10)), paint: "screen" as const },
            {
                d: `M ${num(from.x)} ${num(from.y)} L ${num(to.x)} ${num(to.y)}`,
                paint: "grille" as const,
            },
        ],
        segments,
        content: display,
        spans: insetSpans(
            width,
            height,
            Math.min(FRAME_RADIUS, width / 2, height / 2),
        ),
    };
};

/** The display 10 in from the sides and 40 from the ends. */
export const mobileDevicePortrait: ShapeBuilder = (width, height) =>
    device(
        width,
        height,
        rect(10, 40, width - 20, height - 80),
        point(width / 2, height - 20),
        [point((width - SPEAKER) / 2, 20), point((width + SPEAKER) / 2, 20)],
    );

/** The portrait device turned a quarter: button on the left, speaker right. */
export const mobileDeviceLandscape: ShapeBuilder = (width, height) =>
    device(
        width,
        height,
        rect(40, 10, width - 80, height - 20),
        point(20, height / 2),
        [
            point(width - 20, (height - SPEAKER) / 2),
            point(width - 20, (height + SPEAKER) / 2),
        ],
    );
