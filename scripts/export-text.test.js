import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { fontkitMeasure } from "./export-text.js";
import { decompressWoff2, pinWeight } from "./fonts.js";

const FIXTURES = fileURLToPath(
    new URL("./__fixtures__/fonts/", import.meta.url),
);
const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-export-text-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

const LINE = "Send reminder to every customer";
const SIZE = 23.75;

/** Arimo's variable woff2 as `loadFont` gives it: pinned at 400 and 700. */
async function variableFaces() {
    const woff2 = await readFile(join(FIXTURES, "arimo-variable.woff2"));
    const ttf = await decompressWoff2(woff2);
    const faces = [];
    for (const weight of [400, 700]) {
        const file = join(SCRATCH, `arimo-${weight}.ttf`);
        await writeFile(file, await pinWeight(ttf, weight));
        faces.push({ file, subset: "latin", style: "normal", weight, woff2 });
    }
    return { ttf, faces };
}

test("a variable face measures at its weight in its woff2, as Chrome sets it, not in the pinned TTF", async () => {
    const fontkit = await import("fontkit");
    const { ttf, faces } = await variableFaces();
    const variable = fontkit.create(Buffer.from(ttf));
    const width = (font) =>
        (font.layout(LINE).advanceWidth / font.unitsPerEm) * SIZE;

    const measure = await fontkitMeasure(faces);
    assert.equal(
        measure(LINE, SIZE, true),
        width(variable.getVariation({ wght: 700 })),
    );
    assert.equal(
        measure(LINE, SIZE, false),
        width(variable.getVariation({ wght: 400 })),
    );

    // Without the woff2, the pinned TTF measures, its advances rounded to
    // whole font units.
    const pinned = await fontkitMeasure(
        faces.map(({ woff2, ...face }) => face),
    );
    assert.equal(
        pinned(LINE, SIZE, true),
        width(fontkit.openSync(faces[1].file)),
    );
});
