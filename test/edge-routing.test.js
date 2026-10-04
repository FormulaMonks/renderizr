/**
 * `src/engine/geometry/routing/`: side choice, edge-end spreading, avoidance
 * in every routing mode, stored vertices, self-relationship loops and
 * jump-overs (spec 10.1–10.7, 10.11–10.12, ADR 7, ADR 8). Pure geometry, so
 * every check here is arithmetic on the returned routes; nothing needs a
 * browser.
 *
 * Whether a route clears an element is judged by the acceptance harness's own
 * check (`avoidsElements` in `test/support/engine-checks.js`), fed a report
 * made up here, so the router is never judged by its own crossing test.
 */

import assert from "node:assert/strict";
import { avoidsElements } from "./support/engine-checks.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { shapeGeometry } = await importSrc("engine/geometry/shapes/index");
const { BEND_PENALTY, bendsBetween, chooseSides, facingSide, spreadEnds } =
    await importSrc("engine/geometry/routing/sides");
const { directRoute, obstaclePadding, orthogonalRoute, orthogonalThrough } =
    await importSrc("engine/geometry/routing/avoid");
const { curvedRoute, curvePath } = await importSrc(
    "engine/geometry/routing/curve",
);
const { loopCorner } = await importSrc("engine/geometry/routing/loops");
const { jumpOversOf, jumpRadius } = await importSrc(
    "engine/geometry/routing/jumps",
);
const { routeView, routingModeOf } = await importSrc(
    "engine/geometry/routing/route-view",
);

const EPSILON = 1e-6;

/** An element to route around: top-left, size and shape. */
const element = (id, x, y, width = 200, height = 100, shape = "Box") => ({
    id,
    x,
    y,
    geometry: shapeGeometry(shape, width, height),
});

const boxOf = ({ x, y, geometry }) => ({
    x,
    y,
    width: geometry.width,
    height: geometry.height,
});

/** An edge between two elements, Direct, no vertices, no jump, thickness 2. */
const edge = (key, sourceId, targetId, overrides = {}) => ({
    key,
    sourceId,
    targetId,
    routing: "Direct",
    vertices: [],
    jump: false,
    thickness: 2,
    ...overrides,
});

const grow = ({ x, y, width, height }, by) => ({
    x: x - by,
    y: y - by,
    width: width + 2 * by,
    height: height + 2 * by,
});

/**
 * The problems the acceptance harness finds with `route` going between
 * `ends` past `others`, each grown by `padding`.
 */
const crossings = (route, others, padding = 0) =>
    avoidsElements({
        elements: others.map((other) => ({
            id: other.id,
            ...grow(boxOf(other), padding),
        })),
        edges: [
            {
                key: "e",
                sourceId: "source",
                targetId: "target",
                routedByAuthor: false,
                route,
            },
        ],
    });

const isAxisAligned = (route) =>
    route.every(
        (point, at) =>
            at === 0 ||
            Math.abs(point.x - route[at - 1].x) < EPSILON ||
            Math.abs(point.y - route[at - 1].y) < EPSILON,
    );

const lengthOf = (route) =>
    route.reduce(
        (sum, point, at) =>
            at === 0
                ? 0
                : sum +
                  Math.hypot(
                      point.x - route[at - 1].x,
                      point.y - route[at - 1].y,
                  ),
        0,
    );

const near = (a, b, epsilon = EPSILON) =>
    Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;

const fmt = (route) =>
    route.map(({ x, y }) => `(${x.toFixed(1)}, ${y.toFixed(1)})`).join(" ");

/* ---------------- side choice */

