import type MarkdownIt from "markdown-it";
import noteIcon from "../../vendor/structurizr/bootstrap-icons/info-circle-fill.svg?raw";
import tipIcon from "../../vendor/structurizr/bootstrap-icons/lightbulb-fill.svg?raw";
import importantIcon from "../../vendor/structurizr/bootstrap-icons/megaphone-fill.svg?raw";
import warningIcon from "../../vendor/structurizr/bootstrap-icons/exclamation-triangle-fill.svg?raw";
import cautionIcon from "../../vendor/structurizr/bootstrap-icons/exclamation-octagon-fill.svg?raw";

/**
 * GitHub-flavoured alert blockquotes for markdown-it.
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

export type AlertType = "note" | "tip" | "important" | "warning" | "caution";

export interface AlertClassNames {
    /** Applied to every alert container. */
    alert: string;
    /** Applied to the injected icon + label row. */
    title: string;
    /** Per-type modifier classes, they carry the accent color. */
    note: string;
    tip: string;
    important: string;
    warning: string;
    caution: string;
}

/** `[!NOTE]` (and friends) on a line of its own. */
const ALERT_MARKER =
    /^\[!(note|tip|important|warning|caution)\][^\S\n]*(?:\n|$)/i;

const prepareIcon = (svg: string): string =>
    svg.trim().replace(/^<svg /i, '<svg aria-hidden="true" focusable="false" ');

const ALERT_ICONS: Record<AlertType, string> = {
    note: prepareIcon(noteIcon),
    tip: prepareIcon(tipIcon),
    important: prepareIcon(importantIcon),
    warning: prepareIcon(warningIcon),
    caution: prepareIcon(cautionIcon),
};

const ALERT_LABELS: Record<AlertType, string> = {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
};

type CoreRule = Parameters<MarkdownIt["core"]["ruler"]["before"]>[2];
type CoreState = Parameters<CoreRule>[0];
type Token = CoreState["tokens"][number];

/** Index of the `blockquote_close` matching the open token at `start`. */
function findBlockquoteClose(tokens: Token[], start: number): number {
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

export default function markdownItAlerts(
    md: MarkdownIt,
    classNames: AlertClassNames,
): void {
    const rule: CoreRule = (state) => {
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

            const type = marker[1].toLowerCase() as AlertType;
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
