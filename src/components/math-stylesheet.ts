// Temml's stylesheet for the MathML the build writes (ADR 31), its font
// inlined as a data URI where the build inlines assets. `?inline` keeps it
// out of `renderizr.css`, so it rides in the documentation runtime and a
// render with no documentation leaves it out.
import css from "temml/dist/Temml-Local.css?inline";

const ID = "rz-math-stylesheet";

/** Add Temml's stylesheet to the page, once. */
export function addMathStylesheet(): void {
    if (document.getElementById(ID)) return;
    const style = document.createElement("style");
    style.id = ID;
    style.textContent = css;
    document.head.appendChild(style);
}
