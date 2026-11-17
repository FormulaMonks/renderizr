import markdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import shiftHeadings from "markdown-it-shift-headings";
import alerts from "./alerts.js";
import { CLASSES } from "./classes.js";
import { colorSchemeImages } from "./color-scheme.js";
import { emoji } from "./emoji.js";
import { highlight } from "./highlight.js";
import { githubSlug } from "./links.js";
import { linkify } from "./linkify.js";
import { htmlMedia } from "./media.js";
import { sanitizeRawHtml } from "./sanitize.js";
import { singleTildeStrikethrough } from "./strikethrough.js";
import { taskLists } from "./task-lists.js";

/**
 * What one render resolves against, as markdown-it's `env`: the documentation
 * scope's link and image resolvers. A rule a plugin adds reads the same
 * `env`, so one markdown-it serves every section and decision.
 *
 * @typedef {object} RenderEnv
 * @property {import("./links.js").LinkResolver | null} [resolveLink]
 * @property {import("./images.js").ImageResolver | null} [resolveImage]
 */

/**
 * Empty element pairs left behind by the source markdown (`<p></p>`,
 * `<em></em>`, …) are stripped from the rendered output. The tag list is
 * deliberately explicit and the closing tag is a backreference: structural
 * markup (empty table cells, the table and alert wrappers, inline SVG icons)
 * has to survive even when it looks "empty".
 */
const EMPTY_ELEMENT_PATTERN =
    /<(p|h[1-6]|em|strong|b|i|s|small|span|a|ul|ol|li|blockquote)(?:\s[^>]*)?>[\s​-‍﻿]*<\/\1\s*>/gi;

/**
 * Give every heading its GitHub id, from the text as it was written.
 *
 * It has to run before `replacements` and `smartquotes`: by the time
 * `markdown-it-anchor` sees the heading, the typographer has turned `--` into
 * `–` and `"` into `”`, and GitHub slugs the text before any of that. The ids
 * are made unique here too, the way GitHub does it (`same`, `same-1`, …) —
 * the anchor plugin treats an id that is already set as the author's own and
 * refuses a duplicate rather than numbering it.
 */
function headingIds(state) {
    const seen = new Set();

    state.tokens.forEach((token, index) => {
        if (token.type !== "heading_open") return;

        const text = (state.tokens[index + 1]?.children ?? [])
            .filter((child) =>
                ["text", "text_special", "code_inline"].includes(child.type),
            )
            .map((child) => child.content)
            .join("");

        const slug = githubSlug(text);
        let id = slug;
        for (let n = 1; seen.has(id); n++) id = `${slug}-${n}`;
        seen.add(id);

        token.attrSet("id", id);
    });
}

/** Point relative image paths at the copy the workspace embeds. */
function resolveImages(state) {
    const resolve = state.env?.resolveImage;
    if (!resolve) return;

    for (const block of state.tokens) {
        for (const token of block.children ?? []) {
            if (token.type !== "image") continue;
            const src = resolve(String(token.attrGet("src") ?? ""));
            if (src !== undefined) token.attrSet("src", src);
        }
    }
}

/**
 * Point relative links at the page of this site that holds the same
 * content. A link to a document the workspace does not contain stays
 * readable but stops being a link: there is nothing to follow it to, and
 * following it anyway left the site.
 */
function resolveLinks(state) {
    const resolve = state.env?.resolveLink;
    if (!resolve) return;

    for (const block of state.tokens) {
        const children = block.children ?? [];

        children.forEach((token, index) => {
            if (token.type !== "link_open") return;

            const href = String(token.attrGet("href") ?? "");
            const resolved = resolve(href);

            if (typeof resolved === "string") {
                token.attrSet("href", resolved);
                return;
            }

            if (resolved !== null) return;

            const close = children.findIndex(
                (other, at) => at > index && other.type === "link_close",
            );

            token.tag = "span";
            token.attrs = [
                ["class", CLASSES.unresolvedLink],
                ["title", `Not part of this workspace: ${href}`],
            ];
            if (close >= 0) children[close].tag = "span";
        });
    }
}

/**
 * The markdown-it every section and decision renders through: GitHub's
 * heading ids, headings shifted one level so the page title stays the `h1`,
 * the author's raw HTML sanitized, GitHub's alerts, highlighted fences, tables in their own scroll container,
 * and links and images resolved through the render's `env`. A later plugin
 * extends it with `md.use()`.
 *
 * @returns {import("markdown-it").default}
 */
export function createMarkdown() {
    const md = markdownIt({
        html: true,
        typographer: true,
        highlight,
    })
        .use(sanitizeRawHtml)
        .use(shiftHeadings)
        .use((md) =>
            md.core.ruler.before("replacements", "heading_ids", headingIds),
        )
        .use(anchor)
        /*
         * Setext headings are off.
         *
         * These documents use `---` as a separator, and in markdown a `---`
         * that has lost the blank line above it turns the whole preceding
         * paragraph into an <h2>. That used to be a cosmetic surprise; now
         * that the navigation is derived from heading structure it is a
         * structural one — the paragraph becomes the shallowest heading in
         * the document, so it takes over as a page, demotes the real title
         * and pushes the real sub-heads down a level.
         *
         * Every heading here is written ATX (`##`), which is also what
         * markdownlint enforces on this content, so nothing is lost. With the
         * rule off, `---` is always the thematic break the author meant.
         */
        .disable("lheading")
        .use(alerts, {
            alert: CLASSES.alert,
            title: CLASSES.alertTitle,
            note: CLASSES.alertNote,
            tip: CLASSES.alertTip,
            important: CLASSES.alertImportant,
            warning: CLASSES.alertWarning,
            caution: CLASSES.alertCaution,
        })
        .use(linkify)
        .use(emoji)
        .use(singleTildeStrikethrough)
        .use(taskLists)
        .use(htmlMedia)
        .use(colorSchemeImages);

    // Every table gets its own scroll container, so a seven-column table
    // scrolls inside the prose measure instead of dragging the whole page
    // sideways with it.
    md.renderer.rules.table_open = (tokens, idx, options, _env, self) =>
        `<div class="${CLASSES.tableWrap}">${self.renderToken(tokens, idx, options)}`;
    md.renderer.rules.table_close = () => "</table></div>";

    md.core.ruler.push("doc_links", resolveLinks);
    md.core.ruler.push("doc_images", resolveImages);

    return md;
}

/**
 * `source` rendered by `md` into the HTML the page shows, resolving its links
 * and images through `env`.
 *
 * @param {import("markdown-it").default} md
 * @param {string} source
 * @param {RenderEnv} [env]
 * @returns {string}
 */
export const renderMarkdown = (md, source, env = {}) =>
    md.render(source, { ...env }).replace(EMPTY_ELEMENT_PATTERN, "");
