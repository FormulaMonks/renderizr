/**
 * `src/engine/geometry/shapes/`: the outline, content area, side spans and
 * ray math of the 19 Structurizr shapes (spec 9.4). Pure geometry, so every
 * check here is arithmetic on the returned data.
 */

import assert from "node:assert/strict";
import {
    distanceToOutline,
    elementOutline,
    OUTLINE_TOLERANCE,
} from "./support/engine-checks.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { SHAPES, isShape, shapeGeometry, shapeSize } = await importSrc(
    "engine/geometry/shapes/index",
);
const { intersect, touch } = await importSrc("engine/geometry/shapes/outline");

const EPSILON = 1e-6;
const SIDES = ["top", "right", "bottom", "left"];
const SIZES = [
    [450, 300],
    [300, 450],
    [400, 400],
];

const close = (a, b, epsilon = EPSILON) => Math.abs(a - b) <= epsilon;

const startOf = (segment) =>
    segment.kind === "line" ? segment.from : pointOnArc(segment, segment.start);

const endOf = (segment) =>
    segment.kind === "line" ? segment.to : pointOnArc(segment, segment.end);

const pointOnArc = ({ center, rx, ry }, angle) => ({
    x: center.x + rx * Math.cos(angle),
    y: center.y + ry * Math.sin(angle),
});

/** Whether `point` lies on `segment`, within `EPSILON`. */
function onSegment(point, segment) {
    if (segment.kind === "line") {
        const { from, to } = segment;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length === 0)
            return close(point.x, from.x) && close(point.y, from.y);
        const across =
            ((point.x - from.x) * dy - (point.y - from.y) * dx) / length;
        const along =
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / length;
        return (
            Math.abs(across) <= 1e-6 && along >= -1e-6 && along <= length + 1e-6
        );
    }
    const u = (point.x - segment.center.x) / segment.rx;
    const v = (point.y - segment.center.y) / segment.ry;
    if (!close(u * u + v * v, 1, 1e-6)) return false;
    const turn = 2 * Math.PI;
    const angle = Math.atan2(v, u);
    const offset = (((angle - segment.start) % turn) + turn) % turn;
    const sweep = segment.end - segment.start;
    return offset <= sweep + 1e-6 || offset >= turn - 1e-6;
}

const onOutline = (point, geometry) =>
    geometry.segments.some((segment) => onSegment(point, segment));

const fmt = ({ x, y }) => `(${x.toFixed(3)}, ${y.toFixed(3)})`;

/* ---------------- the shape registry */

test("SHAPES lists the 19 Structurizr shapes in spec order", () => {
    assert.deepEqual(SHAPES, [
        "Box",
        "RoundedBox",
        "Circle",
        "Ellipse",
        "Hexagon",
        "Diamond",
        "Cylinder",
        "Bucket",
        "Pipe",
        "Person",
        "Robot",
        "Folder",
        "WebBrowser",
        "Window",
        "MobileDevicePortrait",
        "MobileDeviceLandscape",
        "Component",
        "Shell",
        "Terminal",
    ]);
});

test("isShape accepts the 19 names and nothing else", () => {
    for (const shape of SHAPES) assert.ok(isShape(shape), shape);
    for (const name of ["box", "Square", "", "Person "]) {
        assert.equal(isShape(name), false, `${JSON.stringify(name)}`);
    }
});

test("an unknown shape draws as a Box", () => {
    const unknown = shapeGeometry("Hexagonal", 450, 300);
    const box = shapeGeometry("Box", 450, 300);
    assert.deepEqual(unknown, box);
    assert.equal(unknown.shape, "Box");
});

/* ---------------- what every shape promises */

