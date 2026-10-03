/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createBox and the structurizr.shapes.Box markup defaults).
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
 * path data, a content area and side spans instead of JointJS cells.
 */

/**
 * Box and RoundedBox: a rectangle with corners of radius 1 and 20. Upstream
 * draws an unknown shape as a Box too.
 */

import {
    insetSpans,
    pathOf,
    rect,
    roundedRect,
    type ShapeBuilder,
} from "./outline";

/** Upstream's Box is not square-cornered: `createBox` is called with 1. */
const BOX_RADIUS = 1;

/** The RoundedBox corner radius. */
const ROUNDED_BOX_RADIUS = 20;

const rounded =
    (radius: number): ShapeBuilder =>
    (width, height) => {
        const r = Math.min(radius, width / 2, height / 2);
        const segments = roundedRect(0, 0, width, height, r);
        return {
            parts: [{ d: pathOf(segments), paint: "body" }],
            segments,
            content: rect(0, 0, width, height),
            spans: insetSpans(width, height, r),
        };
    };

export const box: ShapeBuilder = rounded(BOX_RADIUS);

export const roundedBox: ShapeBuilder = rounded(ROUNDED_BOX_RADIUS);
