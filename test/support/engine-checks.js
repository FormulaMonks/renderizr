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
 * Where geometry is needed (an element's outline), it is worked out here from
 * what the report says was drawn, never read from the engine, so a check
 * cannot pass only because the engine agrees with itself.
 */

import { importSrc } from "./ts.js";

const { findElementStyle, resolveView } = await importSrc("model/index");

/** How far, in model units, an edge end may sit from its element's outline. */
export const OUTLINE_TOLERANCE = 1;

/* ------------------------------------------------- what resolveView says */

/**
 * What `resolveView` says the engine should draw for `key`: the elements
 * with their stored boxes (`placed` is false for an unplaced element), the
 * ids of the boundaries (elements with children in the view, groups and the
 * enterprise), what each boundary has directly inside it (`nesting`), and
 * the relationship id of every edge, once per time the view lists it.
 *
 * Relationships ending at a boundary are left out: the engine skips them
 * with a warning (spec 10.6).
 */
export function expectedDrawing(model, key) {
    const view = resolveView(model, key);
    if (!view) throw new Error(`The workspace has no view "${key}"`);

    const boundaries = new Set(view.boundaries.map((boundary) => boundary.id));
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
        nesting: Object.fromEntries(
            view.boundaries.map((boundary) => [boundary.id, boundary.children]),
        ),
        edges,
    };
}

/**
 * Whether the view is laid out at render time, so that nothing about where
 * its elements go comes from the workspace. The one place that decides.
 */
export const isAutomatic = (expected) => expected.layout === "automatic";

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

/** Each id short on either side, named as a `kind`. */
const differences = (kind, wanted, drawn) => [
    ...shortfall(wanted, drawn).map(
        (id) => `${kind} ${id} should be drawn and is not`,
    ),
    ...shortfall(drawn, wanted).map(
        (id) => `${kind} ${id} is drawn but should not be`,
    ),
];

/** The drawn element and edge ids are exactly the expected ones. */
export const sameElementsAndEdgesAsResolved = (report, expected) => [
    ...differences(
        "element",
        expected.elements.map((element) => element.id),
        report.elements.map((element) => element.id),
    ),
    ...differences(
        "edge",
        expected.edges,
        report.edges.map((edge) => edge.id),
    ),
];

/**
 * The drawn boundary ids are exactly the expected ones. Apart from the
 * elements and edges so that a view whose boundaries are not drawn yet still
 * has its elements and edges checked.
 */
export const sameBoundariesAsResolved = (report, expected) =>
    differences(
        "boundary",
        expected.boundaries,
        report.boundaries.map((boundary) => boundary.id),
    );

/* ----------------------------------------------------------- stored layout */

/**
 * In a stored layout every element the author placed is drawn exactly at its
 * stored top-left and its style's size; unplaced elements and automatic
 * layouts are free to go anywhere.
 */