const BEND_CASES = [
    {
        name: "facing sides in line",
        from: [{ x: 200, y: 50 }, "right"],
        to: [{ x: 400, y: 50 }, "left"],
        bends: 0,
    },
    {
        name: "facing sides out of line",
        from: [{ x: 200, y: 50 }, "right"],
        to: [{ x: 400, y: 150 }, "left"],
        bends: 2,
    },
    {
        name: "facing sides turned away from each other",
        from: [{ x: 200, y: 50 }, "right"],
        to: [{ x: 100, y: 50 }, "left"],
        bends: 4,
    },
    {
        name: "a corner turned toward the target",
        from: [{ x: 100, y: 100 }, "bottom"],
        to: [{ x: 400, y: 300 }, "left"],
        bends: 1,
    },
    {
        name: "a corner turned away from the target",
        from: [{ x: 100, y: 100 }, "top"],
        to: [{ x: 400, y: 300 }, "left"],
        bends: 3,
    },
    {
        name: "the same side on both",
        from: [{ x: 100, y: 0 }, "top"],
        to: [{ x: 400, y: 200 }, "top"],
        bends: 2,
    },
];

for (const { name, from, to, bends } of BEND_CASES) {
    test(`bendsBetween counts ${bends} for ${name}`, () => {
        assert.equal(bendsBetween(from[0], from[1], to[0], to[1]), bends);
    });
}

const SIDE_CASES = [
    {
        name: "side by side",
        to: { x: 400, y: 0, width: 200, height: 100 },
        sides: { source: "right", target: "left" },
    },
    {
        name: "one below the other",
        to: { x: 0, y: 300, width: 200, height: 100 },
        sides: { source: "bottom", target: "top" },
    },
    {
        name: "the target to the left",
        to: { x: -400, y: 20, width: 200, height: 100 },
        sides: { source: "left", target: "right" },
    },
];

for (const { name, to, sides } of SIDE_CASES) {
    test(`chooseSides joins facing sides of elements ${name}`, () => {
        const from = { x: 0, y: 0, width: 200, height: 100 };
        for (const mode of ["Direct", "Orthogonal", "Curved"]) {
            assert.deepEqual(chooseSides(from, to, mode), sides, mode);
        }
    });
}

test("chooseSides weighs length against a penalty per bend", () => {
    // Diagonal: right→left is the shortest pair but needs two bends;
    // bottom→left and right→top need one and are barely longer.
    const from = { x: 0, y: 0, width: 200, height: 100 };
    const to = { x: 300, y: 300, width: 200, height: 100 };
    const { source, target } = chooseSides(from, to, "Direct");
    const mid = (box, side) =>
        ({
            top: { x: box.x + box.width / 2, y: box.y },
            right: { x: box.x + box.width, y: box.y + box.height / 2 },
            bottom: { x: box.x + box.width / 2, y: box.y + box.height },
            left: { x: box.x, y: box.y + box.height / 2 },
        })[side];
    const cost = (s, t) => {
        const a = mid(from, s);
        const b = mid(to, t);
        return (
            Math.hypot(b.x - a.x, b.y - a.y) +
            BEND_PENALTY * bendsBetween(a, s, b, t)
        );
    };
    const sides = ["top", "right", "bottom", "left"];
    const best = Math.min(
        ...sides.flatMap((s) => sides.map((t) => cost(s, t))),
    );
    assert.equal(cost(source, target), best);
    assert.equal(
        bendsBetween(mid(from, source), source, mid(to, target), target),
        1,
    );
});

test("facingSide is the side a ray from the center toward a point leaves by", () => {
    const box = { x: 0, y: 0, width: 200, height: 100 };
    assert.equal(facingSide(box, { x: 100, y: -500 }), "top");
    assert.equal(facingSide(box, { x: 900, y: 80 }), "right");
    assert.equal(facingSide(box, { x: 120, y: 400 }), "bottom");
    assert.equal(facingSide(box, { x: -50, y: 50 }), "left");
    // Out past the corner, the steeper direction relative to the box wins.
    assert.equal(facingSide(box, { x: 400, y: 160 }), "right");
    assert.equal(facingSide(box, { x: 300, y: 400 }), "bottom");
});

/* ---------------- spreading edge ends */

