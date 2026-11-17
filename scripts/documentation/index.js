/**
 * The build step that renders documentation (ADR 31): every section and
 * decision of every documentation scope, rendered to HTML once in
 * `prepareWorkspace`, for every mode. The page receives the HTML in place of
 * the source and only reads it.
 *
 * - `markdown.js`: the markdown-it every render goes through, which a
 *   plugin extends with `md.use()`, and the per-render `env` holding the
 *   documentation scope's resolvers.
 * - `links.js` and `images.js`: the link and image resolvers.
 * - `highlight.js`: the highlight.js that colors fenced code.
 * - `sanitize.js`: the sanitizer of the author's raw HTML.
 * - `alerts.js`: GitHub's alerts.
 * - `asciidoc.js`: the asciidoctor.js every AsciiDoc render goes through,
 *   which a plugin extends with `asciidoc.use()`, and
 *   `asciidoc-converter.js`, its HTML5 converter, which writes the markup
 *   the Markdown path writes.
 * - `classes.js`: the class names the rendered HTML carries.
 * - `embeds.js`: embedded views, shown as the diagram cards
 *   `diagram-card.js` writes.
 */

import {
    documentationScopes,
    placeElements,
} from "../../src/model/documentation-scopes.js";
import { createAsciiDoc, isAsciiDoc, renderAsciiDoc } from "./asciidoc.js";
import { createEmbedResolver } from "./embeds.js";
import { createImageResolver } from "./images.js";
import { createLinkResolver } from "./links.js";
import { createMarkdown, renderMarkdown } from "./markdown.js";

export { createAsciiDoc, isAsciiDoc, renderAsciiDoc } from "./asciidoc.js";
export { CLASSES } from "./classes.js";
export { diagramCard, diagramNote, viewAddress } from "./diagram-card.js";
export { createMarkdown, renderMarkdown } from "./markdown.js";

/** The page each kind of document shows on, as the page's routes name it. */
export const DOCS_PAGE = "docs";
export const DECISIONS_PAGE = "adrs";

/**
 * The status words a decision's `## Status` block may hold on its own,
 * which the decision's status pill already shows. They are the keys of
 * `DECISION_STATUS` in `src/model/decisions.ts`, and a test fails if the two
 * drift apart.
 */
export const STATUS_WORDS = Object.freeze([
    "draft",
    "proposed",
    "accepted",
    "amended",
    "superseded",
    "rejected",
    "deprecated",
]);

const BARE_STATUS = new RegExp(`^(${STATUS_WORDS.join("|")})\\.?$`, "i");

/**
 * What a section is called: its own title, else its first `#` heading (`=`
 * in AsciiDoc), else its file name with the number and the extension gone
 * ("0001-record-architecture-decisions.md" becomes "Record Architecture
 * Decisions").
 *
 * @param {{ title?: string, filename?: string, content?: string }} section
 * @returns {string}
 */
export function sectionTitle(section) {
    const content = section.content ?? "";
    return (
        section.title ||
        (isAsciiDoc(section)
            ? content.match(/^=\s+(.+)$/m)?.[1]
            : content.match(/^#\s+(.+)$/m)?.[1]
        )?.trim() ||
        (section.filename ?? "")
            .replace(/\.[a-z]+$/i, "")
            .replace(/^\d+[-_. ]*/, "")
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (match) => match.toUpperCase())
    );
}

/**
 * What a decision is called: its own title, else its first heading without
 * the number the page already shows (`# 3. Use Kafka` gives "Use Kafka",
 * and so does AsciiDoc's `= 3. Use Kafka`).
 *
 * @param {{ title?: string, format?: string, content?: string }} decision
 * @returns {string}
 */
export function decisionTitle(decision) {
    if (decision.title) return decision.title;
    const heading = (decision.content ?? "").match(
        isAsciiDoc(decision) ? /^={1,6}\s+(.+)$/m : /^#{1,6}\s+(.+)$/m,
    )?.[1];
    return heading?.replace(/^\d+[.:]?\s+/, "").trim() ?? "";
}

/** The notes of a `Status` block, without the bare status word. */
const statusNotes = (block) =>
    block
        .replace(/[​-‍﻿]/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !BARE_STATUS.test(line));

/**
 * A decision's source as the decisions page shows it: the title and the
 * date leave, since the page shows both above the body, and the `## Status`
 * block (`== Status` in AsciiDoc) keeps only the notes beside the status
 * word, which the status pill shows. "Amends 15." and "Amended by 39." each
 * keep a line of their own.
 *
 * @param {string} content
 * @param {{ asciidoc?: boolean }} [options] Whether `content` is AsciiDoc.
 * @returns {string}
 */
export function formatDecision(content, { asciidoc = false } = {}) {
    if (asciidoc) {
        return content
            .replace(/^=[ \t].*$/m, "")
            .replace(/Date:.*/, "")
            .replace(/^== Status([\s\S]*?)^== Context/gim, (__, hit) => {
                const notes = statusNotes(hit);
                // A quote block, each note ending in a hard break ` +`.
                return notes.length
                    ? `____\n${notes.join(" +\n")}\n____\n\n== Context`
                    : "== Context";
            });
    }
    return content
        .replace(/#(.*)/, "")
        .replace(/Date:.*/, "")
        .replace(/## Status([\s\S]*?)## Context/gim, (__, hit) => {
            const notes = statusNotes(hit);
            // Markdown folds consecutive quoted lines into one paragraph,
            // so each needs a hard break — a trailing backslash — to stay
            // where it was put.
            return notes.length
                ? `${notes.map((line) => `> ${line}`).join("\\\n")}\n\n## Context`
                : "## Context";
        });
}

