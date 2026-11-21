/**
 * How `renderizr export` sets text in Node, where the page has a canvas
 * (ADR 32): a `MeasureText` backed by fontkit on the static faces
 * `loadFont` writes, and the ascent and descent from the face's `hhea`
 * table, unrounded. The same faces draw the PNG, so one set of bytes
 * serves measuring, the SVG and the raster.
 *
 * fontkit loads on the first call, so the build and edit mode, which
 * import nothing from here, never pay for it.
 */

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
 * A `MeasureText` over `faces`, the `[{ file, subset, style, weight }]`
 * that `loadFont` gives: the advance width of a line in the upright face
 * nearest the weight it is drawn at, kerning and ligatures applied, as
 * the browser lays it out. A family a Mermaid node names (`ahead`) is the
 * reader's system font, which the CLI does not load: the text measures in
 * the run's font.
 */
export async function fontkitMeasure(faces) {
    const fontkit = await import("fontkit");
    const upright = faces.filter((face) => face.style !== "italic");
    const opened = (upright.length ? upright : faces).map((face) => ({
        ...face,
        font: fontkit.openSync(face.file),
    }));
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
