/**
 * The rules an engine report is held to (spec 15.1 and 15.2): what
 * `resolveView` says should be drawn, and the geometry every drawing has to
 * obey. Each check takes a report (`src/engine/react-flow/report.ts`) and
 * returns the problems it found as sentences, empty when the rule holds, so
 * a failing acceptance view says what is wrong with it rather than only that
 * something is.
 *
 * Plain functions over numbers: `test/engine-checks.test.js` feeds them
 * hand-made reports, `test/acceptance.test.js` the ones real builds write.
 */

import { importSrc } from "./ts.js";

const { findElementStyle, resolveView } = await importSrc("model/index");

/** How far, in model units, an edge end may sit from its element's outline. */
export const OUTLINE_TOLERANCE = 1;

/* ------------------------------------------------- what resolveView says */

/**
 * What `resolveView` says the engine should draw for `key`: the elements
 * with their stored boxes (`placed` is false for an unplaced element), the
 * ids of the elements drawn as boundaries, and the relationship id of every
 * edge, once per time the view lists it.
 *
 * Relationships ending at a boundary are left out: the engine skips them
 * with a warning (spec 10.6). Boundaries are the elements `resolveView`
 * marks; groups and the enterprise boundary join them with #44.
 */
export function expectedDrawing(model, key) {
    const view = resolveView(model, key);
    if (!view) throw new Error(`The workspace has no view "${key}"`);

    const boundaries = new Set(view.boundaries);
    const unplaced = new Set(view.unplaced);
    const elements = view.elements
        .filter((placed) => !boundaries.has(placed.id))
        .map((placed) => {
            const style = findElementStyle(model, placed.element, "Light");
            return {
                id: placed.id,
                x: placed.x,
                y: placed.y,
                width: style.width,
                height: style.height,
                placed: !unplaced.has(placed.id),
            };
        });
    const drawn = new Set(elements.map((element) => element.id));
    const edges = view.relationships
        .filter(
            ({ relationship }) =>
                drawn.has(relationship.sourceId) &&
                drawn.has(relationship.destinationId),
        )
        .map((placed) => placed.id);

    return {
        layout: view.layout,
        elements,
        boundaries: [...boundaries],
        edges,
    };
}

/* ------------------------------------------------------------ the same ids */

/** Each id in `left` that `right` has fewer of, as many times as it is short. */
const shortfall = (left, right) => {
    const remaining = [...right];
    const missing = [];
    for (const id of left) {
        const at = remaining.indexOf(id);
        if (at === -1) missing.push(id);
        else remaining.splice(at, 1);
    }
    return missing;
};

/** The drawn element, boundary and edge ids are exactly the expected ones. */
export function sameIdsAsResolved(report, expected) {
    const kinds = [
        [
            "element",
            expected.elements.map((element) => element.id),
            report.elements.map((element) => element.id),
        ],
        [
            "boundary",
            expected.boundaries,
            report.boundaries.map((boundary) => boundary.id),
        ],
        ["edge", expected.edges, report.edges.map((edge) => edge.id)],
    ];
    const problems = [];
    for (const [kind, wanted, drawn] of kinds) {
        for (const id of shortfall(wanted, drawn)) {
            problems.push(`${kind} ${id} should be drawn and is not`);
        }
        for (const id of shortfall(drawn, wanted)) {
            problems.push(`${kind} ${id} is drawn but should not be`);
        }
    }
    return problems;
}

/* ----------------------------------------------------------- stored layout */

/**
 * In a stored layout every element the author placed is drawn exactly at its
 * stored top-left and its style's size; unplaced elements and automatic
 * layouts are free to go anywhere.
 */
export function storedElementsInPlace(report, expected) {
    if (expected.layout === "automatic") return [];
    const drawn = new Map(
        report.elements.map((element) => [element.id, element]),
    );
    const problems = [];
    for (const want of expected.elements) {
        const got = drawn.get(want.id);
        if (!want.placed || !got) continue;
        const same = ["x", "y", "width", "height"].every(
            (field) => got[field] === want[field],
        );
        if (!same) {
            problems.push(
                `element ${want.id} is drawn at ${describeBox(got)}, not its stored ${describeBox(want)}`,
            );
        }
    }
    return problems;
}

const describeBox = ({ x, y, width, height }) =>
    `${width}×${height} at (${x}, ${y})`;

/* ---------------------------------------------------------------- overlaps */

const overlap = (a, b) =>
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height;

