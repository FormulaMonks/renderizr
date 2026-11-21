import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { fixture, withTempDir } from "./__fixtures__/helpers.js";
import { fontkitMeasure, glyphCoverage } from "./export-text.js";
import { decompressWoff2 } from "./fonts.js";

/** The woff2 at `path` as a static TTF in `dir`, as `loadFont` gives a face. */
async function face(dir, path, subset) {
    const file = join(dir, `${subset}.ttf`);
    await writeFile(file, await decompressWoff2(await readFile(path)));
    return { file, subset, style: "normal", weight: 400 };
}

// Arimo cut down to "AHg ", with a missing glyph 1536 units wide on 2048.
const ARIMO = fixture("fonts/arimo-static-400.woff2");
// Icons in the private use area, and no Latin letters.
const ICONS = createRequire(import.meta.url).resolve(
    "bootstrap-icons/font/fonts/bootstrap-icons.woff2",
);
const ICON = "\uf101";

test("the coverage lists each character no face has a glyph for, once, in order", async () => {
    await withTempDir(async (dir) => {
        const lacks = await glyphCoverage([await face(dir, ARIMO, "latin")]);
        assert.deepEqual(lacks("gAH g"), []);
        // Line breaks between labels are no characters to draw.
        assert.deepEqual(lacks("A\nH"), []);
        assert.deepEqual(lacks("Hi 日本 Hi日"), ["i", "日", "本"]);
    });
});

test("a character one face lacks and another has is covered", async () => {
    await withTempDir(async (dir) => {
        const lacks = await glyphCoverage([
            await face(dir, ARIMO, "latin"),
            await face(dir, ICONS, "icons"),
        ]);
        assert.deepEqual(lacks(`A${ICON}`), []);
    });
});

test("a missing glyph measures as the font's missing glyph", async () => {
    await withTempDir(async (dir) => {
        const measure = await fontkitMeasure([await face(dir, ARIMO, "latin")]);
        assert.equal(measure("日", 16, false), (1536 / 2048) * 16);
        assert.equal(
            measure("A日", 16, false),
            measure("A", 16, false) + measure("日", 16, false),
        );
    });
});

test("a label no face holds whole measures each character in a face that has it", async () => {
    await withTempDir(async (dir) => {
        const latin = await face(dir, ARIMO, "latin");
        const icons = await face(dir, ICONS, "icons");
        const both = await fontkitMeasure([latin, icons]);
        const arimo = await fontkitMeasure([latin]);
        const iconsOnly = await fontkitMeasure([icons]);
        assert.equal(
            both(`AH${ICON}`, 16, false),
            arimo("AH", 16, false) + iconsOnly(ICON, 16, false),
        );
    });
});
