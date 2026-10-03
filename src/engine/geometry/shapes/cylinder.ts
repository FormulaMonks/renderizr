/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createCylinder, createBucket, createPipe and the
 * structurizr.shapes.Cylinder and structurizr.shapes.Pipe markup defaults).
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
 * path data, a content area and side spans instead of JointJS cells; the lid
 * and cap depth shrinks to fit a box too small for upstream's fixed 30.
 */

/**
 * Cylinder, Bucket and Pipe: the shapes with an elliptical lid. Each draws as
 * upstream's single stroked path, inner rim included, while the silhouette
 * leaves the rim out because it lies inside the fill.
 */

import {
    arc,
    ellipseSpan,
    line,
    num,
    point,
    rect,
    type ShapeBuilder,
    span,
} from "./outline";

/** Half the depth of a lid or an end cap: upstream's `ry` and `rx` are 60. */
const LID = 30;

/** Path data for an SVG arc of radii `rx`, `ry` to `(x, y)`. */
const arcTo = (rx: number, ry: number, sweep: 0 | 1, x: number, y: number) =>
    `A ${num(rx)} ${num(ry)} 0 0 ${sweep} ${num(x)} ${num(y)}`;

/** Upstream's lid: the lower half (the inner rim), then the upper half. */
const lid = (width: number, depth: number) =>
    [
        `M 0 ${num(depth)}`,
        arcTo(width / 2, depth, 0, width, depth),
        arcTo(width / 2, depth, 0, 0, depth),
    ].join(" ");

export const cylinder: ShapeBuilder = (width, height) => {
    const c = Math.min(LID, height / 2);
    const d = [
        lid(width, c),
        `L 0 ${num(height - c)}`,
        arcTo(width / 2, c, 0, width, height - c),
        `L ${num(width)} ${num(c)}`,
    ].join(" ");
    const segments = [
        arc(point(width / 2, c), width / 2, c, Math.PI, 2 * Math.PI),
        line(point(width, c), point(width, height - c)),
        arc(point(width / 2, height - c), width / 2, c, 0, Math.PI),
        line(point(0, height - c), point(0, c)),
    ];
    return {
        parts: [{ d, paint: "body" }],
        segments,
        content: rect(0, c, width, height - c),
        spans: {
            top: ellipseSpan(width / 2, width / 2),
            right: span(c, height - c),
            bottom: ellipseSpan(width / 2, width / 2),
            left: span(c, height - c),
        },
    };
};

/**
 * A Cylinder's lid on walls that slope in by a tenth of the width, closed by a
 * shallower arc twice the lid's depth. That arc's chord sits `c` above the
 * box and it bulges `0.8c` below the chord, so it stops `0.2c` (6) short of
 * the bottom of the box, as upstream's does.
 */
export const bucket: ShapeBuilder = (width, height) => {
    const c = Math.min(LID, height / 2);
    const left = width / 10;
    const right = width - left;
    const bottom = arc(
        // The chord is 0.8 of the arc's width, so it sits 0.6 of `ry` from the
        // center: the arc's center is 0.6 · 2c above the chord.
        point(width / 2, height - c - 1.2 * c),
        width / 2,
        2 * c,
        Math.atan2(0.6, 0.8),
        Math.atan2(0.6, -0.8),
    );
    const d = [
        lid(width, c),
        `L ${num(left)} ${num(height - c)}`,
        arcTo(width / 2, 2 * c, 0, right, height - c),
        `L ${num(width)} ${num(c)}`,
    ].join(" ");
    const segments = [
        arc(point(width / 2, c), width / 2, c, Math.PI, 2 * Math.PI),
        line(point(width, c), point(right, height - c)),
        bottom,
        line(point(left, height - c), point(0, c)),
    ];
    return {
        parts: [{ d, paint: "body" }],
        segments,
        content: rect(width * 0.05, c, width * 0.9, height - c),
        spans: {
            top: ellipseSpan(width / 2, width / 2),
            right: span(c, height - c),
            bottom: span(width * 0.2, width * 0.8),
            left: span(c, height - c),
        },
    };
};

/**
 * A Cylinder on its side. The label sits between the left cap's rim and the
 * right cap, centered on upstream's pipe face.
 */
export const pipe: ShapeBuilder = (width, height) => {
    const c = Math.min(LID, width / 2);
    const r = height / 2;
    const d = [
        `M ${num(c)} 0`,
        arcTo(c, r, 1, c, height),
        arcTo(c, r, 1, c, 0),
        `L ${num(width - c)} 0`,
        arcTo(c, r, 1, width - c, height),
        `L ${num(c)} ${num(height)}`,
    ].join(" ");
    const segments = [
        line(point(c, 0), point(width - c, 0)),
        arc(point(width - c, r), c, r, -Math.PI / 2, Math.PI / 2),
        line(point(width - c, height), point(c, height)),
        arc(point(c, r), c, r, Math.PI / 2, (3 * Math.PI) / 2),
    ];
    return {
        parts: [{ d, paint: "body" }],
        segments,
        content: rect(2 * c, 0, width - 3 * c, height),
        spans: {
            top: span(c, width - c),
            right: ellipseSpan(r, r),
            bottom: span(c, width - c),
            left: ellipseSpan(r, r),
        },
    };
};