/** No two elements share any area; touching is fine. */
export function noOverlappingElements(report) {
    const problems = [];
    const { elements } = report;
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            if (overlap(elements[i], elements[j])) {
                problems.push(
                    `elements ${elements[i].id} and ${elements[j].id} overlap`,
                );
            }
        }
    }
    return problems;
}

/* -------------------------------------------------------------- boundaries */

const inside = (inner, outer) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;

/** Every element and boundary sits inside the boundary drawn around it. */
export function elementsInsideBoundaries(report) {
    const boxes = new Map(
        [...report.elements, ...report.boundaries].map((item) => [
            item.id,
            item,
        ]),
    );
    const problems = [];
    for (const boundary of report.boundaries) {
        for (const id of boundary.children) {
            const child = boxes.get(id);
            if (child && !inside(child, boundary)) {
                problems.push(`${id} pokes out of boundary ${boundary.id}`);
            }
        }
    }
    return problems;
}

/* --------------------------------------------------------------- edge ends */

const distanceToSegment = (point, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t =
        length === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      1,
                      ((point.x - a.x) * dx + (point.y - a.y) * dy) / length,
                  ),
              );
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
};

/** How far `point` is from the nearest side of the closed polygon `outline`. */
export function distanceToOutline(point, outline) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        nearest = Math.min(nearest, distanceToSegment(point, a, b));
    }
    return nearest;
}

/** Every edge starts and ends on its elements' outlines, within 1 unit. */
export function edgeEndsOnOutlines(report) {
    const elements = new Map(
        report.elements.map((element) => [element.id, element]),
    );
    const problems = [];
    for (const edge of report.edges) {
        const ends = [
            ["source", edge.sourceId, edge.path[0]],
            ["target", edge.targetId, edge.path.at(-1)],
        ];
        for (const [end, id, point] of ends) {
            const element = elements.get(id);
            if (!element || !point) continue;
            const distance = distanceToOutline(point, element.outline);
            if (distance > OUTLINE_TOLERANCE) {
                problems.push(
                    `edge ${edge.key}'s ${end} end is ${round(distance)} units off element ${id}'s outline`,
                );
            }
        }
    }
    return problems;
}

const round = (value) => Math.round(value * 10) / 10;

/* --------------------------------------------------------------- avoidance */

/**
 * Whether the segment from `a` to `b` passes through the inside of `box`,
 * shrunk by the tolerance so that running along a side does not count
 * (Liang–Barsky clipping).
 */
const crossesBox = (a, b, box) => {
    const left = box.x + OUTLINE_TOLERANCE;
    const right = box.x + box.width - OUTLINE_TOLERANCE;
    const top = box.y + OUTLINE_TOLERANCE;
    const bottom = box.y + box.height - OUTLINE_TOLERANCE;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let enter = 0;
    let leave = 1;
    for (const [p, q] of [
        [-dx, a.x - left],
        [dx, right - a.x],
        [-dy, a.y - top],
        [dy, bottom - a.y],
    ]) {
        if (p === 0) {
            if (q < 0) return false;
            continue;
        }
        const t = q / p;
        if (p < 0) enter = Math.max(enter, t);
        else leave = Math.min(leave, t);
        if (enter > leave) return false;
    }
    return leave > enter;
};

/**
 * No edge without vertices crosses an element other than its own source and
 * target (spec 10.2). Boundaries are never obstacles.
 */
export function avoidsElements(report) {
    const problems = [];
    for (const edge of report.edges) {
        if (edge.vertices) continue;
        for (const element of report.elements) {
            if (element.id === edge.sourceId || element.id === edge.targetId) {
                continue;
            }
            const crossed = edge.path.some(
                (point, at) =>
                    at > 0 && crossesBox(edge.path[at - 1], point, element),
            );
            if (crossed) {
                problems.push(`edge ${edge.key} crosses element ${element.id}`);
            }
        }
    }
    return problems;
}

/* ------------------------------------------------------------- the console */

/** The console lines that match none of the `known` warnings. */
export const unexpectedLogs = (lines, known) =>
    lines.filter((line) => !known.some((pattern) => pattern.test(line)));

/* ------------------------------------------------------------------ timing */

/** The view was painted within `limit` milliseconds of navigation start. */
export const readyInTime = (report, limit) =>
    report.readyAt <= limit
        ? []
        : [
              `ready after ${Math.round(report.readyAt)} ms, over the ${limit} ms limit`,
          ];
