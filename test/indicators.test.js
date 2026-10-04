/**
 * `src/engine/geometry/indicators.ts` and the room each label template
 * keeps for its indicators (spec 9.2, 10.9): one 20-unit glyph per target
 * kind, in an element's label, at the right end of a boundary's label band,
 * and after an edge label's text.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    INDICATOR_GAP,
    INDICATOR_MARGIN,
    INDICATOR_SIZE,
    indicatorKinds,
    indicatorRowWidth,
} = await importSrc("engine/geometry/indicators");
const { fitLabel, INDICATOR_ROW_HEIGHT } = await importSrc(
    "engine/geometry/label",
);
const { BAND_GAP, BAND_MARGIN, deriveBoundaries } = await importSrc(
    "engine/geometry/boundary",
);
const { EDGE_LABEL_PADDING, layoutEdgeLabel } = await importSrc(
    "engine/geometry/edge-label",
);

/** Every glyph half as wide as the font is tall, bold ones 0.6. */
const measure = (text, fontSize, bold) =>
    text.length * fontSize * (bold ? 0.6 : 0.5);

/* ------------------------------------------------------------ the row */

test("a glyph is 20 units, one per target kind, in the order the kinds first appear", () => {
    assert.equal(INDICATOR_SIZE, 20);
    assert.deepEqual(indicatorKinds(["link", "view", "view", "link"]), [
        "link",
        "view",
    ]);
    assert.equal(indicatorRowWidth(0), 0);
    assert.equal(indicatorRowWidth(1), 20);
    assert.equal(indicatorRowWidth(3), 3 * 20 + 2 * INDICATOR_GAP);
});

/* ------------------------------------------------------------ elements */

test("an element's indicators are a fixed part of its label: the description gives up the room", () => {
    const base = {
        height: 300,
        fontSize: 24,
        iconPosition: "Bottom",
        name: 40,
        metadata: 20,
        description: true,
    };
    // 300 - 40 - 8 - 20 - 15 = 217 holds 7 lines of 28.8; the row, its
    // margin and its inset take 50 of it, and 167 holds 5.
    assert.equal(fitLabel(base).descriptionLines, 7);
    assert.equal(fitLabel({ ...base, indicators: true }).descriptionLines, 5);
});

test("an element's indicator row keeps an inset from the bottom of its content area", () => {
    // 40 + 8 + 20 + 15 above the description, and below it the row's 20,
    // its margin's 10 and the inset's 20: one line of 28.8 fits exactly.
    const label = {
        height: 40 + 8 + 20 + 15 + 28.8 + 20 + 10 + 20,
        fontSize: 24,
        iconPosition: "Bottom",
        name: 40,
        metadata: 20,
        description: true,
    };

    assert.equal(INDICATOR_ROW_HEIGHT, INDICATOR_SIZE + INDICATOR_MARGIN + 20);
    assert.equal(fitLabel({ ...label, indicators: true }).descriptionLines, 1);
    assert.equal(
        fitLabel({ ...label, height: label.height - 1, indicators: true })
            .descriptionLines,
        0,
    );
});

test("an icon that only fits without the indicators is dropped", () => {
    const tight = {
        height: 40 + 75 + 10,
        fontSize: 24,
        iconPosition: "Bottom",
        name: 40,
        description: false,
        withIcon: { name: 40 },
    };

    assert.equal(fitLabel(tight).icon, true);
    assert.equal(fitLabel({ ...tight, indicators: true }).icon, false);
});

/* ---------------------------------------------------------- boundaries */

const derive = (label) =>
    deriveBoundaries(
        [{ id: "b", children: ["a"], label }],
        new Map([["a", { x: 0, y: 0, width: 400, height: 100 }]]),
        measure,
    )[0];

test("a boundary's indicators sit at the right end of its label band, bottom-aligned with the text", () => {
    const boundary = derive({
        name: "Shop",
        metadata: "",
        fontSize: 24,
        icon: false,
        indicators: 2,
    });
    const row = indicatorRowWidth(2);

    assert.deepEqual(boundary.indicators, {
        x: boundary.width - BAND_MARGIN - row,
        y: boundary.name.y + boundary.name.height - INDICATOR_SIZE,
        width: row,
        height: INDICATOR_SIZE,
    });
});

test("a boundary's indicators sit left of its instance count, and its name wraps short of both", () => {
    const name = "Kubernetes cluster for the whole shop";
    const plain = derive({
        name,
        metadata: "",
        fontSize: 24,
        icon: false,
        instances: "x3",
    });
    const boundary = derive({
        name,
        metadata: "",
        fontSize: 24,
        icon: false,
        instances: "x3",
        indicators: 1,
    });

    assert.equal(
        boundary.indicators.x + boundary.indicators.width + BAND_GAP,
        boundary.instances.x,
    );
    assert.equal(
        boundary.name.width,
        plain.name.width - INDICATOR_SIZE - BAND_GAP,
        "the text column gives up the row and its gap",
    );
});

test("a boundary without targets keeps its band as it was", () => {
    const boundary = derive({
        name: "Shop",
        metadata: "",
        fontSize: 24,
        icon: false,
    });

    assert.equal(boundary.indicators, undefined);
});

/* --------------------------------------------------------------- edges */

test("an edge label's glyphs follow its text inside the backing", () => {
    const label = layoutEdgeLabel(
        { description: "Reads", technology: "" },
        20,
        200,
        measure,
        2,
    );
    const text = measure("Reads", 20, false);
    const row = indicatorRowWidth(2);

    assert.deepEqual(label.indicators, {
        x: EDGE_LABEL_PADDING + text + INDICATOR_GAP,
        y: (label.size.height - INDICATOR_SIZE) / 2,
        width: row,
        height: INDICATOR_SIZE,
    });
    assert.equal(
        label.size.width,
        text + INDICATOR_GAP + row + 2 * EDGE_LABEL_PADDING,
    );
});

test("an edge label wraps short of its glyphs", () => {
    // "Reads from" is 100 wide at 20; with the glyph beside it, 90 is not.
    const label = layoutEdgeLabel(
        { description: "Reads from", technology: "" },
        20,
        100 + INDICATOR_SIZE + INDICATOR_GAP - 10,
        measure,
        1,
    );

    assert.deepEqual(label.description, ["Reads", "from"]);
});

test("an edge with targets and nothing to say gets a label holding only its glyphs", () => {
    const label = layoutEdgeLabel(
        { description: "", technology: "" },
        20,
        200,
        measure,
        1,
    );

    assert.deepEqual(label.description, []);
    assert.deepEqual(label.technology, []);
    assert.deepEqual(label.size, {
        width: INDICATOR_SIZE + 2 * EDGE_LABEL_PADDING,
        height: INDICATOR_SIZE + 2 * EDGE_LABEL_PADDING,
    });
    assert.deepEqual(label.indicators, {
        x: EDGE_LABEL_PADDING,
        y: EDGE_LABEL_PADDING,
        width: INDICATOR_SIZE,
        height: INDICATOR_SIZE,
    });
    assert.equal(
        layoutEdgeLabel({ description: "", technology: "" }, 20, 200, measure),
        undefined,
        "without targets it still has no label",
    );
});