test("edge ends sharing a side sit at (i + 1) / (n + 1) of its span, sorted by the far end", () => {
    const spans = { top: { from: 10, to: 210 }, bottom: { from: 10, to: 210 } };
    const along = spreadEnds(
        [
            { id: "c", side: "bottom", far: { x: 900, y: 500 }, order: 0 },
            { id: "a", side: "bottom", far: { x: -300, y: 500 }, order: 1 },
            { id: "b", side: "bottom", far: { x: 100, y: 500 }, order: 2 },
            { id: "alone", side: "top", far: { x: 0, y: -500 }, order: 3 },
        ],
        spans,
    );
    assert.equal(along.get("a"), 60);
    assert.equal(along.get("b"), 110);
    assert.equal(along.get("c"), 160);
    assert.equal(along.get("alone"), 110);
});

test("edge ends with the same far end keep view order", () => {
    const spans = { right: { from: 0, to: 300 } };
    const along = spreadEnds(
        [
            { id: "second", side: "right", far: { x: 500, y: 50 }, order: 1 },
            { id: "first", side: "right", far: { x: 500, y: 50 }, order: 0 },
        ],
        spans,
    );
    assert.ok(along.get("first") < along.get("second"));
});

test("A→B and B→A become two parallel lanes", () => {
    const routes = routeView(
        [element("a", 0, 0), element("b", 0, 400)],
        [edge("ab", "a", "b"), edge("ba", "b", "a")],
    );
    const [ab, ba] = routes.map((r) => r.route);
    assert.equal(ab.length, 2, fmt(ab));
    assert.equal(ba.length, 2, fmt(ba));
    // A's bottom side holds both ends, apart; so does B's top.
    assert.ok(Math.abs(ab[0].x - ba.at(-1).x) > 20, "lanes on A are apart");
    assert.ok(Math.abs(ab.at(-1).x - ba[0].x) > 20, "lanes on B are apart");
    // Straight down and straight up: the lanes never meet.
    assert.equal(ab[0].x, ab.at(-1).x);
    assert.equal(ba[0].x, ba.at(-1).x);
});

test("an edge with vertices takes part in the ordering of its side", () => {
    const routes = routeView(
        [element("a", 0, 0), element("b", -400, 400), element("c", 100, 400)],
        [
            edge("ac", "a", "c"),
            edge("ab", "a", "b", { vertices: [{ x: -300, y: 300 }] }),
        ],
    );
    const [ac, ab] = routes.map((r) => r.route);
    // Both leave A's bottom: the one heading left sits left of the other.
    assert.equal(ac[0].y, 100);
    assert.equal(ab[0].y, 100);
    assert.ok(ab[0].x < ac[0].x, `${fmt(ab)} vs ${fmt(ac)}`);
});

/* ---------------- obstacles */

test("obstacles are padded by about 20, scaled to thickness", () => {
    assert.equal(obstaclePadding(2), 20);
    assert.ok(obstaclePadding(10) > obstaclePadding(2));
    assert.ok(obstaclePadding(1) < obstaclePadding(2));
});

/* ---------------- Direct */

test("Direct is straight when nothing is in the way", () => {
    const route = directRoute({ x: 200, y: 50 }, { x: 600, y: 50 }, [], [], 20);
    assert.deepEqual(route, [
        { x: 200, y: 50 },
        { x: 600, y: 50 },
    ]);
});

test("Direct bends around an element in the way, clearing its padding", () => {
    const blocker = element("blocker", 300, 0, 100, 100);
    const route = directRoute(
        { x: 200, y: 50 },
        { x: 600, y: 50 },
        [boxOf(blocker)],
        [],
        20,
    );
    assert.ok(route.length > 2, fmt(route));
    assert.deepEqual(route[0], { x: 200, y: 50 });
    assert.deepEqual(route.at(-1), { x: 600, y: 50 });
    assert.deepEqual(crossings(route, [blocker], 19), [], fmt(route));
    // Over the top or under the bottom: two bends at the padded corners.
    assert.equal(route.length, 4, fmt(route));
});

