/**
 * The author's warning of sibling slug collisions (spec 316, ADR 30), from
 * `src/components/slug-collisions.ts`: `pnpm dev` and edit mode say in a
 * toast when two siblings that reach a documentation scope slug the same,
 * once for each workspace that does.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { createSlugCollisionWarner } = await importSrc(
    "components/slug-collisions",
);

const documented = {
    sections: [
        {
            id: "1",
            title: "A",
            content: "# A",
            filename: "a.md",
            format: "Markdown",
            order: 1,
        },
    ],
};

/** A workspace whose software systems are named `names`, each documented. */
const workspace = (...names) => ({
    name: "W",
    model: {
        softwareSystems: names.map((name, index) => ({
            id: String(index + 1),
            name,
            documentation: documented,
        })),
    },
});

/** A warner that records what it tells the author. */
const recording = () => {
    const told = [];
    return { told, warn: createSlugCollisionWarner((text) => told.push(text)) };
};

test("two documented siblings that slug the same warn the author, naming both and the addresses they take", () => {
    const { told, warn } = recording();
    warn(workspace("Orders", "orders!"));
    assert.equal(told.length, 1);
    assert.match(told[0], /"Orders", "orders!"/);
    assert.match(told[0], /orders, orders-2/);
});

test("the slug collision fixture warns of API and Api", () => {
    const { told, warn } = recording();
    warn(
        JSON.parse(
            readFileSync(
                new URL("./__fixtures__/slug-collision.json", import.meta.url),
                "utf-8",
            ),
        ),
    );
    assert.equal(told.length, 1);
    assert.match(told[0], /"API", "Api"/);
    assert.match(told[0], /orders\/api, orders\/api-2/);
});

test("a workspace whose slugs never collide warns of nothing", () => {
    const { told, warn } = recording();
    warn(workspace("Orders", "Payments"));
    warn({});
    assert.deepEqual(told, []);
});

test("the same collisions warn once, and new ones warn again", () => {
    const { told, warn } = recording();
    warn(workspace("Orders", "orders!"));
    warn(workspace("Orders", "orders!"));
    assert.equal(told.length, 1);
    warn(workspace("Payments", "PAYMENTS"));
    assert.equal(told.length, 2);
    // A workspace without them, then the first again, warns again.
    warn(workspace("Orders"));
    warn(workspace("Orders", "orders!"));
    assert.equal(told.length, 3);
});