/** The markdown-it the build renders with, made on first use. */
let shared = null;
const sharedMarkdown = () => {
    shared ??= createMarkdown();
    return shared;
};

/** The asciidoctor.js the build renders with, made on first use. */
let sharedAscii = null;
const sharedAsciiDoc = () => {
    sharedAscii ??= createAsciiDoc();
    return sharedAscii;
};

/**
 * What one document renders against: the markdown-it, the asciidoctor.js,
 * and the link and image resolvers of its documentation scope.
 *
 * @typedef {object} RenderContext
 * @property {import("markdown-it").default} [md]
 * @property {import("./asciidoc.js").AsciiDoc} [asciidoc]
 * @property {import("./links.js").LinkResolver | null} [resolveLink]
 * @property {import("./images.js").ImageResolver | null} [resolveImage]
 * @property {import("./embeds.js").EmbedResolver | null} [resolveEmbed]
 */

/**
 * `source` as HTML: through asciidoctor.js when `document` is AsciiDoc, else
 * through markdown-it.
 *
 * @param {{ format?: string, filename?: string }} document
 * @param {string} source
 * @param {RenderContext} context
 * @returns {Promise<string>}
 */
async function render(
    document,
    source,
    {
        md = sharedMarkdown(),
        asciidoc = sharedAsciiDoc(),
        resolveLink = null,
        resolveImage = null,
        resolveEmbed = null,
    },
) {
    const env = { resolveLink, resolveImage, resolveEmbed };
    return isAsciiDoc(document)
        ? renderAsciiDoc(asciidoc, source, env)
        : renderMarkdown(md, source, env);
}

/**
 * A section's HTML, from Markdown or AsciiDoc. A section with no content
 * renders to nothing.
 *
 * @param {{ format?: string, filename?: string, content?: string }} section
 * @param {RenderContext} [context]
 * @returns {Promise<string>}
 */
export async function renderSection(section, context = {}) {
    const content = section.content ?? "";
    if (!content.trim()) return "";
    return render(section, content, context);
}

/**
 * A decision's HTML: its source formatted for the decisions page, then
 * rendered from Markdown or AsciiDoc.
 *
 * @param {{ format?: string, filename?: string, content?: string }} decision
 * @param {RenderContext} [context]
 * @returns {Promise<string>}
 */
export async function renderDecision(decision, context = {}) {
    const content = decision.content ?? "";
    if (!content.trim()) return "";
    const asciidoc = isAsciiDoc(decision);
    return render(decision, formatDecision(content, { asciidoc }), context);
}

/**
 * Render every section and decision of every documentation scope of
 * `workspace` to HTML, in place: each one's `content` becomes its HTML and
 * its `title` the title the page shows. Links resolve against `workspace`
 * alone, in the document's own scope first; images against the scope's
 * embedded copies, then the workspace's. The embedded copies then leave the
 * payload: the HTML carries each image it shows, and the page reads no
 * other. Documents render side by side, since asciidoctor.js converts
 * asynchronously. Changes `workspace` and resolves to it.
 *
 * @template {object} W
 * @param {W} workspace
 * @param {{
 *   md?: import("markdown-it").default,
 *   asciidoc?: import("./asciidoc.js").AsciiDoc,
 * }} [options]
 * @returns {Promise<W>}
 */
export async function renderDocumentation(
    workspace,
    { md = sharedMarkdown(), asciidoc = sharedAsciiDoc() } = {},
) {
    const scopes = documentationScopes(workspace);
    if (!scopes.length) return workspace;

    const {
        sections = [],
        decisions = [],
        images = [],
    } = workspace.documentation ?? {};
    const resolveLink = createLinkResolver({
        docs: scopes.some((scope) => scope.sections.length)
            ? { page: DOCS_PAGE, sections, scopes }
            : null,
        decisions: scopes.some((scope) => scope.decisions.length)
            ? { page: DECISIONS_PAGE, decisions, scopes }
            : null,
    });
    const workspaceImages = createImageResolver(images);
    // Every documentation scope embeds the views of the workspace itself.
    const resolveEmbed = createEmbedResolver(workspace);

    /** @type {Promise<void>[]} */
    const renders = [];
    for (const scope of scopes) {
        // An element's documents show its own images first, then the
        // workspace's.
        const resolveImage = scope.path
            ? createImageResolver(scope.images, images)
            : workspaceImages;

        for (const section of scope.sections) {
            const title = sectionTitle(section);
            renders.push(
                renderSection(section, {
                    md,
                    asciidoc,
                    resolveLink: resolveLink("docs", scope.path),
                    resolveImage,
                    resolveEmbed,
                }).then((html) => {
                    section.content = html;
                    section.title = title;
                }),
            );
        }
        for (const decision of scope.decisions) {
            const title = decisionTitle(decision);
            renders.push(
                renderDecision(decision, {
                    md,
                    asciidoc,
                    resolveLink: resolveLink("decisions", scope.path),
                    resolveImage,
                    resolveEmbed,
                }).then((html) => {
                    decision.content = html;
                    decision.title = title;
                }),
            );
        }
    }
    await Promise.all(renders);

    for (const documentation of [
        workspace.documentation,
        ...placeElements(workspace).placed.map(
            ({ element }) => element.documentation,
        ),
    ])
        if (documentation) delete documentation.images;

    return workspace;
}
