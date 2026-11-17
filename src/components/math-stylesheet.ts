/**
 * Temml's stylesheet for the MathML the build writes (ADR 31), its font
 * inlined as a data URI where the build inlines assets. `?inline` keeps it
 * out of `renderizr.css`, so it rides in the documentation runtime and a
 * render with no documentation leaves it out. The page adopts it as a
 * constructed stylesheet, the way branding adopts a font's faces, since the
 * page writes no `<style>` element at runtime.
 */
import css from "temml/dist/Temml-Local.css?inline";

/** Temml's stylesheet, made the first time a document shows. */
let sheet: CSSStyleSheet | null = null;

/** Adopt Temml's stylesheet in the page, once. */
export function addMathStylesheet(): void {
    if (typeof CSSStyleSheet !== "function" || !document.adoptedStyleSheets)
        return;
    if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
    }
    if (document.adoptedStyleSheets.includes(sheet)) return;
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
