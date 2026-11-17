import { CLASSES } from "./classes.js";

/**
 * Collapsed sections: GitHub's `<details>` and `<summary>` in Markdown, and
 * AsciiDoc's `[%collapsible]` block, which asciidoctor.js writes as the same
 * pair. Both take the same classes, so the page styles them alike, and the
 * browser opens and closes them. `src/components/collapsed-sections.ts`
 * opens the ones around a link's target and prints every one open.
 */

/** An opening `<details>` or `<summary>` tag, with its attributes. */
const OPENING_TAG = /<(details|summary)\b([^>]*)>/gi;

/** A heading tag, opening or closing, in the author's raw HTML. */
const HEADING_TAG = /<(\/?)h([1-6])\b/gi;

const CLASS_ATTRIBUTE = /(\sclass=")([^"]*)"/i;

/** `attributes` with `name` first in its class list. */
const withClass = (attributes, name) =>
    CLASS_ATTRIBUTE.test(attributes)
        ? attributes.replace(
              CLASS_ATTRIBUTE,
              (_, before, rest) => `${before}${name} ${rest}"`,
          )
        : ` class="${name}"${attributes}`;

/**
 * `html`, a piece of the author's raw HTML the sanitizer let through, with
 * the collapsed section's class on each `<details>` and `<summary>`, and
 * each heading one level deeper, the way markdown-it shifts `#`: GitHub
 * draws `<h3>` and `###` alike, so a heading as the summary keeps the size
 * of the Markdown heading it stands for.
 *
 * @param {string} html
 * @returns {string}
 */
export const markCollapsedSections = (html) =>
    html
        .replace(
            OPENING_TAG,
            (_, tag, attributes) =>
                `<${tag}${withClass(
                    attributes,
                    tag.toLowerCase() === "details"
                        ? CLASSES.collapsed
                        : CLASSES.collapsedSummary,
                )}>`,
        )
        .replace(
            HEADING_TAG,
            (_, slash, level) => `<${slash}h${Math.min(Number(level) + 1, 6)}`,
        );

/**
 * The markdown-it plugin: marks the raw HTML of every `html_block` and
 * `html_inline` token, a table cell's and a list item's included. It runs
 * after parsing, so on HTML the sanitizer already judged.
 *
 * @param {import("markdown-it").default} md
 */
export function collapsedSections(md) {
    md.core.ruler.push("collapsed_sections", (state) => {
        for (const token of state.tokens) {
            if (token.type === "html_block") {
                token.content = markCollapsedSections(token.content);
            }
            for (const child of token.children ?? []) {
                if (child.type === "html_inline") {
                    child.content = markCollapsedSections(child.content);
                }
            }
        }
    });
}

/**
 * The asciidoctor.js plugin: a `[%collapsible]` example block as the
 * markup a Markdown collapsed section takes, its `.Title` as the summary and
 * "Details" when it has none. `%open` starts it open. Any other example
 * block renders the way asciidoctor.js writes it.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciidocCollapsedSections(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_example(node) {
                    if (!node.hasOption("collapsible")) {
                        return super.convert_example(node);
                    }
                    const id = node.id != null ? ` id="${node.id}"` : "";
                    const classes = [CLASSES.collapsed, node.role]
                        .filter(Boolean)
                        .join(" ");
                    const open = node.hasOption("open") ? " open" : "";
                    const summary = node.hasTitle() ? node.title : "Details";
                    return [
                        `<details${id} class="${classes}"${open}>`,
                        `<summary class="${CLASSES.collapsedSummary}">${summary}</summary>`,
                        '<div class="content">',
                        await node.content(),
                        "</div>",
                        "</details>",
                    ].join("\n");
                }
            },
    );
}
