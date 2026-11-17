/**
 * GitHub-flavored alert blockquotes for markdown-it.
 *
 * ```markdown
 * > [!NOTE]
 * > Useful information the reader should know.
 * ```
 *
 * The marker has to be the very first line of the blockquote (case
 * insensitive). Matching blockquotes are turned into a `<div>` carrying the
 * alert classes plus a title row (icon + label); everything else keeps the
 * regular blockquote rendering.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** The text of the Bootstrap icon `name`. */
const icon = (name) =>
    readFileSync(require.resolve(`bootstrap-icons/icons/${name}.svg`), "utf8");

/**
 * @typedef {"note" | "tip" | "important" | "warning" | "caution"} AlertType
 *
 * @typedef {object} AlertClassNames
 * @property {string} alert Applied to every alert container.
 * @property {string} title Applied to the injected icon + label row.
 * @property {string} note Per-type modifier classes carry the accent color.
 * @property {string} tip
 * @property {string} important
 * @property {string} warning
 * @property {string} caution
 */

/** `[!NOTE]` (and friends) on a line of its own. */
const ALERT_MARKER =
    /^\[!(note|tip|important|warning|caution)\][^\S\n]*(?:\n|$)/i;

const prepareIcon = (svg) =>
    svg.trim().replace(/^<svg /i, '<svg aria-hidden="true" focusable="false" ');

export const ALERT_ICONS = {
    note: prepareIcon(icon("info-circle-fill")),
    tip: prepareIcon(icon("lightbulb-fill")),
    important: prepareIcon(icon("megaphone-fill")),
    warning: prepareIcon(icon("exclamation-triangle-fill")),
    caution: prepareIcon(icon("exclamation-octagon-fill")),
};

export const ALERT_LABELS = {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
};

/** Index of the `blockquote_close` matching the open token at `start`. */
function findBlockquoteClose(tokens, start) {
    let depth = 0;

    for (let index = start; index < tokens.length; index++) {
        const type = tokens[index].type;

        if (type === "blockquote_open") {
            depth++;
        } else if (type === "blockquote_close") {
            depth--;
            if (depth === 0) return index;
        }
    }

    return -1;
}

/**
 * @param {import("markdown-it").default} md
 * @param {AlertClassNames} classNames
 */
export default function markdownItAlerts(md, classNames) {
    const rule = (state) => {
        const tokens = state.tokens;

        for (let index = 0; index < tokens.length; index++) {
            const open = tokens[index];
            if (open.type !== "blockquote_open") continue;

            const paragraphOpen = tokens[index + 1];
            const inline = tokens[index + 2];
            const paragraphClose = tokens[index + 3];

            if (paragraphOpen?.type !== "paragraph_open") continue;
            if (inline?.type !== "inline") continue;
            if (paragraphClose?.type !== "paragraph_close") continue;

            const marker = ALERT_MARKER.exec(inline.content);
            if (!marker) continue;

            const type = marker[1].toLowerCase();
            const close = findBlockquoteClose(tokens, index);

            // Render the whole thing as a <div> so plain blockquotes keep the
            // quote styling without needing :not() gymnastics in CSS.
            open.tag = "div";
            open.attrJoin("class", `${classNames.alert} ${classNames[type]}`);
            if (close >= 0) tokens[close].tag = "div";

            const title = new state.Token("html_block", "", 0);
            title.block = true;
            title.content = `<div class="${classNames.title}">${ALERT_ICONS[type]}<span>${ALERT_LABELS[type]}</span></div>\n`;

            // Drop the marker line; inline content is not tokenised yet, so
            // rewriting the source is enough.
            inline.content = inline.content.slice(marker[0].length);

            if (inline.content.trim() === "") {
                // The marker was the whole paragraph: replace it by the title.
                tokens.splice(index + 1, 3, title);
            } else {
                tokens.splice(index + 1, 0, title);
            }
        }
    };

    md.core.ruler.before("inline", "github_alerts", rule);
}