export function storedElementsInPlace(report, expected) {
    if (isAutomatic(expected)) return [];
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

/**
 * In an automatic layout, no two elements share any area; touching is fine.
 * A stored layout is drawn where its author put it, overlaps and all.
 */
export function noOverlappingElements(report, expected) {
    if (!isAutomatic(expected)) return [];
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

/** Slack for floating-point noise in derived boxes, in model units. */
const INSIDE_TOLERANCE = 1e-6;

const inside = (inner, outer) =>
    inner.x >= outer.x - INSIDE_TOLERANCE &&
    inner.y >= outer.y - INSIDE_TOLERANCE &&
    inner.x + inner.width <= outer.x + outer.width + INSIDE_TOLERANCE &&
    inner.y + inner.height <= outer.y + outer.height + INSIDE_TOLERANCE;

/**
 * Every element and boundary sits inside every boundary drawn around it, the
 * nearest and all those around that. Which boundaries those are comes from
 * `expected.nesting` (what `resolveView` says), so the engine cannot pass by
 * leaving an element out of the children it reports; without it, from the
 * report's own `children`.
 */
export function elementsInsideBoundaries(report, expected) {
    const boxes = new Map(
        [...report.elements, ...report.boundaries].map((item) => [
            item.id,
            item,
        ]),
    );
    const nesting =
        expected?.nesting ??
        Object.fromEntries(
            report.boundaries.map((boundary) => [
                boundary.id,
                boundary.children,
            ]),
        );
    const within = (id, found = new Set()) => {
        for (const child of nesting[id] ?? []) {
            if (found.has(child)) continue;
            found.add(child);
            within(child, found);
        }
        return found;
    };
    const problems = [];
    for (const boundary of report.boundaries) {
        for (const id of within(boundary.id)) {
            const child = boxes.get(id);
            if (child && !inside(child, boundary)) {
                problems.push(`${id} pokes out of boundary ${boundary.id}`);
            }
        }
    }
    return problems;
}

/**
 * In an automatic layout, no boundary overlaps a boundary neither inside nor
 * round it, or an element it is not drawn around; touching is fine. Dagre
 * never sizes a boundary (spec 7.1), so this is what holds the engine to
 * making room for them. A stored layout is drawn where its author put it,
 * overlaps and all. Which boundaries are round what comes from
 * `expected.nesting`, as in `elementsInsideBoundaries`; without it, from the
 * report's own `children`.
 */
export function noOverlappingBoundaries(report, expected) {
    if (expected && !isAutomatic(expected)) return [];
    const nesting =
        expected?.nesting ??
        Object.fromEntries(
            report.boundaries.map((boundary) => [
                boundary.id,
                boundary.children,
            ]),
        );
    const parent = new Map();
    for (const [id, children] of Object.entries(nesting))
        for (const child of children) parent.set(child, id);
    /** Whether boundary `outer` is drawn round `id`, at any depth. */
    const round = (outer, id) => {
        const seen = new Set();
        for (let p = parent.get(id); p && !seen.has(p); p = parent.get(p)) {
            if (p === outer) return true;
            seen.add(p);
        }
        return false;
    };
    const problems = [];
    const { boundaries, elements } = report;
    for (let i = 0; i < boundaries.length; i++) {
        const a = boundaries[i];
        for (const b of boundaries.slice(i + 1)) {
            if (round(a.id, b.id) || round(b.id, a.id)) continue;
            if (overlap(a, b)) {
                problems.push(`boundaries ${a.id} and ${b.id} overlap`);
            }
        }
        for (const element of elements) {
            if (round(a.id, element.id)) continue;
            if (overlap(a, element)) {
                problems.push(
                    `boundary ${a.id} overlaps element ${element.id}, which it is not drawn around`,
                );
            }
        }
    }
    return problems;
}

/* --------------------------------------------------------------- edge ends */

/*
 * Each shape is outlined here as the filled regions upstream's renderer
 * (`createPerson`, `createCylinder` and the rest in the vendored
 * `structurizr-diagram.js`) draws it with, at the proportions it draws them,
 * stretched to the box the report gives. The silhouette is the edge of their
 * union. Nothing comes from the engine's shape modules, which work the same
 * silhouettes out another way (segments walked round the shape), so an edge
 * end the engine misplaces fails here even when its own geometry agrees.
 *
 * Every region is a closed polygon; curves are sampled finely enough that the
 * polygon is within 0.05 of the curve at any size the acceptance set draws.
 * Coordinates are local to the element until `elementOutline` moves them.
 */

/** How many points a whole ellipse is sampled at; a quarter corner gets a quarter. */
const ELLIPSE_POINTS = 360;

/** Points along the ellipse arc from angle `start` to `end` (radians, y down). */
const arcPoints = (cx, cy, rx, ry, start, end) => {
    const steps = Math.max(
        2,
        Math.ceil((Math.abs(end - start) / (2 * Math.PI)) * ELLIPSE_POINTS),
    );
    return Array.from({ length: steps + 1 }, (_, i) => {
        const angle = start + ((end - start) * i) / steps;
        return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });
};

const ellipseRegion = (cx, cy, rx, ry) =>
    arcPoints(cx, cy, rx, ry, 0, 2 * Math.PI).slice(0, -1);

/**
 * An SVG `<rect>` with corners of radius `r`, which SVG clamps to half the
 * shorter side.
 */
const rectRegion = (x, y, width, height, r = 0) => {
    const radius = Math.max(0, Math.min(r, width / 2, height / 2));
    if (radius === 0) {
        return [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
        ];
    }
    const quarter = Math.PI / 2;
    const left = x + radius;
    const right = x + width - radius;
    const top = y + radius;
    const bottom = y + height - radius;
    return [
        ...arcPoints(right, top, radius, radius, -quarter, 0),
        ...arcPoints(right, bottom, radius, radius, 0, quarter),
        ...arcPoints(left, bottom, radius, radius, quarter, 2 * quarter),
        ...arcPoints(left, top, radius, radius, 2 * quarter, 3 * quarter),
    ];
};

const polygonRegion = (...points) => points.map(([x, y]) => ({ x, y }));

/** Upstream's lid and end caps are ellipses 60 deep. */
const CAP = 30;

/**
 * Person and Robot are drawn in a square box (upstream derives the height
 * from the width); the body is the lower 60% of it.
 */
const bodyTop = (height) => 0.4 * height;

/**
 * The filled regions each shape is drawn with, in a `width` × `height` box at
 * the origin, from upstream's proportions. The windowed shapes and the mobile
 * devices are one frame each: their panels, buttons and displays lie inside
 * it. Their frame is the element's height (upstream overhangs it by the
 * stroke width), so no shape needs anything the box does not give.
 */
const SHAPE_REGIONS = {
    Box: (w, h) => [rectRegion(0, 0, w, h, 1)],
    RoundedBox: (w, h) => [rectRegion(0, 0, w, h, 20)],
    Circle: (w, h) => {
        const r = Math.min(w, h) / 2;
        return [ellipseRegion(w / 2, h / 2, r, r)];
    },
    Ellipse: (w, h) => [ellipseRegion(w / 2, h / 2, w / 2, h / 2)],
    Hexagon: (w, h) => [
        polygonRegion(
            [w / 4, 0],
            [(3 * w) / 4, 0],
            [w, h / 2],
            [(3 * w) / 4, h],
            [w / 4, h],
            [0, h / 2],
        ),
    ],
    Diamond: (w, h) => [
        polygonRegion([w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]),
    ],
    Cylinder: (w, h) => [
        ellipseRegion(w / 2, CAP, w / 2, CAP),
        rectRegion(0, CAP, w, h - 2 * CAP),
        ellipseRegion(w / 2, h - CAP, w / 2, CAP),
    ],
    Bucket: (w, h) => {
        // The bottom is an arc of an ellipse 2·CAP tall whose chord, 0.8 of
        // the width, joins the walls CAP above the box's bottom.
        const chord = h - CAP;
        const cy = chord - 0.6 * 2 * CAP;
        return [
            ellipseRegion(w / 2, CAP, w / 2, CAP),
            polygonRegion(
                [0, CAP],
                [w, CAP],
                [0.9 * w, chord],
                [0.1 * w, chord],
            ),
            arcPoints(
                w / 2,
                cy,
                w / 2,
                2 * CAP,
                Math.atan2(0.6, 0.8),
                Math.atan2(0.6, -0.8),
            ),
        ];
    },
    Pipe: (w, h) => [
        ellipseRegion(CAP, h / 2, CAP, h / 2),
        rectRegion(CAP, 0, w - 2 * CAP, h),
        ellipseRegion(w - CAP, h / 2, CAP, h / 2),
    ],
    Person: (w, h) => {
        const r = Math.min(w, h) / 4.5;
        const top = bodyTop(h);
        return [
            ellipseRegion(w / 2, top - 0.8 * r, r, r),
            rectRegion(0, top, w, h - top, 70),
        ];
    },
    Robot: (w, h) => {
        const side = Math.min(w, h) / 2.25;
        const top = bodyTop(h);
        const headY = top - 0.9 * side;
        return [
            rectRegion((w - side) / 2, headY, side, side, 30),
            rectRegion(
                (w - 1.25 * side) / 2,
                headY + (side - 0.225 * side) / 2,
                1.25 * side,
                0.225 * side,
                10,
            ),
            rectRegion(0, top, w, h - top, 30),
        ];
    },
    Folder: (w, h) => [
        rectRegion(10, 0, w / 3, h / 4, 10),
        rectRegion(0, h / 8, w, h - h / 8, 5),
    ],
    WebBrowser: (w, h) => [rectRegion(0, 0, w, h, 10)],
    Window: (w, h) => [rectRegion(0, 0, w, h, 10)],
    MobileDevicePortrait: (w, h) => [rectRegion(0, 0, w, h, 20)],
    MobileDeviceLandscape: (w, h) => [rectRegion(0, 0, w, h, 20)],
    Component: (w, h) => {
        const blockWidth = w / 6;
        const blockHeight = h / 8;
        return [
            rectRegion(blockWidth / 2, 0, w - blockWidth / 2, h, 10),
            rectRegion(0, 0.6 * blockHeight, blockWidth, blockHeight, 5),
            rectRegion(0, 2 * blockHeight, blockWidth, blockHeight, 5),
        ];
    },
    Shell: (w, h) => [rectRegion(0, 0, w, h, 10)],
    Terminal: (w, h) => [rectRegion(0, 0, w, h, 10)],
};

/** The shapes the harness outlines; anything else is drawn as a Box. */
export const OUTLINED_SHAPES = Object.keys(SHAPE_REGIONS);

/**
 * The outline of `element`, from the shape and box the report gives: the
 * filled regions the shape is drawn with, each a closed polygon, whose union
 * is the shape. An unknown shape is a Box, as upstream draws it.
 */
export function elementOutline({ shape, x, y, width, height }) {
    const regions = (SHAPE_REGIONS[shape] ?? SHAPE_REGIONS.Box)(width, height);
    return regions.map((region) =>
        region.map((point) => ({ x: x + point.x, y: y + point.y })),
    );
}

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

/** Whether `point` is inside the closed polygon `region` (even-odd rule). */
const insideRegion = (point, region) => {
    let inside = false;
    for (let i = 0, j = region.length - 1; i < region.length; j = i++) {
        const a = region[i];
        const b = region[j];
        if (
            a.y > point.y !== b.y > point.y &&
            point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
        ) {
            inside = !inside;
        }
    }
    return inside;
};

/** How far `point` is outside `region`, negative when inside it. */
const signedDistance = (point, region) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < region.length; i++) {
        const a = region[i];
        const b = region[(i + 1) % region.length];
        nearest = Math.min(nearest, distanceToSegment(point, a, b));
    }
    return insideRegion(point, region) ? -nearest : nearest;
};

