/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createHexagon, createDiamond and the structurizr.shapes.Hexagon and
 * structurizr.shapes.Diamond markup defaults).
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
 * path data, a content area and side spans instead of JointJS cells, and
 * stretched to fill any box.
 */

/**
 * Hexagon and Diamond. Upstream gives both the whole box as their content
 * area, so a long label crosses the slanted sides; that is kept for parity.
 */

import {
    pathOf,
    point,
    polygon,
    rect,
    type ShapeBuilder,
    type ShapeDrawing,
    span,
} from "./outline";
import type { Point } from "./types";

/**
 * Both shapes come to a point in the middle of their left and right sides, so
 * edge ends keep to the middle half of every side.
 */
function pointed(
    width: number,
    height: number,
    corners: Point[],
): ShapeDrawing {
    const segments = polygon(corners);
    const across = span(width / 4, (3 * width) / 4);
    const down = span(height / 4, (3 * height) / 4);
    return {
        parts: [{ d: pathOf(segments), paint: "body" }],
        segments,
        content: rect(0, 0, width, height),
        spans: { top: across, right: down, bottom: across, left: down },
    };
}

/**
 * A flat-topped hexagon with its corners a quarter of the way in, which is
 * regular in the `w × floor(w·√3/2)` box upstream draws it in.
 */
export const hexagon: ShapeBuilder = (width, height) =>
    pointed(width, height, [
        point(width / 4, 0),
        point((3 * width) / 4, 0),
        point(width, height / 2),
        point((3 * width) / 4, height),
        point(width / 4, height),
        point(0, height / 2),
    ]);

/** A rhombus through the middle of each side. */
export const diamond: ShapeBuilder = (width, height) =>
    pointed(width, height, [
        point(width / 2, 0),
        point(width, height / 2),
        point(width / 2, height),
        point(0, height / 2),
    ]);
