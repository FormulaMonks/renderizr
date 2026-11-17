import { randomUUID } from "node:crypto";
import {
    scopedId,
    searchOf,
    sectionId,
} from "../../src/model/documentation-scopes.js";
import { slugOf } from "../../src/model/slug.js";
import { decodeMermaid } from "../mermaid/decode.js";
import { mermaidKeyword, parseErrorReason } from "../mermaid/index.js";
import { read } from "../mermaid/parser.js";
import { CLASSES } from "./classes.js";
import { diagramCard, escapeHtml, viewAddress } from "./diagram-card.js";
import { standInForImages } from "./embeds.js";

/**
 * Mermaid blocks (spec #342, _Mermaid blocks_; ADR 31): a Mermaid block in a
 * section or decision becomes a Mermaid diagram on the diagrams page, and the
 * section shows a diagram card in its place.
 *
 * - **Which blocks**: a ` ```mermaid ` fence, AsciiDoc's `[mermaid]` block
 *   (and a `[source,mermaid]` block), and the
 *   `![](<mermaid.url>/svg|img|png/<encoded>)` image link Structurizr's
 *   Mermaid documentation plugin writes, `png` read like `img`.
 * - **While rendering**, each block leaves a marker in its place, since
 *   asciidoctor.js renders documents side by side and a block's key must not
 *   depend on which document finishes first.
 * - **Once every document has rendered**, `place()` reads the markers in
 *   document order: each flowchart, entity relationship diagram or sequence
 *   diagram becomes an image view whose content encodes its source, with
 *   the element of its documentation scope as its element, for
 *   `readMermaidDiagrams` (`scripts/mermaid/index.js`) to read like any
 *   other; its marker becomes a diagram card. A type Renderizr does not draw,
 *   or a block that fails to parse, becomes a note with its source instead,
 *   and adds no view.
 */

/** The card's type for each kind Renderizr draws, as the parser names it. */
const DRAWN = Object.freeze({
    flowchart: "Flowchart",
    er: "Entity relationship diagram",
    sequence: "Sequence diagram",
});

/** The kind a source's opening keyword names, for a source that fails to parse. */
const KIND_OF_KEYWORD = Object.freeze({
    flowchart: "flowchart",
    graph: "flowchart",
    erDiagram: "er",
    sequenceDiagram: "sequence",
});

/** What a note names the types Renderizr draws. */
const DRAWN_TYPES =
    "flowcharts, entity relationship diagrams and sequence diagrams";

/** The Mermaid server Structurizr's plugin writes to when the workspace names none. */
const DEFAULT_MERMAID_URL = "https://mermaid.ink";

/** How many lines of a note's source show before it fades out. */
const PREVIEW_LINES = 4;

/** The heading a block sits under: its text and its id. */
/** @typedef {{ text: string, id: string | null } | null} Heading */

/**
 * The hooks a render calls, as its `env.mermaid`: each returns the marker
 * to put in the block's place, or `undefined` for an image that is no
 * Mermaid block.
 *
 * @typedef {object} MermaidBlockHooks
 * @property {(source: string, heading: Heading) => string} block
 * @property {(src: string, heading: Heading) => string | undefined} image
 */

/**
 * A section or decision the markers sit in, as `place()` reads it.
 *
 * @typedef {object} PlacedDocument
 * @property {{ id?: string, filename?: string, content?: string }} document
 * @property {"section" | "decision"} kind
 * @property {{ path: string, elementId: string | null }} scope
 * @property {string} title The title the page shows the document by.
 */

/**
 * The Mermaid blocks of `workspace`'s documentation: the hooks every render
 * calls, and `place()`, which turns their markers into views and cards.
 *
 * @param {any} workspace
 * @param {{
 *   pages: { docs: string, decisions: string },
 *   warn: (message: string) => void,
 * }} options
 */
