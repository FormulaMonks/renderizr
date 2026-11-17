import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { searchOf } from "../../src/model/documentation-scopes.js";
import { CLASSES } from "./classes.js";

/**
 * The diagram card (glossary): what a section or decision shows in place of
 * an embedded view or a Mermaid block. It names the diagram's type and its
 * title and links to the diagram on the diagrams page, with a diagram icon
 * and no picture: the documentation page draws no diagram and carries no
 * engine. The build writes it as plain HTML, so it works in every
 * documentation scope and every build.
 *
 * The whole card is the link, so the reader can click anywhere on it. The
 * card and its note are phrasing content only (`<a>`, `<span>`, `<svg>`),
 * so they sit as well in a paragraph or a list item as on their own. The
 * module CSS lays them out as blocks.
 */

const require = createRequire(import.meta.url);

const DIAGRAM_ICON = readFileSync(
    require.resolve("bootstrap-icons/icons/diagram-3.svg"),
    "utf8",
)
    .trim()
    .replace(/^<svg /, '<svg aria-hidden="true" focusable="false" ')
    .replace(/\n\s*/g, " ");

const escapeHtml = (value) =>
    String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/**
 * The address that opens view `key` on the diagrams page, under the
 * perspective `perspective` when one is named.
 *
 * @param {string} key
 * @param {{ perspective?: string | null }} [options]
 * @returns {string}
 */
export const viewAddress = (key, { perspective = null } = {}) =>
    `#/?${searchOf({ view: key, ...(perspective ? { perspective } : {}) })}`;

/**
 * A diagram card for the diagram of type `type`, titled `title`, which
 * "Open in diagrams" opens at `address`. Every value is text, escaped here.
 *
 * @param {{ type: string, title: string, address: string }} diagram
 * @returns {string}
 */
export function diagramCard({ type, title, address }) {
    return [
        `<a class="${CLASSES.diagramCard}" href="${escapeHtml(address)}">`,
        `<span class="${CLASSES.diagramCardIcon}">${DIAGRAM_ICON}</span>`,
        `<span class="${CLASSES.diagramCardText}">`,
        `<span class="${CLASSES.diagramCardType}">${escapeHtml(type)}</span>`,
        `<span class="${CLASSES.diagramCardTitle}">${escapeHtml(title)}</span>`,
        "</span>",
        `<span class="${CLASSES.diagramCardOpen}">Open in diagrams</span>`,
        "</a>",
    ].join("");
}

/**
 * The note a section shows in a card's place when there is no diagram to
 * open. `html` is the note's own markup, phrasing content the caller has
 * escaped.
 *
 * @param {string} html
 * @returns {string}
 */
export const diagramNote = (html) =>
    `<span class="${CLASSES.diagramNote}" role="note">${html}</span>`;

export { escapeHtml };