for (const shape of SHAPES) {
    for (const [width, height] of SIZES) {
        const size = `${width}×${height}`;
        const geometry = shapeGeometry(shape, width, height);

        test(`${shape} at ${size} reports its shape and box`, () => {
            assert.equal(geometry.shape, shape);
            assert.equal(geometry.width, width);
            assert.equal(geometry.height, height);
            assert.ok(geometry.parts.length > 0, "nothing to draw");
            for (const part of geometry.parts) {
                assert.match(part.d, /^M /, `part ${part.paint} has no M`);
                assert.doesNotMatch(part.d, /NaN|Infinity/, part.d);
            }
            assert.match(geometry.outline, /^M .* Z$/);
            assert.doesNotMatch(geometry.outline, /NaN|Infinity/);
        });

        test(`${shape} at ${size} has a closed outline inside its box`, () => {
            const { segments } = geometry;
            assert.ok(segments.length >= 2, "too few segments");
            for (const [i, segment] of segments.entries()) {
                const next = segments[(i + 1) % segments.length];
                const end = endOf(segment);
                const start = startOf(next);
                assert.ok(
                    close(end.x, start.x) && close(end.y, start.y),
                    `segment ${i} ends at ${fmt(end)} but ${i + 1} starts at ${fmt(start)}`,
                );
                for (const point of [startOf(segment), end]) {
                    assert.ok(
                        point.x >= -EPSILON &&
                            point.x <= width + EPSILON &&
                            point.y >= -EPSILON &&
                            point.y <= height + EPSILON,
                        `segment ${i} leaves the box at ${fmt(point)}`,
                    );
                }
            }
        });

        test(`${shape} at ${size} has a content area inside its box`, () => {
            const { x, y, width: w, height: h } = geometry.content;
            assert.ok(w > 0 && h > 0, `empty content area ${w}×${h}`);
            assert.ok(x >= 0 && y >= 0, `content starts at ${x}, ${y}`);
            assert.ok(
                x + w <= width + EPSILON && y + h <= height + EPSILON,
                `content ends at ${x + w}, ${y + h}`,
            );
        });

        test(`${shape} at ${size} has a usable span on each side`, () => {
            for (const side of SIDES) {
                const { from, to } = geometry.spans[side];
                const length =
                    side === "top" || side === "bottom" ? width : height;
                assert.ok(from < to, `${side} span ${from}..${to} is empty`);
                assert.ok(
                    from >= 0 && to <= length,
                    `${side} span ${from}..${to} leaves 0..${length}`,
                );
            }
        });

        test(`${shape} at ${size}: rays from the center leave on the outline`, () => {
            const center = { x: width / 2, y: height / 2 };
            for (const [dx, dy] of [
                [1, 0],
                [1, 1],
                [0, 1],
                [-1, 1],
                [-1, 0],
                [-1, -1],
                [0, -1],
                [1, -1],
                [3, -1],
                [-1, 4],
            ]) {
                const toward = {
                    x: center.x + dx * 1000,
                    y: center.y + dy * 1000,
                };
                const exit = intersect(geometry, toward);
                assert.ok(
                    onOutline(exit, geometry),
                    `toward (${dx}, ${dy}) left at ${fmt(exit)}, off the outline`,
                );
                // The exit is on the ray, not merely somewhere on the outline.
                const cross =
                    (exit.x - center.x) * dy - (exit.y - center.y) * dx;
                const dot = (exit.x - center.x) * dx + (exit.y - center.y) * dy;
                assert.ok(
                    Math.abs(cross) < 1e-6 && dot > 0,
                    `toward (${dx}, ${dy}) left at ${fmt(exit)}, off the ray`,
                );
            }
        });

        test(`${shape} at ${size}: an edge end on each span touches the outline`, () => {
            for (const side of SIDES) {
                const { from, to } = geometry.spans[side];
                for (const along of [from, (from + to) / 2, to]) {
                    const point = touch(geometry, side, along);
                    assert.ok(
                        onOutline(point, geometry),
                        `${side} at ${along} touched ${fmt(point)}, off the outline`,
                    );
                    const kept =
                        side === "top" || side === "bottom" ? "x" : "y";
                    assert.ok(
                        close(point[kept], along),
                        `${side} at ${along} moved sideways to ${fmt(point)}`,
                    );
                }
            }
        });
    }
}

test("every shape stays finite in a small box", () => {
    for (const shape of SHAPES) {
        const geometry = shapeGeometry(shape, 60, 60);
        assert.doesNotMatch(
            JSON.stringify(geometry),
            /NaN|null/,
            `${shape} at 60×60 has a non-finite number`,
        );
    }
});

/* ---------------- intersect and touch */

test("intersect toward the center returns the center", () => {
    const geometry = shapeGeometry("Ellipse", 450, 300);
    assert.deepEqual(intersect(geometry, { x: 225, y: 150 }), {
        x: 225,
        y: 150,
    });
});

const EXITS = [
    // [shape, width, height, toward, expected exit]
    ["Box", 450, 300, { x: 900, y: 150 }, { x: 450, y: 150 }],
    ["Box", 450, 300, { x: 225, y: -50 }, { x: 225, y: 0 }],
    ["Diamond", 400, 400, { x: 400, y: 400 }, { x: 300, y: 300 }],
    ["Hexagon", 450, 389, { x: 1000, y: 194.5 }, { x: 450, y: 194.5 }],
    ["Circle", 400, 400, { x: 400, y: 200 }, { x: 400, y: 200 }],
    ["Circle", 450, 300, { x: 225, y: 0 }, { x: 225, y: 0 }],
    ["Cylinder", 450, 300, { x: 225, y: -10 }, { x: 225, y: 0 }],
    ["Bucket", 450, 300, { x: 225, y: 1000 }, { x: 225, y: 294 }],
    ["Pipe", 450, 300, { x: 1000, y: 150 }, { x: 450, y: 150 }],
    // Person: the ray straight up leaves through the top of the head.
    ["Person", 400, 400, { x: 200, y: -100 }, { x: 200, y: 0 }],
    ["Robot", 400, 400, { x: 200, y: -100 }, { x: 200, y: 0 }],
];

