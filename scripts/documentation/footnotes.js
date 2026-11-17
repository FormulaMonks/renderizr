import footnote from "markdown-it-footnote";
import { CLASSES } from "../../src/model/documentation-classes.js";
import { escapeHtml } from "./html-entities.js";

/**
 * Footnotes, from Markdown's `[^label]` and `[^label]: …` and AsciiDoc's
 * `footnote:[…]` and `footnote:name[…]`, in the same markup for both
 * syntaxes. The build numbers them across the whole section, in the order
 * their references first appear, and gives them GitHub's ids: `fn-<label>`
 * for the footnote and `fnref-<label>` for its reference, `fnref-<label>-2`
 * and on for each reference after the first. A footnote with no label (an
 * anonymous AsciiDoc one, or Markdown's inline `^[…]`) takes its number as
 * its label.
 *
 * Every footnote of the section lists in one `<section>` at its foot, each
 * `<li>` carrying its number as its `value`, so the page can list the
 * footnotes of one page of a split section with the numbers the whole
 * section gave them.
 */

/** The id of the `occurrence`th reference to footnote `label`, from 1. */
const referenceId = (label, occurrence) =>
    occurrence > 1 ? `fnref-${label}-${occurrence}` : `fnref-${label}`;

/** A reference to footnote `label`, numbered `number`. */
const reference = (label, number, occurrence) =>
    `<sup class="${CLASSES.footnoteRef}"><a href="#fn-${label}" id="${referenceId(label, occurrence)}">${number}</a></sup>`;

/** The link from footnote `label` back to its `occurrence`th reference. */
const backLink = (label, number, occurrence) =>
    `<a href="#${referenceId(label, occurrence)}" class="${CLASSES.footnoteBackref}" aria-label="Back to reference ${number}${occurrence > 1 ? `-${occurrence}` : ""}">↩︎${occurrence > 1 ? `<sup>${occurrence}</sup>` : ""}</a>`;

const LIST_OPEN = `<section class="${CLASSES.footnotes}" aria-label="Footnotes">\n<ol>\n`;
const LIST_CLOSE = "</ol>\n</section>\n";

const itemOpen = (label, number) => `<li id="fn-${label}" value="${number}">`;

/* ---------------------------------------------------------------- Markdown */

/** A Markdown footnote token's label, escaped, or its number. */
const markdownLabel = (token) =>
    escapeHtml(token.meta.label ?? token.meta.id + 1);

/**
 * markdown-it-footnote, writing the markup above. The plugin already numbers
 * footnotes by first reference, drops a definition nobody references and
 * counts each footnote's references (`subId`).
 *
 * @param {import("markdown-it").default} md
 */
export function markdownFootnotes(md) {
    md.use(footnote);
    const rules = md.renderer.rules;

    rules.footnote_ref = (tokens, index) => {
        const token = tokens[index];
        return reference(
            markdownLabel(token),
            token.meta.id + 1,
            token.meta.subId + 1,
        );
    };
    rules.footnote_block_open = () => LIST_OPEN;
    rules.footnote_block_close = () => LIST_CLOSE;
    rules.footnote_open = (tokens, index) =>
        itemOpen(markdownLabel(tokens[index]), tokens[index].meta.id + 1);
    rules.footnote_close = () => "</li>\n";
    rules.footnote_anchor = (tokens, index) => {
        const token = tokens[index];
        return ` ${backLink(markdownLabel(token), token.meta.id + 1, token.meta.subId + 1)}`;
    };
}

/* ---------------------------------------------------------------- AsciiDoc */

/**
 * Where a footnote's back links go until every reference has converted.
 * asciidoctor.js converts list items and table cells ahead of the blocks
 * around them, so only the finished document knows each reference's place.
 */
const backLinksMarker = (label, number) =>
    `<!--rz-backlinks ${label} ${number}-->`;

const REFERENCE_PATTERN = new RegExp(
    `<sup class="${CLASSES.footnoteRef}"><a href="#fn-([^"]*)" id="fnref-\\1">`,
    "g",
);
const BACK_LINKS_PATTERN = /<!--rz-backlinks (\S*) (\d+)-->/g;

/**
 * Number the references to each footnote in `html` in document order, and
 * write each footnote's back links, one to each of its references.
 *
 * @param {string} html
 * @returns {string}
 */
function numberReferences(html) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    const numbered = html.replace(REFERENCE_PATTERN, (match, label) => {
        const occurrence = (counts.get(label) ?? 0) + 1;
        counts.set(label, occurrence);
        return occurrence > 1
            ? match.replace(
                  `id="fnref-${label}"`,
                  `id="${referenceId(label, occurrence)}"`,
              )
            : match;
    });
    return numbered.replace(BACK_LINKS_PATTERN, (_, label, number) =>
        Array.from({ length: counts.get(label) ?? 1 }, (__, at) =>
            backLink(label, number, at + 1),
        ).join(" "),
    );
}

/**
 * The AsciiDoc converter writing the markup above: a reference in place of
 * asciidoctor.js's bracketed `[1]`, and the list in place of its
 * `<div id="footnotes">`. A reference to a footnote that does not exist
 * stays as asciidoctor.js writes it.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciidocFootnotes(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_inline_footnote(node) {
                    const number = node.getAttribute("index");
                    if (!number) return super.convert_inline_footnote(node);
                    const label =
                        node.type === "xref"
                            ? node.target
                            : (node.id ?? number);
                    return reference(escapeHtml(label), number, 1);
                }

                async convertFootnotes(node) {
                    if (
                        !node.hasFootnotes() ||
                        node.hasAttribute("nofootnotes")
                    ) {
                        return "";
                    }
                    return [
                        LIST_OPEN,
                        ...node.footnotes.map((note) => {
                            const label = escapeHtml(note.id ?? note.index);
                            return `${itemOpen(label, note.index)}<p>${note.text} ${backLinksMarker(label, note.index)}</p></li>\n`;
                        }),
                        LIST_CLOSE,
                    ]
                        .join("")
                        .trim();
                }

                async convert_embedded(node) {
                    return numberReferences(await super.convert_embedded(node));
                }
            },
    );
}