test("Direct takes the shorter way around", () => {
    // The blocker sits low, so going over it is shorter than going under.
    const blocker = { x: 300, y: 30, width: 100, height: 200 };
    const route = directRoute(
        { x: 200, y: 50 },
        { x: 600, y: 50 },
        [blocker],
        [],
        20,
    );
    assert.ok(
        route.every((point) => point.y <= 50),
        `should pass above: ${fmt(route)}`,
    );
});

test("Direct never passes back through its own ends", () => {
    // The target faces away: its left side is the one chosen, so the route
    // has to come round the target rather than through it.
    const target = { x: 400, y: 0, width: 200, height: 100 };
    const route = directRoute(
        { x: 200, y: 50 },
        { x: 600, y: 50 },
        [],
        [{ x: 0, y: 0, width: 200, height: 100 }, target],
        20,
    );
    assert.deepEqual(
        crossings(route, [{ id: "t", ...target, geometry: { ...target } }]),
        [],
        fmt(route),
    );
});

/* ---------------- Orthogonal */

test("Orthogonal is a straight run between facing sides in line", () => {
    const route = orthogonalRoute(
        { x: 200, y: 50 },
        "right",
        { x: 600, y: 50 },
        "left",
        [],
        [],
        20,
    );
    assert.deepEqual(route, [
        { x: 200, y: 50 },
        { x: 600, y: 50 },
    ]);
});

test("Orthogonal joins facing sides out of line with two bends", () => {
    const route = orthogonalRoute(
        { x: 200, y: 50 },
        "right",
        { x: 600, y: 250 },
        "left",
        [],
        [],
        20,
    );
    assert.ok(isAxisAligned(route), fmt(route));
    assert.equal(route.length, 4, fmt(route));
    assert.equal(lengthOf(route), 600);
});

test("Orthogonal clears every element by its padding, axis-aligned, by the shortest way", () => {
    const blocker = element("blocker", 300, -100, 100, 200);
    const route = orthogonalRoute(
        { x: 200, y: 50 },
        "right",
        { x: 600, y: 50 },
        "left",
        [boxOf(blocker)],
        [],
        20,
    );
    assert.ok(isAxisAligned(route), fmt(route));
    assert.deepEqual(crossings(route, [blocker], 19), [], fmt(route));
    // Under the blocker: down 70 to y 120, across 400, up 70.
    assert.equal(lengthOf(route), 400 + 2 * 70, fmt(route));
    assert.equal(route.length, 6, fmt(route));
});

test("Orthogonal leaves and enters perpendicular to the chosen sides", () => {
    const route = orthogonalRoute(
        { x: 100, y: 100 },
        "bottom",
        { x: 400, y: 300 },
        "left",
        [],
        [],
        20,
    );
    assert.deepEqual(route, [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
        { x: 400, y: 300 },
    ]);
});

/* ---------------- Curved */

test("Curved without bends is the straight Direct route", () => {
    const { route, cubics } = curvedRoute(
        [
            { x: 200, y: 50 },
            { x: 600, y: 50 },
        ],
        [],
    );
    const path = curvePath(cubics);
    assert.ok(
        route.every((point) => point.y === 50),
        fmt(route),
    );
    assert.match(path, /^M 200 50 /);
});

test("Curved smooths the Direct route without swinging into an element", () => {
    const blocker = element("blocker", 300, 0, 100, 100);
    const direct = directRoute(
        { x: 200, y: 50 },
        { x: 600, y: 50 },
        [boxOf(blocker)],
        [],
        20,
    );
    const { route, cubics } = curvedRoute(direct, [boxOf(blocker)]);
    const path = curvePath(cubics);
    assert.match(path, / C /, "drawn as cubic curves");
    assert.deepEqual(crossings(route, [blocker]), [], fmt(route));
    assert.ok(near(route[0], direct[0]) && near(route.at(-1), direct.at(-1)));
});