for (const [shape, width, height, toward, expected] of EXITS) {
    test(`intersect: ${shape} at ${width}×${height} toward ${fmt(toward)} leaves at ${fmt(expected)}`, () => {
        const exit = intersect(shapeGeometry(shape, width, height), toward);
        assert.ok(
            close(exit.x, expected.x) && close(exit.y, expected.y),
            `left at ${fmt(exit)}`,
        );
    });
}

const TOUCHES = [
    // [shape, width, height, side, along, expected point]
    ["Cylinder", 450, 300, "top", 225, { x: 225, y: 0 }],
    ["Cylinder", 450, 300, "bottom", 225, { x: 225, y: 300 }],
    // Upstream's bucket bottom bulges to 6 short of the box.
    ["Bucket", 450, 300, "bottom", 225, { x: 225, y: 294 }],
    ["Pipe", 450, 300, "left", 150, { x: 0, y: 150 }],
    ["Person", 400, 400, "top", 200, { x: 200, y: 0 }],
    ["Person", 400, 400, "left", 280, { x: 0, y: 280 }],
    ["Robot", 400, 400, "top", 200, { x: 200, y: 0 }],
    // The folder's tab runs from 10 to 160; past it the top is h/8 down.
    ["Folder", 450, 300, "top", 50, { x: 50, y: 0 }],
    ["Folder", 450, 300, "top", 300, { x: 300, y: 37.5 }],
    // The component's blocks stick out left of its main body at w/12.
    ["Component", 450, 300, "left", 150, { x: 37.5, y: 150 }],
    ["Component", 450, 300, "left", 90, { x: 0, y: 90 }],
    ["Hexagon", 450, 300, "left", 150, { x: 0, y: 150 }],
    ["Hexagon", 450, 300, "left", 75, { x: 56.25, y: 75 }],
    ["Diamond", 400, 400, "top", 100, { x: 100, y: 100 }],
];

for (const [shape, width, height, side, along, expected] of TOUCHES) {
    test(`touch: ${shape} at ${width}×${height}, ${side} at ${along} meets ${fmt(expected)}`, () => {
        const point = touch(shapeGeometry(shape, width, height), side, along);
        assert.ok(
            close(point.x, expected.x) && close(point.y, expected.y),
            `touched ${fmt(point)}`,
        );
    });
}

/* ---------------- upstream proportions */

const CONTENT = [
    // [shape, width, height, strokeWidth, expected content area]
    ["Box", 450, 300, 2, { x: 0, y: 0, width: 450, height: 300 }],
    ["Ellipse", 400, 300, 2, { x: 20, y: 0, width: 360, height: 300 }],
    ["Circle", 400, 400, 2, { x: 20, y: 0, width: 360, height: 400 }],
    ["Hexagon", 450, 389, 2, { x: 0, y: 0, width: 450, height: 389 }],
    ["Diamond", 400, 400, 2, { x: 0, y: 0, width: 400, height: 400 }],
    ["Cylinder", 450, 300, 2, { x: 0, y: 30, width: 450, height: 270 }],
    ["Bucket", 400, 300, 2, { x: 20, y: 30, width: 360, height: 270 }],
    ["Pipe", 450, 300, 2, { x: 60, y: 0, width: 360, height: 300 }],
    ["Person", 400, 400, 2, { x: 0, y: 160, width: 400, height: 240 }],
    ["Robot", 400, 400, 2, { x: 0, y: 160, width: 400, height: 240 }],
    ["Folder", 400, 320, 2, { x: 0, y: 40, width: 400, height: 280 }],
    ["Component", 480, 300, 2, { x: 70, y: 0, width: 380, height: 300 }],
    ["WebBrowser", 450, 300, 2, { x: 2, y: 40, width: 446, height: 258 }],
    ["Window", 450, 300, 4, { x: 4, y: 40, width: 442, height: 256 }],
    ["Terminal", 450, 300, 2, { x: 2, y: 40, width: 446, height: 258 }],
    ["Shell", 450, 300, 2, { x: 0, y: 0, width: 450, height: 300 }],
    [
        "MobileDevicePortrait",
        300,
        450,
        2,
        { x: 10, y: 40, width: 280, height: 370 },
    ],
    [
        "MobileDeviceLandscape",
        450,
        300,
        2,
        { x: 40, y: 10, width: 370, height: 280 },
    ],
];

for (const [shape, width, height, strokeWidth, expected] of CONTENT) {
    test(`${shape} at ${width}×${height} puts its label in ${JSON.stringify(expected)}`, () => {
        const { content } = shapeGeometry(shape, width, height, strokeWidth);
        for (const key of ["x", "y", "width", "height"]) {
            assert.ok(
                close(content[key], expected[key]),
                `content.${key} is ${content[key]}, expected ${expected[key]}`,
            );
        }
    });
}

