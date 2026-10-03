/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createEllipse and the structurizr.shapes.Ellipse markup defaults).
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
 * path data, a content area and side spans instead of JointJS cells; a Circle
 * in a box that is not square is inscribed in it.
 */

/**
 * Ellipse and Circle. Upstream wraps the label to 90% of the width and does
 * not inset it vertically, so the corners of a long label can poke out.
 */

import {
    ellipseSpan,
    ellipse as ellipseSegments,
    pathOf,
    point,
    rect,
    type ShapeBuilder,
    type ShapeDrawing,
} from "./outline";

/** The share of the width the label may use (`createEllipse`). */
const LABEL_WIDTH = 0.9;

/** An ellipse of radii `rx`, `ry` centered in a `width` × `height` box. */
function centered(
    width: number,
    height: number,
    rx: number,
    ry: number,
): ShapeDrawing {
    const center = point(width / 2, height / 2);
    const segments = ellipseSegments(center, rx, ry);
    return {
        parts: [{ d: pathOf(segments), paint: "body" }],
        segments,
        content: rect(
            center.x - rx * LABEL_WIDTH,
            center.y - ry,
            2 * rx * LABEL_WIDTH,
            2 * ry,
        ),
        spans: {
            top: ellipseSpan(center.x, rx),
            right: ellipseSpan(center.y, ry),
            bottom: ellipseSpan(center.x, rx),
            left: ellipseSpan(center.y, ry),
        },
    };
}

export const ellipse: ShapeBuilder = (width, height) =>
    centered(width, height, width / 2, height / 2);

/**
 * Upstream forces a Circle's height to its width, so it never meets a box
 * that is not square (`shapeSize` keeps that rule). Given one anyway, the
 * circle is inscribed in it.
 */
export const circle: ShapeBuilder = (width, height) => {
    const radius = Math.min(width, height) / 2;
    return centered(width, height, radius, radius);
};
