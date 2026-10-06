/**
 * Avoidance (spec 10.2, ADR 7): routing an edge without vertices around
 * every element other than its own source and target, in plain TypeScript
 * (ADR 8). Direct is the shortest route through the corners of the padded
 * elements, Orthogonal the shortest axis-aligned route along their padded
 * sides, each with a penalty per bend so fewer bends win a near tie.
 *
 * Boundaries are never passed in, so they are never avoided. The edge's own
 * source and target are not padded obstacles; the route only keeps from
 * passing back through them, which is what would otherwise happen when the
 * side chosen faces away from the other end.
 */

import type { Point, Rect, Side } from "../shapes/types";
import {
    boxAround,
    cornersOf,
    crossesBox,
    distance,
    grow,
    isHorizontal,
    isInside,
    outward,
    overlaps,
    routeCrosses,
    simplify,
} from "./path";
import { BEND_PENALTY } from "./sides";

/**
 * How far a route keeps from an element it goes around: 64 plus twice the
 * edge's thickness, so 68 at the default thickness of 2 (spec 10.2).
 */
export const obstaclePadding = (thickness: number): number =>
    64 + 2 * thickness;

/**
 * Each element grown by `padding`, except where that would swallow one of
 * the route's `endPoints`: an element that close is kept at its own size,
 * and one an end point sits inside is left out, so the route can always
 * start.
 */
export function obstaclesFor(
    elements: Rect[],
    endPoints: Point[],
    padding: number,
): Rect[] {
    const obstacles: Rect[] = [];
    for (const element of elements) {
        const padded = grow(element, padding);
        if (!endPoints.some((point) => isInside(point, padded))) {
            obstacles.push(padded);
        } else if (!endPoints.some((point) => isInside(point, element))) {
            obstacles.push(element);
        }
    }
    return obstacles;
}

const isClear = (a: Point, b: Point, blockers: Rect[]) =>
    !blockers.some((box) => crossesBox(a, b, box));

/**
 * Run `attempt` with the obstacles near the two ends first, adding any
 * further obstacle its route crosses and trying again, so a route in a large
 * view is worked out against the handful of elements around it. `null` when
 * there is no route at all.
 */
function withinReach(
    from: Point,
    to: Point,
    obstacles: Rect[],
    padding: number,
    attempt: (active: Rect[]) => Point[] | null,
): Point[] | null {
    const reach = grow(boxAround([from, to]), padding);
    let active = obstacles.filter((box) => overlaps(box, reach));
    for (;;) {
        const route = attempt(active);
        if (!route) return null;
        const missed = obstacles.filter(
            (box) => !active.includes(box) && routeCrosses(route, box),
        );
        if (!missed.length) return route;
        active = [...active, ...missed];
    }
}

/* ---------------- Direct */

/**
 * Whether the Direct route from `from` to `to` is the straight line between
 * them: it crosses none of the `elements` grown by `padding`, nor
 * `sourceAndTarget`, the edge's own source and target boxes. Side choice
 * asks the same question before any end is placed (`chooseSides`).
 */
export function isStraightClear(
    from: Point,
    to: Point,
    elements: Rect[],
    sourceAndTarget: Rect[],
    padding: number,
): boolean {
    const obstacles = obstaclesFor(elements, [from, to], padding);
    return isClear(from, to, [...obstacles, ...sourceAndTarget]);
}

/** The shares of the padding a route tries in turn, down to none. */
const PADDING_SHARES = [1, 1 / 2, 1 / 4, 0];

/**
 * The first route `router` finds from `from` to `to` past the `elements`
 * grown by `padding`, then by half and a quarter of it, then by nothing, so
 * a route squeezes through a gap narrower than twice the padding rather
 * than crossing an element. The router gets the padded elements near the
 * ends (`withinReach`) and the edge's own ends, both as they block and as
 * they are gone around. `null` when there is no route even hugging them.
 */
function narrowingRoute(
    from: Point,
    to: Point,
    elements: Rect[],
    sourceAndTarget: Rect[],
    padding: number,
    router: (
        blockers: Rect[],
        around: Rect[],
        padding: number,
    ) => Point[] | null,
): Point[] | null {
    for (const share of PADDING_SHARES) {
        const narrowed = padding * share;
        const obstacles = obstaclesFor(elements, [from, to], narrowed);
        const around = sourceAndTarget.map((box) => grow(box, narrowed));
        const route = withinReach(from, to, obstacles, narrowed, (active) =>
            router(
                [...active, ...sourceAndTarget],
                [...active, ...around],
                narrowed,
            ),
        );
        if (route) return route;
    }
    return null;
}

/**
 * The Direct route from `from` to `to` (spec 10.2): straight when nothing is
 * in the way, otherwise the shortest route through the corners of the
 * `elements` grown by `padding`, with `BEND_PENALTY` per bend.
 * `sourceAndTarget` are the edge's own source and target boxes, which it may
 * touch but not pass through. Where the padded elements leave no way
 * through, the padding narrows (`narrowingRoute`); with no route even then, it
 * falls back to the straight segment between them.
 */
