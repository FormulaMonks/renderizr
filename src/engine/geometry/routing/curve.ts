/**
 * Curved routes (spec 10.2, 10.3): a smooth curve through the points of a
 * Direct route or a relationship's vertices, as a Catmull–Rom spline written
 * as cubic Béziers. Avoidance only checks the curve: where it would swing
 * into a padded element, the smoothing is eased off until it does not, down to the
 * Direct route itself.
 */

import type { Point, Rect } from "../shapes/types";
import { at, routeCrosses } from "./path";

/** One cubic Bézier piece: its end point and two control points. */
type Cubic = { from: Point; c1: Point; c2: Point; to: Point };

/**
 * How smooth the curve is, from full Catmull–Rom down; past the last, the
 * curve is the straight lines between the points.
 */
const TENSIONS = [1, 0.5, 0.25];

/** Points sampled per cubic piece for the route the report and checks read. */
const SAMPLES = 16;

/** The Catmull–Rom spline through `points`, at `tension`, as cubic pieces. */
function smooth(points: Point[], tension: number): Cubic[] {
    const cubics: Cubic[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
        const before = points[i - 1] ?? points[i];
        const from = points[i];
        const to = points[i + 1];
        const after = points[i + 2] ?? to;
        const k = tension / 6;
        cubics.push({
            from,
            c1: {
                x: from.x + (to.x - before.x) * k,
                y: from.y + (to.y - before.y) * k,
            },
            c2: {
                x: to.x - (after.x - from.x) * k,
                y: to.y - (after.y - from.y) * k,
            },
            to,
        });
    }
    return cubics;
}

const pointOn = ({ from, c1, c2, to }: Cubic, t: number): Point => {
    const s = 1 - t;
    const a = s * s * s;
    const b = 3 * s * s * t;
    const c = 3 * s * t * t;
    const d = t * t * t;
    return {
        x: a * from.x + b * c1.x + c * c2.x + d * to.x,
        y: a * from.y + b * c1.y + c * c2.y + d * to.y,
    };
};

/** Points along the curve, every piece's own end points included exactly. */
function sample(cubics: Cubic[]): Point[] {
    const points: Point[] = [];
    for (const cubic of cubics) {
        points.push(cubic.from);
        for (let step = 1; step < SAMPLES; step++) {
            points.push(pointOn(cubic, step / SAMPLES));
        }
    }
    points.push(cubics[cubics.length - 1].to);
    return points;
}

const pathOf = (cubics: Cubic[]): string =>
    [
        `M ${at(cubics[0].from)}`,
        ...cubics.map(({ c1, c2, to }) => `C ${at(c1)} ${at(c2)} ${at(to)}`),
    ].join(" ");

/**
 * The smooth curve through `points`: its path data, and its route as
 * sampled points. The first tension whose curve stays out of every one of
 * `obstacles` (the padded elements, spec 10.2) wins; with none, the curve is
 * as smooth as it gets.
 */
export function curvedRoute(
    points: Point[],
    obstacles: Rect[],
): { route: Point[]; path: string } {
    let cubics = smooth(points, 0);
    for (const tension of TENSIONS) {
        const candidate = smooth(points, tension);
        const route = sample(candidate);
        if (!obstacles.some((box) => routeCrosses(route, box))) {
            cubics = candidate;
            break;
        }
    }
    return { route: sample(cubics), path: pathOf(cubics) };
}

/**
 * One cubic Bézier from `from` to `to` through the control points `c1` and
 * `c2`: how a Curved self-relationship loops.
 */
export function cubicRoute(
    from: Point,
    c1: Point,
    c2: Point,
    to: Point,
): { route: Point[]; path: string } {
    const cubics = [{ from, c1, c2, to }];
    return { route: sample(cubics), path: pathOf(cubics) };
}
