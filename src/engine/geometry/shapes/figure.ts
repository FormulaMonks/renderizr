/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (createPerson, createRobot and the structurizr.shapes.Person and
 * structurizr.shapes.Robot markup defaults).
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
 * path data, a content area and side spans instead of JointJS cells; in a box
 * that is not square the body keeps the lower 60% of the height and the head
 * is sized from the shorter side and sits on the body as it does upstream;
 * corner radii shrink to fit a small box; the silhouette is the union of the
 * parts.
 */

/**
 * Person and Robot: a head on a body, with two arm lines. Upstream draws both
 * in a `w × w` box (`shapeSize` keeps that rule), the body the lower 60% of it
 * and the label in the body. The silhouette is the union of head and body, so
 * an edge end meets the head when it comes from above.
 */

import {
    arc,
    ellipseSpan,
    ellipse,
    line,
    num,
    pathOf,
    point,
    rect,
    roundedRect,
    type ShapeBuilder,
    span,
} from "./outline";
import type { Segment } from "./types";

/** Where the body starts, as a share of the height. */
const BODY_TOP = 0.4;

/** The Person's body corner radius (markup default, never overridden). */
const PERSON_BODY_RADIUS = 70;

/** The Robot's body and head corner radius (markup defaults). */
const ROBOT_RADIUS = 30;

/** The Robot's ear corner radius (markup default). */
const EAR_RADIUS = 10;

/** Both arms, at a fifth of the way in, from two thirds of the way down. */
const arms = (width: number, height: number) =>
    [width / 5, (4 * width) / 5]
        .map(
            (x) =>
                `M ${num(x)} ${num(height / 1.5)} L ${num(x)} ${num(height)}`,
        )
        .join(" ");

/**
 * The body's rounded rectangle with its top side cut where the head covers
 * it, between `left` and `right`. `roundedRect` starts with the top side, so
 * that side is split in two around the head.
 */
function bodyAround(
    width: number,
    height: number,
    radius: number,
    left: number,
    right: number,
    head: Segment[],
): Segment[] {
    const top = BODY_TOP * height;
    const body = roundedRect(0, top, width, height - top, radius);
    return [
        line(point(right, top), point(width - radius, top)),
        ...body.slice(1),
        line(point(radius, top), point(left, top)),
        ...head,
    ];
}

/**
 * Upstream's head is a circle of radius `w/4.5` centered `w/4.5` down: its
 * bottom overlaps the body by a fifth of its radius, and it meets the body's
 * top 0.6 of its radius either side of center.
 */
export const person: ShapeBuilder = (width, height) => {
    const top = BODY_TOP * height;
    const r = Math.min(width, height) / 4.5;
    const center = point(width / 2, top - 0.8 * r);
    const radius = Math.min(
        PERSON_BODY_RADIUS,
        width / 2 - 0.6 * r,
        0.3 * height,
    );
    const head = arc(
        center,
        r,
        r,
        Math.atan2(0.8, -0.6),
        Math.atan2(0.8, 0.6) + 2 * Math.PI,
    );
    const segments = bodyAround(
        width,
        height,
        radius,
        center.x - 0.6 * r,
        center.x + 0.6 * r,
        [head],
    );
    return {
        parts: [
            {
                d: pathOf(roundedRect(0, top, width, height - top, radius)),
                paint: "body",
            },
            { d: pathOf(ellipse(center, r, r)), paint: "body" },
            { d: arms(width, height), paint: "rule" },
        ],
        segments,
        content: rect(0, top, width, height - top),
        spans: {
            top: ellipseSpan(center.x, r),
            right: span(top + radius, height - radius),
            bottom: span(radius, width - radius),
            left: span(top + radius, height - radius),
        },
    };
};

/**
 * Upstream's head is a square of side `w/2.25` at the top, overlapping the
 * body by a tenth of its side; the ears are a bar 1.25 heads wide and 0.225
 * heads tall across its middle, drawn behind it.
 */
