/**
 * How `renderizr export` sets text in Node, where the page has a canvas
 * (ADR 32): a `MeasureText` backed by fontkit on the woff2 faces the SVG
 * embeds, and the ascent and descent from the face's `hhea` table,
 * unrounded. The static faces `loadFont` pins from them draw the PNG.
 *
 * fontkit loads on the first call, so the build and edit mode, which
 * import nothing from here, never pay for it.
 */

import { decompressWoff2 } from "./fonts.js";

/** The weight CSS draws `bold` text at. */
const BOLD = 700;
const REGULAR = 400;

/**
 * The face of `faces` (opened fontkit fonts, each with its `weight` and
 * `subset`) nearest `weight` that has a glyph for every character of
 * `text`, else the nearest one: a run with several subsets measures each
 * label in the subset that holds it.
 */
function faceFor(faces, text, weight) {
    const distance = (face) => Math.abs(face.weight - weight);
    const nearest = Math.min(...faces.map(distance));
    const candidates = faces.filter((face) => distance(face) === nearest);
    const points = [...text].map((character) => character.codePointAt(0));
    return (
        candidates.find(({ font }) =>
            points.every((point) => font.hasGlyphForCodePoint(point)),
        ) ?? candidates[0]
    );
}

/**
 * A `MeasureText` over `faces`, the `[{ file, subset, style, weight,
 * woff2 }]` that `loadFont` gives: the advance width of a line in the
 * upright face nearest the weight it is drawn at, kerning and ligatures
 * applied, as the browser lays it out. Each face measures in the `woff2`
 * the page draws with, when it has one: a variable face set at its weight
 * keeps the fractional advances Chrome reads from `HVAR`, which the
 * pinned TTF rounds to whole font units (0.02 px apart on a bold Inter
 * line, enough to round a Mermaid node a pixel wider). A family a
 * Mermaid node names (`ahead`) is the reader's system font, which the CLI
 * does not load: the text measures in the run's font.
 */
export async function fontkitMeasure(faces) {
    const fontkit = await import("fontkit");
    const upright = faces.filter((face) => face.style !== "italic");
    const decompressed = new Map();
    const open = async ({ file, woff2, weight }) => {
        if (!woff2) return fontkit.openSync(file);
        if (!decompressed.has(woff2))
            decompressed.set(
                woff2,
                fontkit.create(Buffer.from(await decompressWoff2(woff2))),
            );
        const font = decompressed.get(woff2);
        return font.variationAxes.wght
            ? font.getVariation({ wght: weight })
            : font;
    };
    const opened = [];
    for (const face of upright.length ? upright : faces)
        opened.push({ ...face, font: await open(face) });
    if (!opened.length) throw new Error("The font has no faces to measure");
    return (text, fontSize, bold) => {
        const { font } = faceFor(opened, text, bold ? BOLD : REGULAR);
        return (font.layout(text).advanceWidth / font.unitsPerEm) * fontSize;
    };
}

/**
 * How the export sets its text in `loaded`, the font `loadFont` gave,
 * as `exportView` takes it (`ExportText`). `embed` says whether the SVG
 * names and embeds the family: a font the run or the workspace sets does,
 * and Arimo standing in for the fallback stack doesn't.
 */
export async function exportText(loaded, { embed }) {
    return {
        measure: await fontkitMeasure(loaded.faces),
        ascent: loaded.metrics.ascent,
        descent: loaded.metrics.descent,
        font: embed ? loaded.family : null,
        // `loadFont`'s CSS ends with the page's font variable, which an
        // export has no use for.
        fontFaces: embed ? loaded.css.replace(/:root\{[^}]*\}$/, "") : "",
    };
}
