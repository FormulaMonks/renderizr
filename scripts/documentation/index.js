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
 * - `alerts.js`: GitHub's alerts.
 * - `asciidoc.js`: the hand-written AsciiDoc pass.
 * - `classes.js`: the class names the rendered HTML carries.
 */

import {
    documentationScopes,
    placeElements,
} from "../../src/model/documentation-scopes.js";
import { asciidocToMarkdown, isAsciiDoc } from "./asciidoc.js";
import { createImageResolver } from "./images.js";
import { createLinkResolver } from "./links.js";
import { createMarkdown, renderMarkdown } from "./markdown.js";

export { CLASSES } from "./classes.js";
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
        (isAsciiDoc(section.filename)
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
 * the number the page already shows (`# 3. Use Kafka` gives "Use Kafka").
 *
 * @param {{ title?: string, content?: string }} decision
 * @returns {string}
 */
export function decisionTitle(decision) {
    if (decision.title) return decision.title;
    const heading = (decision.content ?? "").match(/^#{1,6}\s+(.+)$/m)?.[1];
    return heading?.replace(/^\d+[.:]?\s+/, "").trim() ?? "";
}

/**
 * A decision's Markdown as the decisions page shows it: the title and the
 * date leave, since the page shows both above the body, and the `## Status`
 * block keeps only the notes beside the status word, which the status pill
 * shows. "Amends 15." and "Amended by 39." each keep a line of their own.
 *
 * @param {string} content
 * @returns {string}
 */
export function formatDecision(content) {
    return content
        .replace(/#(.*)/, "")
        .replace(/Date:.*/, "")
        .replace(/## Status([\s\S]*?)## Context/gim, (__, hit) => {
            const notes = hit
                .replace(/[​-‍﻿]/g, "")
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line && !BARE_STATUS.test(line));

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

/**
 * What one document renders against: the markdown-it, and the link and
 * image resolvers of its documentation scope.
 *
 * @typedef {object} RenderContext
 * @property {import("markdown-it").default} [md]
 * @property {import("./links.js").LinkResolver | null} [resolveLink]
 * @property {import("./images.js").ImageResolver | null} [resolveImage]
 */

/**
 * A section's HTML: AsciiDoc through the hand-written pass first, then
 * markdown-it. A section with no content renders to nothing.
 *
 * @param {{ filename?: string, content?: string }} section
 * @param {RenderContext} [context]
 * @returns {string}
 */
export function renderSection(
    section,
    { md = sharedMarkdown(), resolveLink = null, resolveImage = null } = {},
) {
    const content = section.content ?? "";
    if (!content.trim()) return "";
    const source = isAsciiDoc(section.filename)
        ? asciidocToMarkdown(content)
        : content;
    return renderMarkdown(md, source, { resolveLink, resolveImage });
}

/**
 * A decision's HTML: its Markdown formatted for the decisions page, then
 * markdown-it.
 *
 * @param {{ content?: string }} decision
 * @param {RenderContext} [context]
 * @returns {string}
 */
export function renderDecision(
    decision,
    { md = sharedMarkdown(), resolveLink = null, resolveImage = null } = {},
) {
    const content = decision.content ?? "";
    if (!content.trim()) return "";
    return renderMarkdown(md, formatDecision(content), {
        resolveLink,
        resolveImage,
    });
}

/**
 * Render every section and decision of every documentation scope of
 * `workspace` to HTML, in place: each one's `content` becomes its HTML and
 * its `title` the title the page shows. Links resolve against `workspace`
 * alone, in the document's own scope first; images against the scope's
 * embedded copies, then the workspace's. The embedded copies then leave the
 * payload: the HTML carries each image it shows, and the page reads no
 * other. Changes `workspace` and returns it.
 *
 * @template {object} W
 * @param {W} workspace
 * @param {{ md?: import("markdown-it").default }} [options]
 * @returns {W}
 */
export function renderDocumentation(workspace, { md = sharedMarkdown() } = {}) {
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

    for (const scope of scopes) {
        // An element's documents show its own images first, then the
        // workspace's.
        const resolveImage = scope.path
            ? createImageResolver(scope.images, images)
            : workspaceImages;

        for (const section of scope.sections) {
            const title = sectionTitle(section);
            section.content = renderSection(section, {
                md,
                resolveLink: resolveLink("docs", scope.path),
                resolveImage,
            });
            section.title = title;
        }
        for (const decision of scope.decisions) {
            const title = decisionTitle(decision);
            decision.content = renderDecision(decision, {
                md,
                resolveLink: resolveLink("decisions", scope.path),
                resolveImage,
            });
            decision.title = title;
        }
    }

    for (const documentation of [
        workspace.documentation,
        ...placeElements(workspace).placed.map(
            ({ element }) => element.documentation,
        ),
    ])
        if (documentation) delete documentation.images;

    return workspace;
}