test("Curved backs off its smoothing when the curve would cut a corner", () => {
    // A sharp bend with an element just outside it, where a full
    // Catmull–Rom curve swings wide.
    const corner = element("corner", 430, 60, 100, 100);
    const full = curvedRoute(
        [
            { x: 0, y: 0 },
            { x: 400, y: 40 },
            { x: 420, y: 400 },
        ],
        [],
    );
    assert.notDeepEqual(
        crossings(full.route, [corner]),
        [],
        "a full curve would cut in",
    );
    const { route } = curvedRoute(
        [
            { x: 0, y: 0 },
            { x: 400, y: 40 },
            { x: 420, y: 400 },
        ],
        [boxOf(corner)],
    );
    assert.deepEqual(crossings(route, [corner]), [], fmt(route));
});

test("Curved keeps out of every element's padding, not just the element", () => {
    // The Direct route bends over the blocker; a fully smoothed curve swings
    // out of the first bend toward the element above, short of the element
    // itself but well into its padding.
    const elements = [
        element("a", 0, 0),
        element("blocker", 400, -20, 100, 140),
        element("b", 800, 0),
        element("above", 200, -70, 100, 40),
    ];
    const [routed] = routeView(elements, [
        edge("ab", "a", "b", { routing: "Curved" }),
    ]);
    // A hair less than the padding, so hugging a padded corner still passes.
    assert.deepEqual(
        crossings(
            routed.route,
            [elements[1], elements[3]],
            obstaclePadding(2) - 0.01,
        ),
        [],
        fmt(routed.route),
    );
});

/* ---------------- whole views */

test("routeView runs synchronously and routes every edge, in view order", () => {
    const elements = [];
    for (let row = 0; row < 6; row++) {
        for (let column = 0; column < 6; column++) {
            elements.push(element(`${row}-${column}`, column * 400, row * 300));
        }
    }
    const edges = [];
    for (let i = 0; i < elements.length - 7; i++) {
        edges.push(
            edge(`e${i}`, elements[i].id, elements[i + 7].id, {
                routing: ["Direct", "Orthogonal", "Curved"][i % 3],
            }),
        );
    }
    const routes = routeView(elements, edges);
    assert.ok(Array.isArray(routes), "no promise, no budget");
    assert.deepEqual(
        routes.map((r) => r.key),
        edges.map((e) => e.key),
    );
    for (const [at, routed] of routes.entries()) {
        const others = elements.filter(
            (e) => e.id !== edges[at].sourceId && e.id !== edges[at].targetId,
        );
        assert.deepEqual(crossings(routed.route, others), [], routed.key);
    }
});

test("an edge between neighbors goes round the element between them in every mode", () => {
    const elements = [
        element("a", 0, 0),
        element("blocker", 400, 0),
        element("b", 800, 0),
    ];
    for (const routing of ["Direct", "Orthogonal", "Curved"]) {
        const [routed] = routeView(elements, [
            edge("ab", "a", "b", { routing }),
        ]);
        assert.deepEqual(
            crossings(routed.route, [elements[1]]),
            [],
            `${routing}: ${fmt(routed.route)}`,
        );
        if (routing === "Orthogonal") assert.ok(isAxisAligned(routed.route));
    }
});

test("the edge's own source and target are not obstacles", () => {
    // Elements overlapping their padding: still a straight route.
    const [routed] = routeView(
        [element("a", 0, 0), element("b", 210, 0)],
        [edge("ab", "a", "b")],
    );
    assert.deepEqual(routed.route, [
        { x: 200, y: 50 },
        { x: 210, y: 50 },
    ]);
});

test("routingModeOf reads Direct, Orthogonal and Curved, and Direct for anything else", () => {
    assert.equal(routingModeOf("Orthogonal"), "Orthogonal");
    assert.equal(routingModeOf("Curved"), "Curved");
    assert.equal(routingModeOf("Direct"), "Direct");
    assert.equal(routingModeOf("Splines"), "Direct");
    assert.equal(routingModeOf(undefined), "Direct");
});

/* ---------------- stored vertices */