export function createMermaidBlocks(workspace, { pages, warn }) {
    const nonce = randomUUID();
    const MARKER = new RegExp(`<!--rz-mermaid:${nonce}:(\\d+)-->\\n?`, "g");
    const configured =
        workspace.views?.configuration?.properties?.["mermaid.url"];
    const mermaidUrl = String(configured || DEFAULT_MERMAID_URL)
        .trim()
        .replace(/\/+$/, "");

    /** @type {{ source: string, heading: Heading }[]} */
    const recorded = [];
    const marker = (source, heading) => {
        recorded.push({ source: source.replace(/\r\n?/g, "\n"), heading });
        return `<!--rz-mermaid:${nonce}:${recorded.length - 1}-->`;
    };

    /** @type {MermaidBlockHooks} */
    const hooks = {
        block: (source, heading) => marker(source, heading),
        image(src, heading) {
            const png = `${mermaidUrl}/png/`;
            const read = src.startsWith(png)
                ? `${mermaidUrl}/img/${src.slice(png.length)}`
                : src;
            const source = decodeMermaid(read, mermaidUrl);
            return typeof source === "string"
                ? marker(source, heading)
                : undefined;
        },
    };

    /**
     * Turn every marker in `documents`, in their order, into a card and its
     * image view, or a note.
     *
     * @param {PlacedDocument[]} documents
     */
    const place = (documents) => {
        if (!recorded.length) return;
        workspace.views ??= {};
        const views = workspace.views;
        const all = Object.values(views)
            .filter(Array.isArray)
            .flat()
            .filter((view) => view && typeof view === "object");
        const taken = new Set(all.map((view) => view.key));
        let order = Math.max(
            0,
            ...all.map((view) => Number(view.order)).filter(Number.isFinite),
        );

        for (const placed of documents) {
            const content = placed.document.content;
            if (typeof content !== "string" || !content.includes(nonce))
                continue;
            /** @type {Map<string, number>} */
            const repeats = new Map();
            placed.document.content = content.replace(MARKER, (_, at) => {
                const { source, heading } = recorded[Number(at)];
                const origin = originOf(placed, heading, pages);

                const keyword = mermaidKeyword(source);
                let parsed;
                try {
                    parsed = read(source);
                } catch (error) {
                    const reason = parseErrorReason(error, source);
                    warn(`Mermaid block under "${origin.title}": ${reason}.`);
                    const kind = KIND_OF_KEYWORD[keyword];
                    const type = kind ? DRAWN[kind].toLowerCase() : "diagram";
                    return sourceNote(
                        `Renderizr can't draw this Mermaid ${escapeHtml(type)}: ${escapeHtml(reason)}.`,
                        source,
                    );
                }
                const type = DRAWN[parsed.kind];
                if (!type) {
                    const named = keyword
                        ? `Mermaid <code>${escapeHtml(keyword)}</code> diagrams`
                        : "this type of Mermaid diagram";
                    return sourceNote(
                        `Renderizr doesn't draw ${named}. It draws ${DRAWN_TYPES}.`,
                        source,
                    );
                }

                let title =
                    parsed.title?.trim() ||
                    heading?.text ||
                    placed.title ||
                    "Mermaid diagram";
                const repeat = (repeats.get(title) ?? 0) + 1;
                repeats.set(title, repeat);
                if (repeat > 1) title = `${title} (${repeat})`;

                const base = `${scopedId(placed.scope.path, documentSlug(placed))}/${slugOf(title) || "diagram"}`;
                let key = base;
                for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
                taken.add(key);

                views.imageViews ??= [];
                views.imageViews.push({
                    key,
                    title,
                    ...(placed.scope.elementId
                        ? { elementId: placed.scope.elementId }
                        : {}),
                    content: `${mermaidUrl}/svg/${Buffer.from(source).toString("base64url")}`,
                    properties: { "mermaid.url": mermaidUrl },
                    order: ++order,
                    origin,
                });
                return diagramCard({ type, title, address: viewAddress(key) });
            });
        }
    };

    return { hooks, place };
}

/**
 * The segment a document's diagrams sit under in their keys: a section's id
 * without its extension, or the decision's number.
 */
const documentSlug = ({ document, kind }) =>
    kind === "decision"
        ? `decision-${document.id ?? ""}`
        : sectionId(/** @type {any} */ (document)).replace(
              /\.(md|markdown|adoc|asciidoc)$/i,
              "",
          );

/**
 * Where a diagram came from, for its subtitle on the diagrams page: the
 * document's title and the heading above the block, and the address of
 * that heading in the section, or of the decision.
 *
 * @param {PlacedDocument} placed
 * @param {Heading} heading
 * @param {{ docs: string, decisions: string }} pages
 * @returns {{ title: string, address: string }}
 */
function originOf({ document, kind, scope, title }, heading, pages) {
    const under = heading?.text && heading.text !== title ? heading.text : "";
    const search =
        kind === "decision"
            ? {
                  page: pages.decisions,
                  adr: scopedId(scope.path, String(document.id ?? "")),
              }
            : {
                  page: pages.docs,
                  section: scopedId(
                      scope.path,
                      sectionId(/** @type {any} */ (document)),
                  ),
                  ...(heading?.id ? { subsection: heading.id } : {}),
              };
    return {
        title: under ? `${title} › ${under}` : title,
        address: `#/?${searchOf(search)}`,
    };
}

