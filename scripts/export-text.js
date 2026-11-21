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

/** `text`'s advance width in `font`, in ems, kerning and ligatures applied. */
const ems = (font, text) => font.layout(text).advanceWidth / font.unitsPerEm;

/**
 * The advance width of `text`, in ems, in the faces of `faces` (opened
 * fontkit fonts, each with its `weight` and `subset`) nearest `weight`: in
 * the first that has a glyph for every character of `text`, so a run with
 * several subsets measures each label in the subset that holds it. When no
 * face holds it whole, each run of characters measures in the first face
 * that has them, and a character no face has measures as the first face's
 * missing glyph.
 */
function advance(faces, text, weight) {
    const distance = (face) => Math.abs(face.weight - weight);
    const nearest = Math.min(...faces.map(distance));
    const candidates = faces.filter((face) => distance(face) === nearest);
    const has = ({ font }, character) =>
        font.hasGlyphForCodePoint(character.codePointAt(0));
    const characters = [...text];
    const whole = candidates.find((face) =>
        characters.every((character) => has(face, character)),
    );
    if (whole) return ems(whole.font, text);
    const runs = [];
    for (const character of characters) {
        const { font } =
            candidates.find((face) => has(face, character)) ?? candidates[0];
        if (runs.at(-1)?.font === font) runs.at(-1).text += character;
        else runs.push({ font, text: character });
    }
    return runs.reduce((sum, run) => sum + ems(run.font, run.text), 0);
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
    return (text, fontSize, bold) =>
        advance(opened, text, bold ? BOLD : REGULAR) * fontSize;
}

/**
 * Which characters of a text no face of `faces` (as `loadFont` gives them)
 * has a glyph for, each once, in order: fontkit measures them with the
 * missing glyph, and resvg draws them from a system font. Control
 * characters, such as the line breaks between labels, draw nothing.
 */
export async function glyphCoverage(faces) {
    const fontkit = await import("fontkit");
    const fonts = faces.map((face) => fontkit.openSync(face.file));
    return (text) => [
        ...new Set(
            [...text].filter(
                (character) =>
                    !/\p{Cc}/u.test(character) &&
                    !fonts.some((font) =>
                        font.hasGlyphForCodePoint(character.codePointAt(0)),
                    ),
            ),
        ),
    ];
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
