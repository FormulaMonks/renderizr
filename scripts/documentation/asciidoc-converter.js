import { Html5Converter, Section } from "@asciidoctor/core";
import { ALERT_ICONS } from "./alerts.js";
import { CLASSES } from "./classes.js";
import { sanitizeHtml } from "./sanitize.js";

/**
 * asciidoctor.js's HTML5 converter, writing the markup the Markdown path
 * writes wherever AsciiDoc has a counterpart, so the page reads and styles
 * both alike: headings side by side rather than nested in section wrappers
 * and shifted one level like Markdown's, plain paragraphs, lists and
 * blockquotes, alerts, tables in their scroll container, `<s>` for a line
 * through, and code in `<pre><code>`. Links and images resolve through the
 * render's `env`, the way the Markdown path resolves them.
 *
 * What has no Markdown counterpart (collapsible and example blocks,
 * sidebars, description lists…) renders the way asciidoctor.js writes it.
 *
 * A feature extends it by subclassing, through `asciidoc.converter()` in
 * `asciidoc.js`: override a `convert_<name>` method and call `super` for
 * what it leaves alone.
 */
export class AsciiDocConverter extends Html5Converter {
    /**
     * @param {string} backend
     * @param {object} [options]
     * @param {import("./markdown.js").RenderEnv} [env] What this one render
     *   resolves against.
     */
    constructor(backend, options = {}, env = {}) {
        super(backend, options);
        /** @type {import("./markdown.js").RenderEnv} */
        this.env = env;
    }

    /* ----------------------------------------------------------- structure */

    /**
     * The document as one section's HTML: its title as the first heading,
     * its blocks, then its footnotes.
     */
    async convert_embedded(node) {
        const parts = [];
        if (node.hasHeader() && !node.isNotitle()) {
            const id = Section.generateId(
                node.doctitle({ sanitize: true }) ?? "",
                node,
            );
            parts.push(heading(1, id, node.header.title));
        }
        parts.push(await node.content());
        const footnotes = await this.convertFootnotes(node);
        if (footnotes) parts.push(footnotes);
        return parts.filter(Boolean).join("\n");
    }

    /**
     * The footnotes at the document's foot, as asciidoctor.js writes them.
     *
     * @returns {Promise<string>}
     */
    async convertFootnotes(node) {
        if (!node.hasFootnotes() || node.hasAttribute("nofootnotes")) return "";
        return [
            '<div id="footnotes">\n<hr>',
            ...node.footnotes.map(
                (footnote) =>
                    `<div class="footnote" id="_footnotedef_${footnote.index}">\n<a href="#_footnoteref_${footnote.index}">${footnote.index}</a>. ${footnote.text}\n</div>`,
            ),
            "</div>",
        ].join("\n");
    }

    /**
     * A section's heading followed by its blocks, with no wrapper: the page
     * splits a section into pages at its top-level headings. AsciiDoc's
     * section level 1 (`==`) is Markdown's `##`, so it takes an `h3`.
     */
    async convert_section(node) {
        const title = node.numbered
            ? `${node.sectnum()} ${node.title}`
            : node.title;
        return [heading(node.level + 1, node.id, title), await node.content()]
            .filter(Boolean)
            .join("\n");
    }

    /**
     * A passthrough block (`++++`, `[pass]`) is the author's raw HTML, so it
     * goes through the sanitizer Markdown's raw HTML goes through.
     */
    async convert_pass(node) {
        return sanitizeHtml(await node.content());
    }

    async convert_preamble(node) {
        return node.content();
    }

    /** The documentation menu is the page's own. */
    async convert_toc() {
        return "";
    }

    async convert_paragraph(node) {
        return `${title(node)}<p${idAttribute(node)}${roleAttribute(node)}>${await node.content()}</p>`;
    }

    /* -------------------------------------------------------------- alerts */

    /** `NOTE:` and `[NOTE]` in the alert box GitHub's `> [!NOTE]` draws. */
    async convert_admonition(node) {
        const type = String(node.getAttribute("name"));
        const icon = ALERT_ICONS[type] ?? "";
        const classes = [CLASSES.alert, ALERT_TYPE_CLASSES[type], node.role]
            .filter(Boolean)
            .join(" ");
        const content = await node.content();
        return [
            `<div${idAttribute(node)} class="${classes}">`,
            `<div class="${CLASSES.alertTitle}">${icon}<span>${node.getAttribute("textlabel")}</span></div>`,
            node.hasTitle() ? `<p><strong>${node.title}</strong></p>` : "",
            node.contentModel === "compound" ? content : `<p>${content}</p>`,
            "</div>",
        ]
            .filter(Boolean)
            .join("\n");
    }