export function directRoute(
    from: Point,
    to: Point,
    elements: Rect[],
    sourceAndTarget: Rect[],
    padding: number,
): Point[] {
    if (isStraightClear(from, to, elements, sourceAndTarget, padding)) {
        return [from, to];
    }
    return (
        narrowingRoute(
            from,
            to,
            elements,
            sourceAndTarget,
            padding,
            (blockers, around) => visibilityRoute(from, to, blockers, around),
        ) ?? [from, to]
    );
}

/**
 * The cheapest route from `from` to `to` through the corners of `around`
 * that crosses none of `blockers`, by A* over the visibility graph.
 */
function visibilityRoute(
    from: Point,
    to: Point,
    blockers: Rect[],
    around: Rect[],
): Point[] | null {
    const nodes = [from, to];
    for (const box of around) {
        for (const corner of cornersOf(box)) {
            if (!blockers.some((blocker) => isInside(corner, blocker))) {
                nodes.push(corner);
            }
        }
    }
    const cost = new Array<number>(nodes.length).fill(Number.POSITIVE_INFINITY);
    const estimate = nodes.map((node) => distance(node, to));
    const previous = new Array<number>(nodes.length).fill(-1);
    const settled = new Array<boolean>(nodes.length).fill(false);
    cost[0] = 0;
    for (;;) {
        let current = -1;
        let lowest = Number.POSITIVE_INFINITY;
        for (let i = 0; i < nodes.length; i++) {
            if (!settled[i] && cost[i] + estimate[i] < lowest) {
                current = i;
                lowest = cost[i] + estimate[i];
            }
        }
        if (current < 0) return null;
        if (current === 1) break;
        settled[current] = true;
        for (let next = 1; next < nodes.length; next++) {
            if (settled[next]) continue;
            const through =
                cost[current] +
                distance(nodes[current], nodes[next]) +
                (next === 1 ? 0 : BEND_PENALTY);
            if (
                through < cost[next] &&
                isClear(nodes[current], nodes[next], blockers)
            ) {
                cost[next] = through;
                previous[next] = current;
            }
        }
    }
    const route: Point[] = [];
    for (let node = 1; node >= 0; node = previous[node]) {
        route.unshift(nodes[node]);
    }
    return simplify(route);
}

/* ---------------- Orthogonal */

/** Up, right, down, left: the four headings an axis-aligned route can take. */
const HEADINGS: readonly Point[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
];

const headingOf = (direction: Point) =>
    HEADINGS.findIndex((h) => h.x === direction.x && h.y === direction.y);

/**
 * The Orthogonal route from `from`, leaving perpendicular to `fromSide`, to
 * `to`, arriving perpendicular to `toSide` (spec 10.2): the shortest
 * axis-aligned route that clears the `elements` grown by `padding`, with
 * `BEND_PENALTY` per bend, touching but never crossing `sourceAndTarget`.
 * Where the padded elements leave no way through, the padding narrows
 * (`narrowingRoute`); with no route even then, it falls back to
 * `orthogonalThrough`.
 */
export function orthogonalRoute(
    from: Point,
    fromSide: Side,
    to: Point,
    toSide: Side,
    elements: Rect[],
    sourceAndTarget: Rect[],
    padding: number,
): Point[] {
    return (
        narrowingRoute(
            from,
            to,
            elements,
            sourceAndTarget,
            padding,
            (blockers, around, narrowed) =>
                gridRoute(
                    from,
                    fromSide,
                    to,
                    toSide,
                    blockers,
                    around,
                    narrowed,
                ),
        ) ?? orthogonalThrough([from, to], fromSide, toSide)
    );
}

/**
 * A* over the grid made by the sides of `around`, the two ends and a stub
 * `padding` out from each, so the route turns either at an end's stub or
 * alongside a padded element. A state is a grid point and a heading;
 * turning costs `BEND_PENALTY` and turning back is not allowed.
 */
