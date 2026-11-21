import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { PNG } from "pngjs";
import { fixture, withTempDir } from "./__fixtures__/helpers.js";
import { pinnedFamilies, rasterize } from "./export-raster.js";
import { decompressWoff2 } from "./fonts.js";

/** Arimo cut down to "AHg ", as a static TTF in `dir`. */
async function arimo(dir) {
    const file = join(dir, "arimo.ttf");
    await writeFile(
        file,
        await decompressWoff2(
            await readFile(fixture("fonts/arimo-static-400.woff2")),
        ),
    );
    return file;
}

const svgOf = (family, text) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" font-family="${family}"><rect width="120" height="40" fill="#ffffff"/><text x="4" y="30" font-size="24">${text}</text></svg>`;

/** How many pixels of `png` are not white. */
const inked = (png) => {
    const { data } = PNG.sync.read(png);
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
        if (data[index] < 250) count++;
    }
    return count;
};

const SIZE = { width: 120, height: 40 };

test("pinning sets every font-family the SVG names to the run's family, and leaves the @font-face rules", () => {
    const svg =
        '<svg font-family="Helvetica, Arial, sans-serif"><style>@font-face { font-family: \'Inter\'; }</style><text font-family="Georgia, Helvetica">a</text></svg>';
    assert.equal(
        pinnedFamilies(svg, "Arimo"),
        '<svg font-family="&quot;Arimo&quot;"><style>@font-face { font-family: \'Inter\'; }</style><text font-family="&quot;Arimo&quot;">a</text></svg>',
    );
});

test("a glyph the faces lack stays blank, unless the raster may draw it from a system font", async () => {
    await withTempDir(async (dir) => {
        const files = [await arimo(dir)];
        // The cut-down Arimo has no "x"; every system font does.
        const svg = svgOf("Helvetica, Arial, sans-serif", "xxx");
        const options = { family: "Arimo", files };
        assert.equal(inked(await rasterize(svg, SIZE, options)), 0);
        assert.ok(
            inked(
                await rasterize(svg, SIZE, { ...options, systemFonts: true }),
            ) > 0,
            "the missing glyphs did not draw from a system font",
        );
    });
});

test("with system fonts, the fallback stack still draws in the run's family, never an installed Helvetica or Arial", async () => {
    await withTempDir(async (dir) => {
        const files = [await arimo(dir)];
        const options = { family: "Arimo", files };
        for (const family of [
            "Helvetica, Arial, sans-serif",
            "Arial, sans-serif",
            "Georgia, Helvetica, Arial, sans-serif",
        ]) {
            const svg = svgOf(family, "AHg");
            assert.deepEqual(
                await rasterize(svg, SIZE, { ...options, systemFonts: true }),
                await rasterize(svg, SIZE, options),
                `${family} drew in a system font`,
            );
        }
    });
});