export const robot: ShapeBuilder = (width, height) => {
    const top = BODY_TOP * height;
    const side = Math.min(width, height) / 2.25;
    const headX = (width - side) / 2;
    const headY = top - 0.9 * side;
    const headRadius = Math.min(ROBOT_RADIUS, 0.3875 * side);
    const bodyRadius = Math.min(ROBOT_RADIUS, 0.3 * height, headX);
    const earWidth = 1.25 * side;
    const earHeight = 0.225 * side;
    const earX = (width - earWidth) / 2;
    const earY = headY + (side - earHeight) / 2;
    const earRadius = Math.min(EAR_RADIUS, earHeight / 2);
    const headRight = headX + side;
    const earRight = earX + earWidth;
    const earBottom = earY + earHeight;
    const corner = headY + side - headRadius;

    // How far below the centers of the head's bottom corners the body's top
    // is. Past zero, the body's top crosses those corners' arcs.
    const below = top - corner;
    const sweep = below > 0 ? Math.asin(below / headRadius) : 0;
    const inset = below > 0 ? headRadius - headRadius * Math.cos(sweep) : 0;
    const quarter = Math.PI / 2;

    const rightSide: Segment[] =
        below > 0
            ? [
                  line(point(headRight, earBottom), point(headRight, corner)),
                  arc(
                      point(headRight - headRadius, corner),
                      headRadius,
                      headRadius,
                      0,
                      sweep,
                  ),
              ]
            : [line(point(headRight, earBottom), point(headRight, top))];
    const leftSide: Segment[] =
        below > 0
            ? [
                  arc(
                      point(headX + headRadius, corner),
                      headRadius,
                      headRadius,
                      Math.PI - sweep,
                      Math.PI,
                  ),
                  line(point(headX, corner), point(headX, earBottom)),
              ]
            : [line(point(headX, top), point(headX, earBottom))];

    const headAndEars: Segment[] = [
        // The left ear, from the head's left side round to it again.
        line(point(headX, earBottom), point(earX + earRadius, earBottom)),
        arc(
            point(earX + earRadius, earBottom - earRadius),
            earRadius,
            earRadius,
            quarter,
            Math.PI,
        ),
        line(point(earX, earBottom - earRadius), point(earX, earY + earRadius)),
        arc(
            point(earX + earRadius, earY + earRadius),
            earRadius,
            earRadius,
            Math.PI,
            3 * quarter,
        ),
        line(point(earX + earRadius, earY), point(headX, earY)),
        // The head's top.
        line(point(headX, earY), point(headX, headY + headRadius)),
        arc(
            point(headX + headRadius, headY + headRadius),
            headRadius,
            headRadius,
            Math.PI,
            3 * quarter,
        ),
        line(
            point(headX + headRadius, headY),
            point(headRight - headRadius, headY),
        ),
        arc(
            point(headRight - headRadius, headY + headRadius),
            headRadius,
            headRadius,
            -quarter,
            0,
        ),
        line(point(headRight, headY + headRadius), point(headRight, earY)),
        // The right ear.
        line(point(headRight, earY), point(earRight - earRadius, earY)),
        arc(
            point(earRight - earRadius, earY + earRadius),
            earRadius,
            earRadius,
            -quarter,
            0,
        ),
        line(
            point(earRight, earY + earRadius),
            point(earRight, earBottom - earRadius),
        ),
        arc(
            point(earRight - earRadius, earBottom - earRadius),
            earRadius,
            earRadius,
            0,
            quarter,
        ),
        line(
            point(earRight - earRadius, earBottom),
            point(headRight, earBottom),
        ),
        ...rightSide,
    ];

    const segments = bodyAround(
        width,
        height,
        bodyRadius,
        headX + inset,
        headRight - inset,
        [...leftSide, ...headAndEars],
    );
    return {
        parts: [
            {
                d: pathOf(roundedRect(0, top, width, height - top, bodyRadius)),
                paint: "body",
            },
            {
                d: pathOf(
                    roundedRect(earX, earY, earWidth, earHeight, earRadius),
                ),
                paint: "body",
            },
            {
                d: pathOf(roundedRect(headX, headY, side, side, headRadius)),
                paint: "body",
            },
            { d: arms(width, height), paint: "rule" },
        ],
        segments,
        content: rect(0, top, width, height - top),
        spans: {
            top: span(headX + headRadius, headRight - headRadius),
            right: span(top + bodyRadius, height - bodyRadius),
            bottom: span(bodyRadius, width - bodyRadius),
            left: span(top + bodyRadius, height - bodyRadius),
        },
    };
};
