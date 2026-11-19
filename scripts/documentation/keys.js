import { CLASSES } from "../../src/model/documentation-classes.js";

/**
 * AsciiDoc's keyboard and menu macros as key caps. asciidoctor.js already
 * writes `kbd:[Ctrl+Shift+P]` as `<kbd>` elements, the tag Markdown's raw
 * HTML uses; `menu:File[Save]` becomes a `<kbd>` per step, joined by `›`.
 * The macros need the `experimental` attribute, which every render sets.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciiDocKeys(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_inline_menu(node) {
                    const steps = [
                        node.getAttribute("menu"),
                        ...(node.getAttribute("submenus") ?? []),
                        node.getAttribute("menuitem"),
                    ].filter(Boolean);
                    return `<span class="${CLASSES.menu}">${steps.map((step) => `<kbd>${step}</kbd>`).join("&#160;&#8250; ")}</span>`;
                }
            },
    );
}
