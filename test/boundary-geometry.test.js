/**
 * `src/engine/geometry/boundary.ts`: each boundary's box derived from its
 * children, deepest first, and its label band wrapped to the box's width
 * (spec 8, ADR 9). Text is measured by a stand-in for canvas `measureText`
 * whose widths are easy to work out by hand.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    BAND_GAP,
    BAND_MARGIN,
    BOUNDARY_PADDING,
    deriveBoundaries,
    elementInstanceCount,
    instanceCountText,
    wrapLines,
} = await importSrc("engine/geometry/boundary");
const { LINE_HEIGHT, METADATA_SCALE, NAME_GAP, NAME_SCALE } = await importSrc(
    "engine/geometry/label",
);

/** Every character is half its font size wide, bold ones 0.6. */
const measure = (text, fontSize, bold) =>
    text.length * fontSize * (bold ? 0.6 : 0.5);

/** Equal to within floating-point noise. */
const near = (actual, expected, message) =>
    assert.ok(
        Math.abs(actual - expected) < 1e-9,
        `${message ?? "values differ"}: ${actual} is not ${expected}`,
    );

const box = (x, y, width, height) => ({ x, y, width, height });

const label = (overrides = {}) => ({
    name: "Shop",
    metadata: "",
    fontSize: 24,
    icon: false,
    ...overrides,
});

const NAME_LINE = 24 * NAME_SCALE * LINE_HEIGHT;
const METADATA_LINE = 24 * METADATA_SCALE * LINE_HEIGHT;

const derive = (boundaries, elements) =>
    new Map(
        deriveBoundaries(
            boundaries,
            new Map(Object.entries(elements)),
            measure,
        ).map((boundary) => [boundary.id, boundary]),
    );

/* -------------------------------------------------------------- the box */

test("a boundary is its children's bounding box plus 50 padding and a label band at the bottom", () => {
    const shop = derive([{ id: "s", children: ["a", "b"], label: label() }], {
        a: box(0, 0, 100, 100),
        b: box(200, 300, 100, 100),
    }).get("s");

    const band = NAME_LINE + BAND_MARGIN;
    assert.equal(BOUNDARY_PADDING, 50);
    assert.deepEqual(
        { x: shop.x, y: shop.y, width: shop.width },
        { x: -50, y: -50, width: 400 },
    );
    assert.equal(shop.height, 400 + 100 + band);
    assert.deepEqual(shop.band, box(0, 500, 400, band));
    assert.deepEqual(shop.children, ["a", "b"]);
});

test("boundaries are derived deepest first, an outer one around the inner one's box", () => {
    const boxes = derive(
        [
            {
                id: "outer",
                children: ["inner", "b"],
                label: label({ name: "Outer" }),
            },
            { id: "inner", children: ["a"], label: label({ name: "In" }) },
        ],
        { a: box(0, 0, 100, 100), b: box(400, 0, 100, 100) },
    );
    const inner = boxes.get("inner");
    const outer = boxes.get("outer");

    assert.equal(outer.x, inner.x - 50);
    assert.equal(outer.y, inner.y - 50);
    assert.equal(outer.height, inner.height + 100 + outer.band.height);
});

test("a boundary with none of its children drawn is left out", () => {
    const boxes = derive([{ id: "s", children: ["gone"], label: label() }], {});
    assert.equal(boxes.size, 0);
});

/* ------------------------------------------------------------- the band */

test("the label wraps to the boundary's width and the band grows downward", () => {
    const child = box(0, 0, 200, 100);
    const short = derive([{ id: "s", children: ["a"], label: label() }], {
        a: child,
    }).get("s");
    const long = derive(
        [
            {
                id: "s",
                children: ["a"],
                label: label({ name: "Internet Banking System Of Record" }),
            },
        ],
        { a: child },
    ).get("s");

    assert.equal(long.width, short.width, "the label never widens the box");
    assert.ok(long.name.lines.length > 1, "the name wraps");
    assert.equal(
        long.band.height - short.band.height,
        (long.name.lines.length - 1) * NAME_LINE,
    );
    assert.equal(long.y, short.y, "the band grows downward only");
    for (const line of long.name.lines) {
        assert.ok(measure(line, 24 * NAME_SCALE, true) <= long.name.width);
    }
});