test("Direct with vertices is a polyline through them, avoidance off", () => {
    const elements = [
        element("a", 0, 0),
        element("blocker", 400, 0),
        element("b", 800, 0),
    ];
    const vertices = [
        { x: 500, y: 50 },
        { x: 650, y: 300 },
    ];
    const [routed] = routeView(elements, [edge("ab", "a", "b", { vertices })]);
    assert.deepEqual(routed.route.slice(1, -1), vertices);
});

test("Orthogonal with vertices passes through each one on axis-aligned segments", () => {
    const vertices = [
        { x: 300, y: 300 },
        { x: 700, y: 200 },
    ];
    const [routed] = routeView(
        [element("a", 0, 0), element("b", 800, 0)],
        [edge("ab", "a", "b", { routing: "Orthogonal", vertices })],
    );
    assert.ok(isAxisAligned(routed.route), fmt(routed.route));
    for (const vertex of vertices) {
        assert.ok(
            routed.route.some((point) => near(point, vertex)),
            `${fmt([vertex])} is on ${fmt(routed.route)}`,
        );
    }
});

test("orthogonalThrough starts and ends on the axis of each side", () => {
    const route = orthogonalThrough(
        [
            { x: 200, y: 50 },
            { x: 600, y: 250 },
        ],
        "right",
        "left",
    );
    assert.deepEqual(route, [
        { x: 200, y: 50 },
        { x: 400, y: 50 },
        { x: 400, y: 250 },
        { x: 600, y: 250 },
    ]);
});

test("Curved with vertices is smooth through each one", () => {
    const vertices = [{ x: 500, y: 400 }];
    const [routed] = routeView(
        [element("a", 0, 0), element("b", 800, 0)],
        [edge("ab", "a", "b", { routing: "Curved", vertices })],
    );
    assert.match(routed.path, / C /);
    assert.ok(
        routed.route.some((point) => near(point, vertices[0])),
        "passes through the vertex",
    );
    // The curve's segments meet at the vertex.
    assert.match(routed.path, / 500 400 C /);
});

/* ---------------- line end and heading */

test("the line's path ends its thickness short of the target end, along the route's heading", () => {
    const elements = [
        element("a", 0, 0),
        element("blocker", 400, 0),
        element("b", 800, 0),
    ];
    const cases = [
        ["Direct", {}],
        ["Orthogonal", {}],
        ["Curved", {}],
        ["Direct", { jump: true }],
        ["Direct", { vertices: [{ x: 500, y: 400 }] }],
        ["Curved", { vertices: [{ x: 500, y: 400 }] }],
    ];
    for (const [routing, overrides] of cases) {
        const name = `${routing} ${JSON.stringify(overrides)}`;
        const [routed] = routeView(elements, [
            edge("ab", "a", "b", { routing, thickness: 3, ...overrides }),
        ]);
        const end = routed.route.at(-1);
        const before = routed.route.at(-2);
        const length = Math.hypot(end.x - before.x, end.y - before.y);
        assert.ok(
            near(routed.heading, {
                x: (end.x - before.x) / length,
                y: (end.y - before.y) / length,
            }),
            `${name}: the heading follows the last segment, not ${fmt([routed.heading])}`,
        );
        const lineEnd = routed.path.match(/(-?[\d.]+) (-?[\d.]+)$/);
        assert.ok(
            near(
                { x: Number(lineEnd[1]), y: Number(lineEnd[2]) },
                {
                    x: end.x - 3 * routed.heading.x,
                    y: end.y - 3 * routed.heading.y,
                },
                1e-3,
            ),
            `${name}: the path ends at ${lineEnd[0]}, not 3 short of ${fmt([end])}`,
        );
    }
});

test("a self-relationship's line also ends short of its target end", () => {
    for (const routing of ["Direct", "Orthogonal", "Curved"]) {
        const [loop] = routeView(
            [element("a", 0, 0)],
            [edge("aa", "a", "a", { routing })],
        );
        const end = loop.route.at(-1);
        assert.ok(
            !loop.path.endsWith(`${end.x} ${end.y}`),
            `${routing}: the loop's line runs to its tip`,
        );
    }
});

