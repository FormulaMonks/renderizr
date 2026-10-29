import type { Branding } from "virtual:renderizr/set";
import { setMermaidPrimaryColor } from "../model/mermaid-styles";

/**
 * Apply a workspace's branding when the reader enters it (ADR 26): its
 * primary color and its font. The header draws its logo.
 *
 * The workspace the page lands on is branded from first paint by the build.
 * Every other workspace takes a value from the landscape scoped workspace
 * when it sets none of its own, so a workspace that has no value here has
 * none in the page either. Both go through the CSSOM: the primary color as
 * an inline property on `<html>`, which outweighs the build's rule, and the
 * font's embedded faces as a constructed stylesheet, never a `<style>`
 * element.
 */

/** The stylesheet each font's faces were adopted in, by their CSS. */
const fontSheets = new Map<string, CSSStyleSheet>();

/** The font sheet the page holds now, if any. */
let adopted: CSSStyleSheet | null = null;

/** Hold `sheet` in place of the last font sheet, or none for `null`. */
function adoptFontSheet(sheet: CSSStyleSheet | null) {
    if (sheet === adopted) return;
    const others = document.adoptedStyleSheets.filter(
        (held) => held !== adopted,
    );
    document.adoptedStyleSheets = sheet ? [...others, sheet] : others;
    adopted = sheet;
}

/** The stylesheet that holds `css`, made the first time. */
function fontSheet(css: string): CSSStyleSheet {
    let sheet = fontSheets.get(css);
    if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        fontSheets.set(css, sheet);
    }
    return sheet;
}

export function applyBranding({ font, primaryColor }: Branding) {
    const root = document.documentElement.style;
    if (primaryColor) root.setProperty("--color-primary", primaryColor);
    else root.removeProperty("--color-primary");
    setMermaidPrimaryColor(primaryColor);

    if (typeof CSSStyleSheet === "function" && document.adoptedStyleSheets)
        adoptFontSheet(font?.css ? fontSheet(font.css) : null);
}
