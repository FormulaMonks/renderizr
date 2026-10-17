/**
 * End markers (spec: End markers): what a Mermaid edge draws at either
 * end, from a flowchart's arrows, circles and crosses to an ERD's
 * cardinalities and a sequence message's open arrow. Each marker is
 * Mermaid's own geometry (`rendering-elements/markers.js` and the sequence
 * diagram's `svgDraw.js`, Mermaid 12.2.0) scaled so that its arrow matches
 * the C4 arrowhead, `arrowheadSize(t)`, which is the arrow itself.
 *
 * A marker is plain SVG path data, which the canvas and export both draw as
 * they get it, in the edge's color and opacity: `fill` filled, `stroke`
 * stroked at the line's thickness with no dashes, so a marker stays solid on
 * a dashed or dotted line. It also has a `length` back from its tip, an
 * `inset`, how far short of the tip the line stops, and a `width` across the
 * line, which the router fits it with (`endFit`). A hollow circle breaks the
 * line: the line stops at the circle's far edge and the marker strokes the
 * piece of line between the circle and the tip itself.
 *
 * C4 edges never come here: they keep their one arrowhead (`line.ts`).
 */

import type { EndFit } from "./routing/route-view";
import { endHeading } from "./routing/path";
import { arrowheadPath, arrowheadSize } from "./line";
import { num } from "./shapes/outline";
import type { Point } from "./shapes/types";

/** Every End marker, `none` first. */
export const END_MARKERS = [
    "none",
    "arrow",
    "openArrow",
    "circle",
    "cross",
    "zeroOrOne",
    "one",
    "zeroOrMore",
    "oneOrMore",
] as const;

export type EndMarker = (typeof END_MARKERS)[number];

/** Whether `name` names an End marker. */
export const isEndMarker = (name: string): name is EndMarker =>
    (END_MARKERS as readonly string[]).includes(name);

/** A marker's SVG path data: what fills, and what strokes. */
export type MarkerPaths = { fill: string; stroke: string };

/** The length of Mermaid's flowchart arrow, in its own pixels. */
const MERMAID_ARROW = 8;

/** How many units one of Mermaid's marker pixels is at thickness `t`. */
const scale = (t: number) => arrowheadSize(t) / MERMAID_ARROW;

/**
 * One marker in Mermaid's pixels, in a frame at its tip: `b` back from the
 * tip along the line, `a` across it. `fill` and `stroke` write its path data
 * through `at`, which places a point of that frame.
 */
type Shape = {
    length: number;
    width: number;
    /** In Mermaid's pixels. */
    inset: number;
    fill?: (at: At, t: number) => string;
    stroke?: (at: At, t: number) => string;
};

/** Writes the point `b` back and `a` across for path data. */
type At = (b: number, a: number) => string;

/** A full circle, centered `center` back on the line, as two arcs. */
const circle = (at: At, center: number, r: number, k: number) => {
    const radius = num(r * k);
    const arc = `A ${radius} ${radius} 0 1 0`;
    return `M ${at(center - r, 0)} ${arc} ${at(center + r, 0)} ${arc} ${at(center - r, 0)} Z`;
};

/** A bar across the line, `b` back, as tall as an ERD marker. */
const bar = (at: At, b: number) => `M ${at(b, -9)} L ${at(b, 9)}`;

/**
 * A crow's foot: Mermaid's two quadratic toes from 18 back on the line out
 * to 9 either side of the tip, cut where the line meets the entity.
 */
const crowsFoot = (at: At) =>
    `M ${at(0, -9)} Q ${at(9, -9)} ${at(18, 0)} Q ${at(9, 9)} ${at(0, 9)}`;

/** The line from `b` back up to the tip, inside a hollow marker. */
const lineIn = (at: At, b: number) => `M ${at(b, 0)} L ${at(0, 0)}`;