    /* -------------------------------------------------------------- tables */

    /**
     * A table in the scroll container Markdown tables sit in. `[cols]`
     * widths keep their `<col>`, and a centered or right-aligned column its
     * alignment, the way markdown-it writes a pipe table's.
     */
    async convert_table(node) {
        const result = [
            `<div class="${CLASSES.tableWrap}"><table${idAttribute(node)}${roleAttribute(node)}>`,
        ];
        if (node.hasTitle()) {
            result.push(`<caption>${node.captionedTitle()}</caption>`);
        }
        if (node.hasAttribute("cols") && !node.hasOption("autowidth")) {
            result.push(
                "<colgroup>",
                ...node.columns.map((column) =>
                    column.hasOption("autowidth")
                        ? "<col>"
                        : `<col width="${column.getAttribute("colpcwidth")}%">`,
                ),
                "</colgroup>",
            );
        }
        for (const [section, rows] of node.rows.bySection()) {
            if (!rows.length) continue;
            result.push(`<t${section}>`);
            for (const row of rows) {
                result.push("<tr>");
                for (const cell of row) {
                    result.push(await tableCell(section, cell));
                }
                result.push("</tr>");
            }
            result.push(`</t${section}>`);
        }
        result.push("</table></div>");
        return result.join("\n");
    }

    /* ---------------------------------------------------------------- code */

    /**
     * Code as Markdown's fences write it: `<pre><code>`, with the language
     * as a `language-` class. A source block's content arrives highlighted
     * by `HighlightJs` in `asciidoc.js`.
     */
    async convert_listing(node) {
        const language =
            node.style === "source" ? node.getAttribute("language") : null;
        const classAttribute = language
            ? ` class="language-${escapeAttribute(language)}"`
            : "";
        return `${title(node)}<pre${idAttribute(node)}${roleAttribute(node)}><code${classAttribute}>${await node.content()}</code></pre>`;
    }

    async convert_literal(node) {
        return `${title(node)}<pre${idAttribute(node)}${roleAttribute(node)}><code>${await node.content()}</code></pre>`;
    }

    /* ---------------------------------------------------- lists and quotes */

    /** A list as Markdown's tight lists write it. */
    async convert_ulist(node) {
        // A checklist keeps asciidoctor.js's own markup until task lists
        // render.
        if (node.hasOption("checklist")) return super.convert_ulist(node);
        return list(node, "ul", "");
    }

    async convert_olist(node) {
        const keyword = node.listMarkerKeyword();
        const attributes = [
            keyword && keyword !== "1" ? ` type="${keyword}"` : "",
            node.hasAttribute("start")
                ? ` start="${node.getAttribute("start")}"`
                : "",
            node.hasOption("reversed") ? " reversed" : "",
        ].join("");
        return list(node, "ol", attributes);
    }

    /** A quote block as a blockquote, with its attribution under it. */
    async convert_quote(node) {
        const attribution = [
            node.getAttribute("attribution"),
            node.getAttribute("citetitle"),
        ]
            .filter(Boolean)
            .join(", ");
        return [
            `${title(node)}<blockquote${idAttribute(node)}${roleAttribute(node)}>`,
            await node.content(),
            attribution ? `<p>&#8212; ${attribution}</p>` : "",
            "</blockquote>",
        ]
            .filter(Boolean)
            .join("\n");
    }

    /* -------------------------------------------------------------- inline */

    /** `[.line-through]#…#` as Markdown's `~~…~~`: `<s>`. */
    async convert_inline_quoted(node) {
        const roles = node.roles ?? [];
        if (roles.includes("line-through")) {
            const rest = roles.filter((role) => role !== "line-through");
            node.role = rest.length ? rest.join(" ") : null;
            if (!rest.length && node.id == null && node.type === "unquoted") {
                return `<s>${node.text}</s>`;
            }
            return `<s>${await super.convert_inline_quoted(node)}</s>`;
        }
        return super.convert_inline_quoted(node);
    }

