/**
 * `test/support/large-landscape.js`: the large fixture of spec 15.3, item 4.
 * A system landscape view with 300 elements, 600 relationships and 20
 * groups, once laid out automatically and once with a stored layout, written
 * the same way on every run and committed as
 * `test/__fixtures__/large-landscape.json`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectedDrawing } from "./support/engine-checks.js";
import { peopleAndSoftwareSystems } from "./support/fixtures.js";
import {
    AUTOMATIC_VIEW,
    LARGE_LANDSCAPE_FIXTURE,
    largeLandscape,
    STORED_VIEW,
} from "./support/large-landscape.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");

const workspace = largeLandscape();
const model = new WorkspaceModel(workspace);

for (const key of [AUTOMATIC_VIEW, STORED_VIEW]) {
    test(`view ${key} draws 300 elements, 600 relationships and 20 groups`, () => {
        const expected = expectedDrawing(model, key);

        assert.equal(expected.elements.length, 300);
        assert.equal(expected.edges.length, 600);
        assert.equal(
            expected.boundaries.filter((id) => id.startsWith("group:")).length,
            20,
        );
        assert.equal(
            expected.boundaries.length,
            20,
            "only groups are boundaries",
        );
    });
}

test("the automatic-layout view is laid out automatically", () => {
    assert.equal(expectedDrawing(model, AUTOMATIC_VIEW).layout, "automatic");
});

test("the stored-layout view keeps every element where the workspace puts it", () => {
    const expected = expectedDrawing(model, STORED_VIEW);

    assert.equal(expected.layout, "stored");
    assert.ok(
        expected.elements.every((element) => element.placed),
        "an element is unplaced",
    );
});

test("no relationship joins an element to itself or repeats another", () => {
    const pairs = new Set();
    for (const element of peopleAndSoftwareSystems(workspace)) {
        for (const relationship of element.relationships ?? []) {
            assert.notEqual(relationship.destinationId, element.id);
            const pair = `${element.id}->${relationship.destinationId}`;
            assert.ok(!pairs.has(pair), `${pair} is there twice`);
            pairs.add(pair);
        }
    }
    assert.equal(pairs.size, 600);
});

test("the generator writes the same workspace on every run", () => {
    assert.deepEqual(largeLandscape(), workspace);
});

test("the committed fixture is what the generator writes", () => {
    const committed = JSON.parse(
        readFileSync(LARGE_LANDSCAPE_FIXTURE, "utf-8"),
    );

    assert.deepEqual(
        committed,
        workspace,
        "run pnpm fixtures:large to write it again",
    );
});