/* ---------------- edge ends on the outline */

test("each end moves inward to the drawn outline, perpendicular to its side", () => {
    const [routed] = routeView(
        [element("a", 0, 0), element("circle", 0, 400, 300, 300, "Circle")],
        [edge("ab", "a", "circle")],
    );
    const end = routed.route.at(-1);
    // Straight down onto the circle's top: x is the side's spread point.
    assert.ok(Math.abs(end.x - 150) < EPSILON, fmt(routed.route));
    assert.ok(
        Math.abs(Math.hypot(end.x - 150, end.y - 550) - 150) < EPSILON,
        `the arrowhead tip should sit on the circle: ${fmt(routed.route)}`,
    );
});

test("the arrowhead tip lands on the outline off-center too", () => {
    const [first, second] = routeView(
        [
            element("a", 0, 0, 300, 100),
            element("circle", 0, 400, 300, 300, "Circle"),
        ],
        [edge("one", "a", "circle"), edge("two", "a", "circle")],
    );
    for (const routed of [first, second]) {
        const end = routed.route.at(-1);
        assert.ok(
            Math.abs(Math.hypot(end.x - 150, end.y - 550) - 150) < EPSILON,
            fmt(routed.route),
        );
        assert.ok(end.y > 400, "moved inward from the box");
    }
});

/* ---------------- self-relationships */

test("loopCorner picks the corner with the fewest edge ends, top-right on a tie", () => {
    assert.deepEqual(loopCorner({ top: 0, right: 0, bottom: 0, left: 0 }), [
        "top",
        "right",
    ]);
    assert.deepEqual(loopCorner({ top: 2, right: 1, bottom: 0, left: 0 }), [
        "bottom",
        "left",
    ]);
    assert.deepEqual(loopCorner({ top: 0, right: 3, bottom: 1, left: 1 }), [
        "left",
        "top",
    ]);
});

test("a self-relationship loops out of one side and into the next clockwise", () => {
    const box = element("a", 0, 0);
    for (const routing of ["Direct", "Orthogonal", "Curved"]) {
        const [routed] = routeView([box], [edge("aa", "a", "a", { routing })]);
        const start = routed.route[0];
        const end = routed.route.at(-1);
        assert.equal(
            start.y,
            0,
            `${routing} leaves the top: ${fmt(routed.route)}`,
        );
        assert.equal(
            end.x,
            200,
            `${routing} enters the right: ${fmt(routed.route)}`,
        );
        assert.ok(
            routed.route.slice(1, -1).every((p) => p.y < 0 || p.x > 200),
            `${routing} stays outside the element: ${fmt(routed.route)}`,
        );
        if (routing === "Orthogonal") assert.ok(isAxisAligned(routed.route));
    }
});

test("a loop takes the corner away from the element's other edge ends", () => {
    const [, loop] = routeView(
        [element("a", 0, 0), element("b", 600, 0)],
        [edge("ab", "a", "b"), edge("aa", "a", "a")],
    );
    // A's right side is taken, so the loop goes bottom → left.
    assert.equal(loop.route[0].y, 100, fmt(loop.route));
    assert.equal(loop.route.at(-1).x, 0, fmt(loop.route));
});