const SHAPES: Record<Exclude<EndMarker, "none" | "arrow">, Shape> = {
    // The sequence diagram's open arrow, `-)`, as a chevron the size of the
    // arrow, stroked, its point on the tip.
    openArrow: {
        length: MERMAID_ARROW,
        width: MERMAID_ARROW,
        inset: 0,
        stroke: (at) =>
            `M ${at(MERMAID_ARROW, -MERMAID_ARROW / 2)} L ${at(0, 0)} L ${at(MERMAID_ARROW, MERMAID_ARROW / 2)}`,
    },
    // `circleEnd`: radius 5.5, its center 6.6 back. Filled, as Mermaid's
    // flowchart draws it, so the line ends under it at its center.
    circle: {
        length: 12.1,
        width: 11,
        inset: 6.6,
        fill: (at, t) => circle(at, 6.6, 5.5, scale(t)),
    },
    // `crossEnd`: two strokes 9 square, centered 6.5 back.
    cross: {
        length: 11,
        width: 9,
        inset: 0,
        stroke: (at) =>
            `M ${at(11, -4.5)} L ${at(2, 4.5)} M ${at(11, 4.5)} L ${at(2, -4.5)}`,
    },
    // `onlyOneEnd`: bars 9 and 15 back.
    one: {
        length: 15,
        width: 18,
        inset: 0,
        stroke: (at) => `${bar(at, 9)} ${bar(at, 15)}`,
    },
    // `zeroOrOneEnd`: a bar 9 back, a hollow circle of radius 6 at 21.
    zeroOrOne: {
        length: 27,
        width: 18,
        inset: 27,
        stroke: (at, t) =>
            `${lineIn(at, 15)} ${bar(at, 9)} ${circle(at, 21, 6, scale(t))}`,
    },
    // `oneOrMoreEnd`: a crow's foot, a bar 24 back.
    oneOrMore: {
        length: 24,
        width: 18,
        inset: 0,
        stroke: (at) => `${crowsFoot(at)} ${bar(at, 24)}`,
    },
    // `zeroOrMoreEnd`: a crow's foot, a hollow circle of radius 6 at 30.
    zeroOrMore: {
        length: 36,
        width: 18,
        inset: 36,
        stroke: (at, t) =>
            `${lineIn(at, 24)} ${crowsFoot(at)} ${circle(at, 30, 6, scale(t))}`,
    },
};

/** How far back from its tip `marker` reaches at thickness `t`. */
export function markerLength(marker: EndMarker, t: number): number {
    if (marker === "none") return 0;
    if (marker === "arrow") return arrowheadSize(t);
    return SHAPES[marker].length * scale(t);
}

/** How wide across the line `marker` is at thickness `t`. */
export function markerWidth(marker: EndMarker, t: number): number {
    if (marker === "none") return 0;
    if (marker === "arrow") return arrowheadSize(t);
    return SHAPES[marker].width * scale(t);
}

/**
 * How far short of its tip the line stops under `marker`: the arrow one
 * thickness, where it is as wide as the line; a filled circle at its
 * center; a hollow one at its far edge; an open arrow, a cross, bars and a
 * crow's foot not at all.
 */
export function markerInset(marker: EndMarker, t: number): number {
    if (marker === "none") return 0;
    if (marker === "arrow") return t;
    return SHAPES[marker].inset * scale(t);
}

/**
 * How far an end with `marker` runs straight out of its side before its
 * route may bend: the marker's length and a little more, so the marker
 * never sits on a bend. Nothing for an end without one.
 */
export function straightEnd(marker: EndMarker, t: number): number {
    if (marker === "none") return 0;
    return markerLength(marker, t) + 2 * t + 4;
}

/**
 * How the router fits an edge with `start` and `end` markers: each end with
 * a marker runs straight for the longer marker's straight end, and keeps
 * its own marker's inset and width.
 */
export function endFit(
    start: EndMarker,
    end: EndMarker,
    t: number,
): { source: EndFit; target: EndFit } {
    const room = Math.max(straightEnd(start, t), straightEnd(end, t));
    const fit = (marker: EndMarker): EndFit => ({
        room: marker === "none" ? 0 : room,
        length: markerLength(marker, t),
        inset: markerInset(marker, t),
        width: markerWidth(marker, t),
    });
    return { source: fit(start), target: fit(end) };
}

/**
 * The path data for `marker` with its tip on `tip`, the line arriving along
 * the unit vector `heading`, at thickness `t`. 212's sequence messages call
 * this directly, with no router.
 */
export function markerPaths(
    marker: EndMarker,
    tip: Point,
    heading: Point,
    t: number,
): MarkerPaths {
    if (marker === "none") return { fill: "", stroke: "" };
    if (marker === "arrow") {
        return { fill: arrowheadPath(tip, heading, t), stroke: "" };
    }
    const k = scale(t);
    // Across is to the left of the heading, as `arrowheadPath` has it.
    const at: At = (b, a) =>
        `${num(tip.x - heading.x * b * k - heading.y * a * k)} ${num(tip.y - heading.y * b * k + heading.x * a * k)}`;
    const shape = SHAPES[marker];
    return {
        fill: shape.fill?.(at, t) ?? "",
        stroke: shape.stroke?.(at, t) ?? "",
    };
}

/**
 * Both ends' markers on `route`: `start` at its first point, heading back
 * out of it, and `end` at its last, as one fill and one stroke.
 */
export function edgeMarkers(
    start: EndMarker,
    end: EndMarker,
    route: Point[],
    t: number,
): MarkerPaths {
    const first = markerPaths(
        start,
        route[0],
        endHeading([...route].reverse()),
        t,
    );
    const last = markerPaths(
        end,
        route[route.length - 1],
        endHeading(route),
        t,
    );
    const join = (a: string, b: string) => [a, b].filter(Boolean).join(" ");
    return {
        fill: join(first.fill, last.fill),
        stroke: join(first.stroke, last.stroke),
    };
}
