/**
 * PROTOTYPE (wayfinder ticket #331): Mermaid blocks in documentation become
 * Mermaid diagrams on the diagrams page.
 *
 * `collectDocumentationDiagrams` runs before `readMermaidDiagrams`: it finds
 * every ```mermaid fence, and every image link Structurizr's Mermaid
 * documentation plugin writes in its place, in each documentation scope's
 * sections and decisions. A block of a type Renderizr draws becomes an image
 * view whose content encodes its source, so `readMermaidDiagrams` parses it
 * like any other. `writeDocumentationLinks` runs after, and puts a link card
 * (or, for a type Renderizr doesn't draw, a note with a hint of the source)
 * where the block was.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decodeMermaid } from "./decode.js";

const icon = (name) =>
    readFileSync(
        createRequire(import.meta.url).resolve(
            `bootstrap-icons/icons/${name}.svg`,
        ),
        "utf8",
    )
        .trim()
        .replace(/^<svg /, '<svg aria-hidden="true" focusable="false" ')
        .replace(/\n\s*/g, " ");
const DIAGRAM_ICON = icon("diagram-3");

const FENCE = /^(`{3,}|~{3,})[ \t]*mermaid[ \t]*\n([\s\S]*?)\n\1[ \t]*$/gm;
const IMAGE = /!\[[^\]\n]*\]\((\S+?)\)/g;
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t#]*$/gm;
const FRONTMATTER_TITLE =
    /^\s*---\n[\s\S]*?^title:[ \t]*["']?(.+?)["']?[ \t]*$[\s\S]*?\n---/m;

/** The Mermaid types by the keyword their source opens with. */
const KINDS = {
    flowchart: "Flowchart",
    graph: "Flowchart",
    erDiagram: "Entity relationship diagram",
    sequenceDiagram: "Sequence diagram",
};
const UNDRAWN = {
    pie: "pie chart",
    gantt: "Gantt chart",
    classDiagram: "class diagram",
    stateDiagram: "state diagram",
    "stateDiagram-v2": "state diagram",
    journey: "user journey",
    gitGraph: "Git graph",
    mindmap: "mind map",
    timeline: "timeline",
    quadrantChart: "quadrant chart",
    requirementDiagram: "requirement diagram",
    C4Context: "C4 diagram",
    sankey: "Sankey diagram",
    "xychart-beta": "XY chart",
    block: "block diagram",
    "architecture-beta": "architecture diagram",
};

const PLACEHOLDER_URL = "https://mermaid.ink";

const opening = (source) =>
    source
        .replace(/^\s*---\n[\s\S]*?\n---\s*\n/, "")
        .replace(/%%\{[\s\S]*?\}%%/g, "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("%%"))
        ?.split(/[\s;]/)[0] ?? "";

const slug = (text) =>
    String(text)
        .toLowerCase()
        .normalize("NFKC")
        .replace(/\.(md|markdown|adoc|asciidoc)$/, "")
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");

const escapeHtml = (text) =>
    String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/** Every documentation scope: the workspace's, then each element's in model order. */
function* scopes(workspace) {
    yield {
        path: [],
        element: undefined,
        documentation: workspace.documentation,
    };
    for (const system of workspace.model?.softwareSystems ?? []) {
        yield {
            path: [system.name],
            element: system,
            documentation: system.documentation,
        };
        for (const container of system.containers ?? []) {
            yield {
                path: [system.name, container.name],
                element: container,
                documentation: container.documentation,
            };
            for (const component of container.components ?? []) {
                yield {
                    path: [system.name, container.name, component.name],
                    element: component,
                    documentation: component.documentation,
                };
            }
        }
    }
}

/** The title a block's diagram takes: its source's, the heading above it, or the document's. */
function titleOf(source, content, index, documentTitle) {
    const fromSource = FRONTMATTER_TITLE.exec(source)?.[1];
    if (fromSource) return fromSource;
    let heading;
    for (const match of content.slice(0, index).matchAll(HEADING))
        heading = match[1];
    return heading ?? documentTitle;
}

/**
 * Adds an image view per Mermaid block of a type Renderizr draws, and
 * returns what `writeDocumentationLinks` needs to replace each block.
 */
export function collectDocumentationDiagrams(workspace) {
    workspace.views ??= {};
    const views = workspace.views;
    views.imageViews ??= [];
    const imageViews = views.imageViews;
    const mermaidUrl = views.configuration?.properties?.["mermaid.url"];
    const keys = new Set(
        Object.values(views)
            .filter(Array.isArray)
            .flat()
            .map((view) => view.key),
    );
    const pending = [];

    for (const scope of scopes(workspace)) {
        const documents = [
            ...(scope.documentation?.sections ?? []).map((doc) => ({
                doc,
                kind: "section",
            })),
            ...(scope.documentation?.decisions ?? []).map((doc) => ({
                doc,
                kind: "decision",
            })),
        ];
        for (const { doc, kind } of documents) {
            const content = doc.content ?? "";
            const documentTitle =
                doc.title ||
                /^#\s+(.+)$/m.exec(content)?.[1] ||
                doc.filename ||
                doc.id;
            const blocks = [];
            for (const match of content.matchAll(FENCE)) {
                blocks.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    source: match[2],
                });
            }
            for (const match of content.matchAll(IMAGE)) {
                // The plugin's `png` form 404s on mermaid.ink; read it as `img`.
                const url = match[1].replace(/\/png\//, "/img/");
                const source = decodeMermaid(
                    url,
                    mermaidUrl ?? PLACEHOLDER_URL,
                );
                if (typeof source !== "string") continue;
                blocks.push({
                    start: match.index,
                    end: match.index + match[0].length,
                    source,
                    plugin: true,
                });
            }
            blocks.sort((a, b) => a.start - b.start);

            const base = [
                ...scope.path.map(slug),
                kind === "decision"
                    ? `decision-${slug(doc.id)}`
                    : slug(doc.filename ?? doc.title ?? "section"),
            ].join("/");
            blocks.forEach((block, n) => {
                const keyword = opening(block.source);
                const drawn = KINDS[keyword];
                const title = titleOf(
                    block.source,
                    content,
                    block.start,
                    documentTitle,
                );
                let key;
                if (drawn) {
                    key = `${base}/diagram-${n + 1}`;
                    for (let i = 2; keys.has(key); i++)
                        key = `${base}/diagram-${n + 1}-${i}`;
                    keys.add(key);
                    const url = mermaidUrl ?? PLACEHOLDER_URL;
                    imageViews.push({
                        key,
                        title,
                        description: `From the documentation: ${documentTitle}`,
                        ...(scope.element && { elementId: scope.element.id }),
                        content: `${url}/svg/${Buffer.from(block.source).toString("base64")}`,
                        properties: { "mermaid.url": url },
                        order: imageViews.length + 1000,
                    });
                }
                pending.push({
                    doc,
                    block,
                    key,
                    title,
                    kindLabel: drawn,
                    keyword,
                });
            });
        }
    }
    return pending;
}

/** What a reader sees of a source Renderizr doesn't draw: its first lines. */
function hint(source, lines = 4) {
    const all = source.replace(/\s+$/, "").split("\n");
    return all.slice(0, lines).join("\n") + (all.length > lines ? "\n…" : "");
}

function card({ key, title, kindLabel }, view) {
    const error = view?.mermaid?.error;
    return [
        `<div class="rz-diagram-link${error ? " rz-diagram-link--error" : ""}">`,
        `<a href="#/?page=diagrams&view=${encodeURIComponent(key)}">`,
        `<span class="rz-diagram-link__icon">${DIAGRAM_ICON}</span>`,
        `<span class="rz-diagram-link__text">`,
        `<span class="rz-diagram-link__kind">${escapeHtml(kindLabel)}</span>`,
        `<span class="rz-diagram-link__title">${escapeHtml(title)}</span>`,
        error
            ? `<span class="rz-diagram-link__error">Can't be drawn: ${escapeHtml(error)}</span>`
            : "",
        `</span>`,
        `<span class="rz-diagram-link__open">Open in diagrams</span>`,
        `</a>`,
        `</div>`,
    ].join("");
}

