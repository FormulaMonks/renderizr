import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fixture } from "./__fixtures__/helpers.js";
import {
    decompressWoff2,
    hheaMetrics,
    isVariable,
    pinWeight,
} from "./fonts.js";

// Arimo (Apache 2.0) cut down to a few glyphs: as Google Fonts serves it,
// and pinned at 400.
const VARIABLE = await readFile(fixture("fonts/arimo-variable.woff2"));
const STATIC = await readFile(fixture("fonts/arimo-static-400.woff2"));

test("a woff2 decompresses to a TrueType font", async () => {
    const ttf = await decompressWoff2(VARIABLE);
    assert.equal(ttf.readUInt32BE(0), 0x00010000);
});

test("a face with a wght axis is variable and a static one is not", async () => {
    assert.equal(isVariable(await decompressWoff2(VARIABLE)), true);
    assert.equal(isVariable(await decompressWoff2(STATIC)), false);
});

test("bytes that hold no font are refused", () => {
    assert.throws(() => isVariable(Buffer.from("wOF2 not a ttf")), /not a/);
});

test("hhea gives the ascent and descent unrounded, as multiples of the font size", async () => {
    // Arimo's hhea: 1854 and -434 on 2048 units per em.
    assert.deepEqual(hheaMetrics(await decompressWoff2(VARIABLE)), {
        ascent: 1854 / 2048,
        descent: 434 / 2048,
    });
});

test("pinning wght gives a static face with the same metrics", async () => {
    const variable = await decompressWoff2(VARIABLE);
    for (const weight of [400, 700]) {
        const pinned = await pinWeight(variable, weight);
        assert.equal(isVariable(pinned), false, `${weight} is still variable`);
        assert.deepEqual(hheaMetrics(pinned), hheaMetrics(variable));
    }
    assert.notDeepEqual(
        await pinWeight(variable, 400),
        await pinWeight(variable, 700),
        "400 and 700 drew the same face",
    );
});
