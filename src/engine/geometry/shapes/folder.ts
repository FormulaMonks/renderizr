/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createFolder, createComponent and the structurizr.shapes.Folder and
 * structurizr.shapes.Component markup defaults).
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
 * path data, a content area and side spans instead of JointJS cells; corner
 * radii shrink to fit a small box; the silhouette is the union of the parts.
 */

/**
 * Folder and Component: a main rectangle with smaller ones sticking out of
 * it, a tab on top and two blocks on the left. The silhouette is the union, so
 * an edge end meets the tab or a block where they stick out.
 */

import {
    arc,
    line,
    pathOf,
    point,
    rect,
    roundedRect,
    type ShapeBuilder,
    span,
} from "./outline";
import type { Segment } from "./types";

/** A quarter turn in radians: the sweep of every rounded corner. */
const QUARTER = Math.PI / 2;

/**
 * A tab's three outer sides with rounded corners, from `(x, base)` up to
 * `top`, across `width` and back down: the part of a rounded rectangle that
 * sticks out above `base`. Rotating it a quarter turn gives the blocks.
 */
function tab(
    x: number,
    base: number,
    top: number,
    width: number,
    radius: number,
): Segment[] {
    const right = x + width;
    return [
        line(point(x, base), point(x, top + radius)),
        arc(
            point(x + radius, top + radius),
            radius,
            radius,
            Math.PI,
            3 * QUARTER,
        ),
        line(point(x + radius, top), point(right - radius, top)),
        arc(point(right - radius, top + radius), radius, radius, -QUARTER, 0),
        line(point(right, top + radius), point(right, base)),
    ];
}

/** As `tab`, sticking out to the left of `base` from `y` down `height`. */
function block(
    y: number,
    base: number,
    left: number,
    height: number,
    radius: number,
): Segment[] {
    const bottom = y + height;
    return [
        line(point(base, bottom), point(left + radius, bottom)),
        arc(
            point(left + radius, bottom - radius),
            radius,
            radius,
            QUARTER,
            Math.PI,
        ),
        line(point(left, bottom - radius), point(left, y + radius)),
        arc(
            point(left + radius, y + radius),
            radius,
            radius,
            Math.PI,
            3 * QUARTER,
        ),
        line(point(left + radius, y), point(base, y)),
    ];
}

/** Upstream's folder tab: a third of the width, 10 in, half above the body. */
export const folder: ShapeBuilder = (width, height) => {
    const tabX = Math.min(10, width / 12);
    const tabWidth = width / 3;
    const tabRadius = Math.min(10, height / 8, tabWidth / 2);
    const bodyTop = height / 8;
    const bodyRadius = Math.min(5, width / 4, (7 * height) / 32);
    const body = roundedRect(0, bodyTop, width, height - bodyTop, bodyRadius);
    const segments = [
        ...tab(tabX, bodyTop, 0, tabWidth, tabRadius),
        line(
            point(tabX + tabWidth, bodyTop),
            point(width - bodyRadius, bodyTop),
        ),
        ...body.slice(1),
        line(point(bodyRadius, bodyTop), point(tabX, bodyTop)),
    ];
    return {
        parts: [
            {
                d: pathOf(
                    roundedRect(tabX, 0, tabWidth, height / 4, tabRadius),
                ),
                paint: "body",
            },
            { d: pathOf(body), paint: "body" },
        ],
        segments,
        content: rect(0, bodyTop, width, height - bodyTop),
        spans: {
            top: span(bodyRadius, width - bodyRadius),
            right: span(bodyTop + bodyRadius, height - bodyRadius),
            bottom: span(bodyRadius, width - bodyRadius),
            left: span(bodyTop + bodyRadius, height - bodyRadius),
        },
    };
};

/**
 * Upstream's component: a main rectangle from `w/12`, and two blocks `w/6`
 * wide and `h/8` tall straddling its left side, at `0.075h` and `h/4`. The
 * label is centered on the main rectangle and kept clear of the blocks.
 */
export const component: ShapeBuilder = (width, height) => {
    const mainX = width / 12;
    const mainRadius = Math.min(10, 0.075 * height, (width - mainX) / 2);
    const blockWidth = width / 6;
    const blockHeight = height / 8;
    const blockRadius = Math.min(5, width / 24, height / 16);
    const blocks = [0.075 * height, height / 4];
    const main = roundedRect(mainX, 0, width - mainX, height, mainRadius);
    // `roundedRect` ends with the left side and the top-left corner; the
    // blocks interrupt that side, from the bottom up.
    const segments = [
        ...main.slice(0, -2),
        line(
            point(mainX, height - mainRadius),
            point(mainX, blocks[1] + blockHeight),
        ),
        ...block(blocks[1], mainX, 0, blockHeight, blockRadius),
        line(point(mainX, blocks[1]), point(mainX, blocks[0] + blockHeight)),
        ...block(blocks[0], mainX, 0, blockHeight, blockRadius),
        line(point(mainX, blocks[0]), point(mainX, mainRadius)),
        ...main.slice(-1),
    ];
    return {
        parts: [
            { d: pathOf(main), paint: "body" },
            ...blocks.map((y) => ({
                d: pathOf(
                    roundedRect(0, y, blockWidth, blockHeight, blockRadius),
                ),
                paint: "body" as const,
            })),
        ],
        segments,
        content: rect(width / 8 + 10, 0, width - 20 - blockWidth, height),
        spans: {
            top: span(mainX + mainRadius, width - mainRadius),
            right: span(mainRadius, height - mainRadius),
            bottom: span(mainX + mainRadius, width - mainRadius),
            left: span(mainRadius, height - mainRadius),
        },
    };
};