/**
 * A note in a block's place, saying `message` (HTML), with the block's
 * source: whole when it is short, else its first lines fading out, which a
 * click opens to the whole source.
 *
 * @param {string} message
 * @param {string} source
 * @returns {string}
 */
function sourceNote(message, source) {
    const lines = source.replace(/\s+$/, "").split("\n");
    const code = `<code>${escapeHtml(lines.join("\n"))}</code>`;
    const shown =
        lines.length > PREVIEW_LINES
            ? `<details class="${CLASSES.diagramNoteSource}"><summary title="Show the whole source">${code}</summary></details>`
            : `<pre>${code}</pre>`;
    return `<div class="${CLASSES.diagramNote}" role="note"><p>${message}</p>${shown}</div>\n`;
}

/** The text of a heading's inline token, as markdown-it holds it. */
const inlineText = (inline) =>
    (inline?.children ?? [])
        .filter((child) =>
            ["text", "text_special", "code_inline"].includes(child.type),
        )
        .map((child) => child.content)
        .join("")
        .trim();

/**
 * The markdown-it plugin: each ` ```mermaid ` fence, and each image of the
 * plugin's link, leaves the marker the render's `env.mermaid` gives, with
 * the heading above it. A paragraph holding nothing but one such image
 * stands as its marker.
 *
 * @param {import("markdown-it").default} md
 */
export function mermaidBlocks(md) {
    md.core.ruler.push("doc_mermaid", (state) => {
        /** @type {MermaidBlockHooks | undefined} */
        const hooks = state.env?.mermaid;
        if (!hooks) return;

        /** @type {Heading[]} */
        const headings = [];
        /** @type {Heading} */
        let heading = null;
        state.tokens.forEach((token, index) => {
            if (token.type === "heading_open") {
                heading = {
                    text: inlineText(state.tokens[index + 1]),
                    id: token.attrGet("id"),
                };
            }
            headings[index] = heading;
            if (
                token.type === "fence" &&
                token.info.trim().split(/\s+/)[0].toLowerCase() === "mermaid"
            ) {
                token.type = "html_block";
                token.tag = "";
                token.info = "";
                token.content = `${hooks.block(token.content, heading)}\n`;
            }
        });
        standInForImages(state, (src, index) =>
            hooks.image(src, headings[index] ?? null),
        );
    });
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** The text of `html`, an AsciiDoc title asciidoctor.js converted. */
const plainText = (html) =>
    String(html ?? "")
        .replace(/<[^>]*>/g, "")
        .replace(
            /&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi,
            (entity, dec, hex, name) =>
                dec || hex
                    ? String.fromCodePoint(
                          Number.parseInt(dec ?? hex, dec ? 10 : 16),
                      )
                    : (ENTITIES[name.toLowerCase()] ?? entity),
        )
        .trim();

/** The section an AsciiDoc node sits in, as the heading above it. */
function sectionOf(node) {
    let at = node?.parent;
    while (at && at.context !== "section" && at.context !== "document")
        at = at.parent;
    return at?.context === "section"
        ? { text: plainText(at.title), id: at.id ?? null }
        : null;
}

/** Whether an AsciiDoc literal or listing block holds Mermaid source. */
const isMermaid = (node) =>
    node.style === "mermaid" ||
    (node.style === "source" && node.getAttribute("language") === "mermaid");

/**
 * The asciidoctor.js plugin (`asciidoc.use()`): each `[mermaid]` block, each
 * `[source,mermaid]` block and each image of the plugin's link, block or
 * inline, leaves the marker the render's `env.mermaid` gives, with the
 * section it sits in as its heading.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function mermaidBlocksInAsciiDoc(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_literal(node) {
                    const hooks = this.env.mermaid;
                    return hooks && isMermaid(node)
                        ? hooks.block(node.getSource(), sectionOf(node))
                        : super.convert_literal(node);
                }

                async convert_listing(node) {
                    const hooks = this.env.mermaid;
                    return hooks && isMermaid(node)
                        ? hooks.block(node.getSource(), sectionOf(node))
                        : super.convert_listing(node);
                }

                async convert_image(node) {
                    const html = this.env.mermaid?.image(
                        String(node.getAttribute("target") ?? ""),
                        sectionOf(node),
                    );
                    return html ?? super.convert_image(node);
                }

                async convert_inline_image(node) {
                    const html =
                        (node.type || "image") === "image"
                            ? this.env.mermaid?.image(
                                  String(node.target ?? ""),
                                  sectionOf(node),
                              )
                            : undefined;
                    return html ?? super.convert_inline_image(node);
                }
            },
    );
}
