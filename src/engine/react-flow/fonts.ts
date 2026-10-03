/**
 * The diagram font and the font swap (spec 9.5). The first render uses the
 * fallback stack at once, with boundary label bands measured by canvas
 * `measureText` in the same font string the CSS uses. When the `--font`
 * family's faces arrive, boundaries are re-derived once; elements reflow
 * through CSS in their fixed boxes and edges are unaffected. No wait and no
 * timeout: a flash of the fallback font is accepted.
 *
 * No React here, so it runs under `node --test`.
 */

import { estimateText, type MeasureText } from "../geometry/boundary";

/** The stack the diagram is drawn in until, or without, a `--font` family. */
export const FALLBACK_FONT = "Helvetica, Arial, sans-serif";

/** The CSS `font-family` the diagram is drawn and measured in. */
export const diagramFontFamily = (family: string | null) =>
    family ? `"${family.replace(/"/g, "")}", ${FALLBACK_FONT}` : FALLBACK_FONT;

/** The part of `document.fonts` the swap needs. */
export type FontLoader = { load(font: string): Promise<unknown[]> };

/**
 * Call `loaded` once the `family` faces the diagram uses (regular and bold)
 * have loaded, if any did, and hand back a way to stop listening. A family
 * with no faces in the document (a system font, or no `--font` at all)
 * never calls it, and neither does a load that fails.
 */
export function whenFontLoads(
    fonts: FontLoader | undefined,
    family: string | null,
    loaded: () => void,
): () => void {
    if (!fonts || !family) return () => {};
    let listening = true;
    const quoted = `"${family.replace(/"/g, "")}"`;
    Promise.all([
        fonts.load(`16px ${quoted}`),
        fonts.load(`bold 16px ${quoted}`),
    ])
        .then((faces) => {
            if (listening && faces.some((found) => found.length > 0)) loaded();
        })
        // A family that cannot load leaves the fallback drawn, which is fine.
        .catch(() => {});
    return () => {
        listening = false;
    };
}

/** The part of `document` that measuring needs. */
type CanvasMaker = {
    createElement(tag: "canvas"): {
        getContext(kind: "2d"): {
            font: string;
            measureText(text: string): { width: number };
        } | null;
    };
};

/**
 * Measure text with canvas `measureText` in `family`, at the size and
 * weight the label is drawn at, so a measured line is the line CSS draws.
 * Falls back to an estimate where there is no 2D canvas.
 */
export function canvasMeasure(
    document: CanvasMaker,
    family: string,
): MeasureText {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return estimateText;
    return (text, fontSize, bold) => {
        context.font = `${bold ? "bold " : ""}${fontSize}px ${family}`;
        return context.measureText(text).width;
    };
}