function note({ block, keyword }) {
    const name =
        UNDRAWN[keyword] ?? (keyword ? `"${keyword}" diagram` : "diagram");
    return [
        `<div class="rz-diagram-unsupported">`,
        `<p class="rz-diagram-unsupported__label"><strong>Mermaid ${escapeHtml(name)}</strong>: Renderizr draws flowcharts, entity relationship diagrams and sequence diagrams only.</p>`,
        `<pre class="rz-diagram-unsupported__hint"><code>${escapeHtml(hint(block.source))}</code></pre>`,
        `</div>`,
    ].join("");
}

/** Replaces each collected block with its card or note, once the views are read. */
export function writeDocumentationLinks(workspace, pending) {
    const views = new Map(
        (workspace.views?.imageViews ?? []).map((view) => [view.key, view]),
    );
    const byDoc = new Map();
    for (const entry of pending) {
        if (!byDoc.has(entry.doc)) byDoc.set(entry.doc, []);
        byDoc.get(entry.doc).push(entry);
    }
    for (const [doc, entries] of byDoc) {
        let content = doc.content;
        for (const entry of [...entries].sort(
            (a, b) => b.block.start - a.block.start,
        )) {
            const html = entry.key
                ? card(entry, views.get(entry.key))
                : note(entry);
            content = `${content.slice(0, entry.block.start)}\n\n${html}\n\n${content.slice(entry.block.end)}`;
        }
        doc.content = content;
    }
}