function gridRoute(
    from: Point,
    fromSide: Side,
    to: Point,
    toSide: Side,
    blockers: Rect[],
    around: Rect[],
    padding: number,
): Point[] | null {
    const out = outward(fromSide);
    const into = outward(toSide);
    const gridOf = (pick: (p: Point) => number, sides: (r: Rect) => number[]) =>
        [
            ...new Set([
                pick(from),
                pick(to),
                pick({
                    x: from.x + out.x * padding,
                    y: from.y + out.y * padding,
                }),
                pick({
                    x: to.x + into.x * padding,
                    y: to.y + into.y * padding,
                }),
                ...around.flatMap(sides),
            ]),
        ].sort((a, b) => a - b);
    const xs = gridOf(
        (p) => p.x,
        (r) => [r.x, r.x + r.width],
    );
    const ys = gridOf(
        (p) => p.y,
        (r) => [r.y, r.y + r.height],
    );
    const columns = xs.length;
    const pointOf = (node: number) => ({
        x: xs[node % columns],
        y: ys[Math.floor(node / columns)],
    });
    const start = ys.indexOf(from.y) * columns + xs.indexOf(from.x);
    const goal = ys.indexOf(to.y) * columns + xs.indexOf(to.x);
    const startHeading = headingOf(out);
    const goalHeading = headingOf({ x: -into.x, y: -into.y });
    const blocked = (node: number) => {
        const point = pointOf(node);
        return blockers.some((box) => isInside(point, box));
    };
    const estimate = (node: number) => {
        const point = pointOf(node);
        return Math.abs(point.x - to.x) + Math.abs(point.y - to.y);
    };

    const states = xs.length * ys.length * 4;
    const cost = new Float64Array(states).fill(Number.POSITIVE_INFINITY);
    const previous = new Int32Array(states).fill(-1);
    const closed = new Uint8Array(states);
    const queue = new Queue();
    const first = start * 4 + startHeading;
    cost[first] = 0;
    queue.push(first, estimate(start));

    while (queue.size) {
        const state = queue.pop();
        if (closed[state]) continue;
        closed[state] = 1;
        const node = state >> 2;
        const heading = state & 3;
        if (node === goal && heading === goalHeading) {
            const route: Point[] = [];
            for (let back = state; back >= 0; back = previous[back]) {
                route.unshift(pointOf(back >> 2));
            }
            return simplify(route);
        }
        const column = node % columns;
        const row = Math.floor(node / columns);
        for (let turn = 0; turn < 4; turn++) {
            if (turn === (heading + 2) % 4) continue;
            if (node === start && cost[state] === 0 && turn !== startHeading) {
                continue;
            }
            const step = HEADINGS[turn];
            const nextColumn = column + step.x;
            const nextRow = row + step.y;
            if (
                nextColumn < 0 ||
                nextColumn >= columns ||
                nextRow < 0 ||
                nextRow >= ys.length
            ) {
                continue;
            }
            const next = nextRow * columns + nextColumn;
            const nextState = next * 4 + turn;
            if (closed[nextState] || blocked(next)) continue;
            const a = pointOf(node);
            const b = pointOf(next);
            const through =
                cost[state] +
                distance(a, b) +
                (turn === heading ? 0 : BEND_PENALTY);
            if (through >= cost[nextState] || !isClear(a, b, blockers)) {
                continue;
            }
            cost[nextState] = through;
            previous[nextState] = state;
            queue.push(nextState, through + estimate(next));
        }
    }
    return null;
}

/**
 * An axis-aligned route through every one of `points` in order, with no
 * avoidance: how Orthogonal follows stored vertices (spec 10.3). It leaves
 * the first point along `firstSide`'s axis and reaches the last along
 * `lastSide`'s, turning at each point in between, so every vertex is a bend
 * or on a straight run.
 */
export function orthogonalThrough(
    points: Point[],
    firstSide: Side,
    lastSide: Side,
): Point[] {
    const route = [points[0]];
    const horizontal = !isHorizontal(firstSide);
    const lastHorizontal = !isHorizontal(lastSide);
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (i === points.length - 1 && horizontal === lastHorizontal) {
            // Leaving and arriving on the same axis: a Z through the middle.
            if (horizontal) {
                const middle = (a.x + b.x) / 2;
                route.push({ x: middle, y: a.y }, { x: middle, y: b.y });
            } else {
                const middle = (a.y + b.y) / 2;
                route.push({ x: a.x, y: middle }, { x: b.x, y: middle });
            }
        } else {
            // An L whose first leg runs on the same axis every time, so each
            // leg after a point is perpendicular to the leg before it.
            route.push(horizontal ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
        }
        route.push(b);
    }
    return simplify(route);
}

/* ---------------- the open set */

/** A binary min-heap of states by priority, for the A* open set. */
class Queue {
    readonly #states: number[] = [];
    readonly #priorities: number[] = [];

    get size() {
        return this.#states.length;
    }

    push(state: number, priority: number) {
        const states = this.#states;
        const priorities = this.#priorities;
        let at = states.length;
        states.push(state);
        priorities.push(priority);
        while (at > 0) {
            const parent = (at - 1) >> 1;
            if (priorities[parent] <= priority) break;
            states[at] = states[parent];
            priorities[at] = priorities[parent];
            at = parent;
        }
        states[at] = state;
        priorities[at] = priority;
    }

    pop(): number {
        const states = this.#states;
        const priorities = this.#priorities;
        const top = states[0];
        const state = states.pop()!;
        const priority = priorities.pop()!;
        if (!states.length) return top;
        let at = 0;
        for (;;) {
            const left = 2 * at + 1;
            if (left >= states.length) break;
            const right = left + 1;
            const child =
                right < states.length && priorities[right] < priorities[left]
                    ? right
                    : left;
            if (priorities[child] >= priority) break;
            states[at] = states[child];
            priorities[at] = priorities[child];
            at = child;
        }
        states[at] = state;
        priorities[at] = priority;
        return top;
    }
}