    /**
     * A link to another file resolves the way a Markdown link does: to the
     * page of this site that holds the same content, or, when the workspace
     * lacks it, to its text, no longer a link.
     */
    async convert_inline_anchor(node) {
        const resolve = this.env.resolveLink;
        const toFile =
            node.type === "link" ||
            (node.type === "xref" && node.attributes.path);
        if (!resolve || !toFile) return super.convert_inline_anchor(node);

        const href = unescapeAttribute(String(node.target ?? ""));
        const resolved = resolve(href);
        if (resolved === null) {
            const text =
                node.text || node.attributes.path || escapeAttribute(href);
            return `<span class="${CLASSES.unresolvedLink}" title="Not part of this workspace: ${escapeAttribute(href)}">${text}</span>`;
        }
        if (typeof resolved === "string") {
            node.target = escapeAttribute(resolved);
        }
        return super.convert_inline_anchor(node);
    }

    /** An image resolves to the copy the workspace embeds. */
    async convert_image(node) {
        const resolved = this.env.resolveImage?.(
            String(node.getAttribute("target") ?? ""),
        );
        if (resolved !== undefined) node.setAttribute("target", resolved);
        return super.convert_image(node);
    }

    async convert_inline_image(node) {
        if ((node.type || "image") === "image") {
            const resolved = this.env.resolveImage?.(String(node.target ?? ""));
            if (resolved !== undefined) node.target = resolved;
        }
        return super.convert_inline_image(node);
    }
}

/** Each admonition's alert class, by asciidoctor.js's admonition name. */
const ALERT_TYPE_CLASSES = {
    note: CLASSES.alertNote,
    tip: CLASSES.alertTip,
    important: CLASSES.alertImportant,
    warning: CLASSES.alertWarning,
    caution: CLASSES.alertCaution,
};

/** A table cell's alignment, as markdown-it writes a pipe table's. */
const ALIGN = { center: "center", right: "right" };

/**
 * A heading for section level `level`, shifted the way the Markdown path
 * shifts `#`: level 0, the document title, takes an `h2`.
 */
const heading = (level, id, text) => {
    const tag = `h${Math.min(level + 1, 6)}`;
    const idPart = id ? ` id="${id}"` : "";
    return `<${tag}${idPart} tabindex="-1">${text}</${tag}>`;
};

const idAttribute = (node) => (node.id != null ? ` id="${node.id}"` : "");
const roleAttribute = (node) =>
    node.role != null ? ` class="${node.role}"` : "";
const title = (node) =>
    node.hasTitle() ? `<div class="title">${node.title}</div>\n` : "";

async function list(node, tag, attributes) {
    const items = [];
    for (const item of node.getItems()) {
        const text = item.getText();
        const blocks = item.hasBlocks() ? `\n${await item.content()}\n` : "";
        items.push(
            `<li${idAttribute(item)}${roleAttribute(item)}>${text}${blocks}</li>`,
        );
    }
    return `${title(node)}<${tag}${idAttribute(node)}${roleAttribute(node)}${attributes}>\n${items.join("\n")}\n</${tag}>`;
}

async function tableCell(section, cell) {
    let content;
    if (section === "head") {
        content = cell.text;
    } else if (cell.style === "asciidoc") {
        content = `\n${await cell.content()}\n`;
    } else if (cell.style === "literal") {
        content = `<pre><code>${cell.text}</code></pre>`;
    } else {
        const paragraphs = await cell.content();
        content =
            paragraphs.length > 1
                ? paragraphs.map((text) => `<p>${text}</p>`).join("\n")
                : (paragraphs[0] ?? "");
    }
    const tag = section === "head" || cell.style === "header" ? "th" : "td";
    const align = ALIGN[cell.getAttribute("halign")];
    const attributes = [
        cell.colspan ? ` colspan="${cell.colspan}"` : "",
        cell.rowspan ? ` rowspan="${cell.rowspan}"` : "",
        align ? ` style="text-align:${align}"` : "",
    ].join("");
    return `<${tag}${attributes}>${content}</${tag}>`;
}

const escapeAttribute = (value) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const unescapeAttribute = (value) =>
    value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