test("a loop's edge ends are spread with the other edge ends on their sides, nearest the corner", () => {
    // One edge out of every side of A: every corner holds two edge ends, so
    // the loop takes the top-right fallback and shares both of its sides.
    const a = element("a", 400, 400);
    const elements = [
        a,
        element("n", 400, 0),
        element("e", 1000, 400),
        element("s", 400, 800),
        element("w", -200, 400),
    ];
    const { top, right } = a.geometry.spans;
    const third = (span, i) => span.from + (i / 3) * (span.to - span.from);
    for (const routing of ["Direct", "Orthogonal", "Curved"]) {
        const routes = routeView(elements, [
            edge("an", "a", "n", { routing }),
            edge("ae", "a", "e", { routing }),
            edge("as", "a", "s", { routing }),
            edge("aw", "a", "w", { routing }),
            edge("aa", "a", "a", { routing }),
        ]);
        const [an, ae, , , loop] = routes.map((r) => r.route);
        const message = `${routing}: ${fmt(loop)}`;
        // Top: the edge to N at 1/3, the loop at 2/3, nearer the corner.
        assert.ok(near(an[0], { x: 400 + third(top, 1), y: 400 }), message);
        assert.ok(near(loop[0], { x: 400 + third(top, 2), y: 400 }), message);
        // Right: the loop at 1/3, nearer the corner, the edge to E at 2/3.
        assert.ok(near(loop.at(-1), { x: 600, y: 400 + third(right, 1) }));
        assert.ok(near(ae[0], { x: 600, y: 400 + third(right, 2) }), message);
        assert.ok(
            loop.slice(1, -1).every((p) => p.y < 400 || p.x > 600),
            `${message} stays outside the element`,
        );
    }
});

test("several loops on one element nest outward", () => {
    const [inner, outer] = routeView(
        [element("a", 0, 0)],
        [
            edge("one", "a", "a", { routing: "Orthogonal" }),
            edge("two", "a", "a", { routing: "Orthogonal" }),
        ],
    );
    const top = (route) => Math.min(...route.map((p) => p.y));
    const right = (route) => Math.max(...route.map((p) => p.x));
    assert.ok(top(outer.route) < top(inner.route));
    assert.ok(right(outer.route) > right(inner.route));
    assert.ok(
        outer.route[0].x < inner.route[0].x,
        "leaves farther from the corner",
    );
    assert.ok(
        outer.route.at(-1).y > inner.route.at(-1).y,
        "enters farther from the corner",
    );
});

/* ---------------- jump-overs */

const crossingView = (over, under) =>
    routeView(
        [
            element("w", 0, 200),
            element("e", 800, 200),
            element("n", 400, -200),
            element("s", 400, 600),
        ],
        [edge("horizontal", "w", "e", over), edge("vertical", "n", "s", under)],
    );

test("jumpRadius is 3t + 3", () => {
    assert.equal(jumpRadius(2), 9);
    assert.equal(jumpRadius(5), 18);
});

test("a jump edge draws a jump-over where it crosses another edge", () => {
    const [horizontal, vertical] = crossingView({ jump: true }, {});
    assert.match(horizontal.path, / A 9 9 0 0 [01] /, horizontal.path);
    assert.doesNotMatch(vertical.path, / A /);
});

test("when both edges jump, the later in view order draws the jump-over", () => {
    const [horizontal, vertical] = crossingView({ jump: true }, { jump: true });
    assert.doesNotMatch(horizontal.path, / A /);
    assert.match(vertical.path, / A 9 9 /);
});

test("jump-overs are drawn in Direct and Orthogonal, and Curved ignores jump", () => {
    for (const routing of ["Direct", "Orthogonal"]) {
        const [horizontal] = crossingView({ jump: true, routing }, {});
        assert.match(horizontal.path, / A /, routing);
    }
    const [curved] = crossingView({ jump: true, routing: "Curved" }, {});
    assert.doesNotMatch(curved.path, / A /);
});

test("jumpOversOf skips crossings too close to a bend or an end", () => {
    const route = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
    ];
    const others = [
        // Crosses the first segment at x 50: well clear of both ends.
        [
            { x: 50, y: -50 },
            { x: 50, y: 50 },
        ],
        // Crosses at x 95: right next to the bend.
        [
            { x: 95, y: -50 },
            { x: 95, y: 50 },
        ],
        // Crosses the second segment at y 3: right next to the bend again.
        [
            { x: 50, y: 3 },
            { x: 150, y: 3 },
        ],
    ];
    const jumpOvers = jumpOversOf(route, others, 9);
    assert.deepEqual(jumpOvers, [{ segment: 0, at: { x: 50, y: 0 } }]);
});