test("the name is bold at 1.4× and the metadata 0.7× under it, from the band's left", () => {
    const shop = derive(
        [
            {
                id: "s",
                children: ["a"],
                label: label({ metadata: "[Software System]" }),
            },
        ],
        { a: box(0, 0, 600, 100) },
    ).get("s");

    assert.equal(shop.name.fontSize, 24 * NAME_SCALE);
    assert.equal(shop.metadata.fontSize, 24 * METADATA_SCALE);
    assert.equal(shop.name.x, BAND_MARGIN);
    near(shop.name.y, shop.band.y, "the name starts the band");
    near(shop.metadata.y, shop.band.y + NAME_LINE + NAME_GAP, "metadata");
    assert.deepEqual(shop.metadata.lines, ["[Software System]"]);
    near(
        shop.band.height,
        NAME_LINE + NAME_GAP + METADATA_LINE + BAND_MARGIN,
        "band height",
    );
});

test("an icon sits to the left of the label and the text starts after it", () => {
    const shop = derive(
        [{ id: "s", children: ["a"], label: label({ icon: true }) }],
        { a: box(0, 0, 600, 100) },
    ).get("s");

    assert.equal(shop.iconBox.x, BAND_MARGIN);
    assert.equal(shop.iconBox.width, shop.iconBox.height);
    assert.equal(shop.name.x, BAND_MARGIN + shop.iconBox.width + BAND_GAP);
    assert.equal(
        shop.iconBox.y + shop.iconBox.height,
        shop.band.y + shop.band.height - BAND_MARGIN,
        "bottom-aligned with the text",
    );
});

test("names break on a newline and on the literal \\n", () => {
    assert.deepEqual(wrapLines("One\\nTwo\nThree", 1000, 10, true, measure), [
        "One",
        "Two",
        "Three",
    ]);
    assert.deepEqual(wrapLines("aaa bbb ccc", 40, 10, false, measure), [
        "aaa bbb",
        "ccc",
    ]);
});

/* ------------------------------------------------------- instance counts */

test("a deployment node's instance count is written as is, bottom-right, at twice the name size", () => {
    const cases = [
        { instances: "4", text: "x4" },
        { instances: "0..N", text: "x0..N" },
        { instances: 3, text: "x3" },
        { instances: "1", text: undefined },
        { instances: undefined, text: undefined },
    ];
    for (const { instances, text } of cases) {
        assert.equal(instanceCountText(instances), text, String(instances));
    }

    const node = derive(
        [{ id: "n", children: ["a"], label: label({ instances: "x4" }) }],
        { a: box(0, 0, 600, 100) },
    ).get("n");
    const size = 24 * NAME_SCALE * 2;
    assert.equal(node.instances.fontSize, size);
    assert.deepEqual(node.instances.lines, ["x4"]);
    assert.equal(
        node.instances.x + node.instances.width,
        node.width - BAND_MARGIN,
    );
    assert.equal(
        node.instances.y + size * LINE_HEIGHT,
        node.band.y + node.band.height - BAND_MARGIN,
    );
});

test("the label wraps short of the instance count", () => {
    const node = derive(
        [{ id: "n", children: ["a"], label: label({ instances: "x16" }) }],
        { a: box(0, 0, 600, 100) },
    ).get("n");

    assert.equal(
        node.name.x + node.name.width + BAND_GAP,
        node.instances.x,
        "the name's width stops before the count",
    );
});

test("a boundary is widened to the minimum its label needs", () => {
    // One unbreakable word, wider than the 200 the child gives.
    const name = "Supercalifragilistic";
    const shop = derive(
        [{ id: "s", children: ["a"], label: label({ name, icon: true }) }],
        { a: box(0, 0, 100, 100) },
    ).get("s");

    const word = measure(name, 24 * NAME_SCALE, true);
    assert.equal(
        shop.width,
        BAND_MARGIN * 2 + shop.iconBox.width + BAND_GAP + word,
    );
    assert.deepEqual(shop.name.lines, [name]);
});

test("a deployment node drawn as an element keeps its count bottom-right inside its box, and its label clear of it", () => {
    const content = box(0, 0, 450, 300);
    const count = elementInstanceCount(content, 24, "x4", measure);
    const size = 24 * NAME_SCALE * 2;

    assert.equal(count.fontSize, size);
    assert.equal(count.x + count.width, 450 - BAND_MARGIN);
    assert.equal(count.y + size * LINE_HEIGHT, 300 - BAND_MARGIN);
    assert.deepEqual(
        count.content,
        box(0, 0, 450, count.y),
        "the label's content area stops above the count",
    );
});