/**
 * How far `point` is from the edge of the union of `regions`, inside or out.
 * Outside every region it is the distance to the nearest; inside, the depth
 * into the region it is deepest in, so a side of one region hidden inside
 * another (the body's top under a Person's head) is not on the outline. That
 * depth can fall short of the true one only within a unit or so of where two
 * regions' sides cross, which is on the outline anyway.
 */
export function distanceToOutline(point, regions) {
    return Math.abs(
        Math.min(...regions.map((region) => signedDistance(point, region))),
    );
}

/** Every edge starts and ends on its elements' outlines, within 1 unit. */
export function edgeEndsOnOutlines(report) {
    const elements = new Map(
        report.elements.map((element) => [element.id, element]),
    );
    const problems = [];
    for (const edge of report.edges) {
        const ends = [
            ["source", edge.sourceId, edge.route[0]],
            ["target", edge.targetId, edge.route.at(-1)],
        ];
        for (const [end, id, point] of ends) {
            const element = elements.get(id);
            if (!element || !point) continue;
            const distance = distanceToOutline(point, elementOutline(element));
            if (distance > OUTLINE_TOLERANCE) {
                problems.push(
                    `edge ${edge.key}'s ${end} end is ${round(distance)} units off element ${id}'s ${element.shape} outline`,
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
        if (edge.routedByAuthor) continue;
        for (const element of report.elements) {
            if (element.id === edge.sourceId || element.id === edge.targetId) {
                continue;
            }
            const crossed = edge.route.some(
                (point, at) =>
                    at > 0 && crossesBox(edge.route[at - 1], point, element),
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

/**
 * The view arrived within `limit` wall-clock milliseconds of being opened.
 * How `elapsed` is measured, and why not inside the page, is said at
 * `renderPage` (`test/support/browser.js`).
 */
export const readyInTime = (elapsed, limit) =>
    elapsed <= limit
        ? []
        : [`ready after ${Math.round(elapsed)} ms, over the ${limit} ms limit`];
