/**
 * The Node floor the bin checks before it loads the build (ADR 27): which
 * versions Renderizr runs on, and the one line it prints on any other.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { meetsNodeFloor, nodeRefusal } from "./node-version.js";

test("a Node below 22.13 is refused", () => {
    for (const version of ["20.19.0", "21.7.3", "22.12.0"]) {
        assert.equal(
            meetsNodeFloor(version),
            false,
            `Node ${version} got through`,
        );
    }
});

test("Node 22.13 and anything newer is accepted", () => {
    for (const version of [
        "22.13.0",
        "22.13.1",
        "22.14.0",
        "23.0.0",
        "24.0.0",
        "26.0.0",
    ]) {
        assert.equal(
            meetsNodeFloor(version),
            true,
            `Node ${version} was refused`,
        );
    }
});

test("versions compare as numbers, not text", () => {
    // "9" sorts after "13" as text.
    assert.equal(
        meetsNodeFloor("22.9.0"),
        false,
        "22.9 got through, so the minor compared as text",
    );
});

test("the refusal names the floor and the Node that ran", () => {
    const message = nodeRefusal("v20.19.0");

    assert.match(message, /Node 22\.13 or newer/, "the floor is missing");
    assert.match(message, /v20\.19\.0/, "the Node that ran is missing");
    assert.equal(
        message.split("\n").filter(Boolean).length,
        1,
        "the refusal is more than one line",
    );
});