test("shapeSize squares Circle, Diamond, Person and Robot from the width", () => {
    for (const shape of ["Circle", "Diamond", "Person", "Robot"]) {
        assert.deepEqual(shapeSize(shape, 450, 300), {
            width: 450,
            height: 450,
        });
    }
});

test("shapeSize makes a Hexagon regular: floor(w·√3/2) tall", () => {
    assert.deepEqual(shapeSize("Hexagon", 450, 300), {
        width: 450,
        height: 389,
    });
});

test("shapeSize keeps the style's box for every other shape", () => {
    const derived = ["Circle", "Diamond", "Person", "Robot", "Hexagon"];
    for (const shape of SHAPES.filter((s) => !derived.includes(s))) {
        assert.deepEqual(shapeSize(shape, 450, 300), {
            width: 450,
            height: 300,
        });
    }
    assert.deepEqual(shapeSize("NoSuchShape", 450, 300), {
        width: 450,
        height: 300,
    });
});

test("parts carry upstream's paint roles, back to front", () => {
    const PAINTS = {
        Box: ["body"],
        Cylinder: ["body"],
        Person: ["body", "body", "rule"],
        Robot: ["body", "body", "body", "rule"],
        Folder: ["body", "body"],
        Component: ["body", "body", "body"],
        WebBrowser: ["frame", "screen", "screen", "screen"],
        Window: ["frame", "screen", "screen"],
        Terminal: ["frame", "screen", "ink", "screen"],
        Shell: ["body", "ink"],
        MobileDevicePortrait: ["frame", "screen", "screen", "grille"],
        MobileDeviceLandscape: ["frame", "screen", "screen", "grille"],
    };
    for (const [shape, paints] of Object.entries(PAINTS)) {
        assert.deepEqual(
            shapeGeometry(shape, 450, 300).parts.map((part) => part.paint),
            paints,
            shape,
        );
    }
});

test("the cylinder's body path keeps upstream's inner lid arc", () => {
    const { parts } = shapeGeometry("Cylinder", 450, 300);
    assert.equal(
        parts[0].d,
        "M 0 30 A 225 30 0 0 0 450 30 A 225 30 0 0 0 0 30 L 0 270 A 225 30 0 0 0 450 270 L 450 30",
    );
});

test("the strokeWidth insets a WebBrowser's panel, as upstream does", () => {
    const thin = shapeGeometry("WebBrowser", 450, 300, 1);
    const thick = shapeGeometry("WebBrowser", 450, 300, 6);
    assert.notEqual(thin.parts[1].d, thick.parts[1].d);
    assert.equal(thin.outline, thick.outline, "the frame should not move");
});

test("geometry is plain JSON", () => {
    for (const shape of SHAPES) {
        const geometry = shapeGeometry(shape, 450, 300);
        assert.deepEqual(JSON.parse(JSON.stringify(geometry)), geometry, shape);
    }
});

/* ---------------- the acceptance harness's outlines */

/**
 * The acceptance set draws only some of the 19 shapes with edges, so the
 * harness's outline check (`edgeEndsOnOutlines`) meets the others only here:
 * every edge end `intersect` and `touch` work out, all round every shape,
 * lies on the outline the harness works out for it on its own.
 */
for (const shape of SHAPES) {
    test(`every edge end on a ${shape} lies on the harness's outline for it`, () => {
        for (const [styleWidth, styleHeight] of [
            ...SIZES,
            [200, 120],
            [60, 60],
            [100, 40],
        ]) {
            const { width, height } = shapeSize(shape, styleWidth, styleHeight);
            const geometry = shapeGeometry(shape, width, height);
            const outline = elementOutline({
                shape,
                x: 0,
                y: 0,
                width,
                height,
            });
            const ends = [];
            for (let degrees = 0; degrees < 360; degrees += 5) {
                const angle = (degrees * Math.PI) / 180;
                ends.push(
                    intersect(geometry, {
                        x: width / 2 + 1000 * Math.cos(angle),
                        y: height / 2 + 1000 * Math.sin(angle),
                    }),
                );
            }
            for (const side of SIDES) {
                const { from, to } = geometry.spans[side];
                for (let i = 0; i <= 20; i++) {
                    ends.push(
                        touch(geometry, side, from + ((to - from) * i) / 20),
                    );
                }
            }
            for (const end of ends) {
                const distance = distanceToOutline(end, outline);
                assert.ok(
                    distance <= OUTLINE_TOLERANCE,
                    `at ${width}×${height}, ${fmt(end)} is ${distance} off the harness's outline`,
                );
            }
        }
    });
}
