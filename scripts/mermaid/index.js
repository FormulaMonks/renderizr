/**
 * Reads every image view that carries Mermaid source and gives it a plain
 * `mermaid` model the page draws as a Mermaid diagram (ADR 24): the source
 * comes from the content fields under `mermaid.url`, Mermaid's own parser
 * reads it, and `flowchart.js` turns the result into nodes, edges and
 * subgraphs. `loadWorkspace` runs it, so builds, `pnpm dev` and edit mode
 * all parse the same way.
 *
 * The image view stays where it is, so the drawer, `image <element>` links
 * and Structurizr's own shape are unchanged, and nothing enters the model.
 * A diagram that can't be drawn gets `mermaid.error`, which the page shows
 * in place of the canvas. Every other image view is left alone, with no
 * warning: a picture, inlined Mermaid and every Mermaid type Renderizr
 * doesn't draw.
 */

import { CONTENT_FIELDS, decodeMermaid } from "./decode.js";
import { readFlowchart } from "./flowchart.js";
import { read } from "./parser.js";
import { diagramError, Ignored, NotDrawnYet } from "./warnings.js";

/**
 * The Mermaid types Renderizr draws, by the keyword their source opens with.
 * ERDs and sequence diagrams join as their slices land (spec: Build order).
 */
const DRAWN = /^\s*(flowchart|graph)\b/;

/** Mermaid's YAML frontmatter, which the parser counts no lines of. */
const FRONTMATTER = /^\s*---\n[\s\S]*?\n---\s*\n/;

/**
 * The keyword a source opens with, past its frontmatter, directives and
 * comments, without parsing it, so a source that fails to parse still says
 * whether it is a type Renderizr draws.
 */
function opening(source) {
    const lines = source
        .replace(FRONTMATTER, "")
        .replace(/%%\{[\s\S]*?\}%%/g, "")
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("%%"));
    return lines[0] ?? "";
}

/**
 * The Mermaid source an image view's content fields agree on:
 * `{ source }`, `{ error }` when they carry Mermaid source but can't be
 * drawn from, or `undefined` when they carry none.
 */
function sourceOf(view, mermaidUrl) {
    const filled = CONTENT_FIELDS.filter(
        (field) => typeof view[field] === "string" && view[field].trim(),
    );
    const decoded = filled.map((field) =>
        decodeMermaid(view[field], mermaidUrl),
    );
    if (decoded.every((value) => value === undefined)) return undefined;
    const sources = decoded.filter((value) => typeof value === "string");
    if (sources.length && !DRAWN.test(opening(sources[0]))) return undefined;
    if (decoded.includes(undefined))
        return { error: "the content fields disagree" };
    if (decoded.includes(null))
        return { error: "the image view carries no Mermaid source" };
    const normalized = sources.map((source) => source.replace(/\r\n?/g, "\n"));
    if (normalized.some((source) => source !== normalized[0]))
        return { error: "the content fields disagree" };
    return { source: normalized[0] };
}

/**
 * The parser's message without Jison's noise: no context line, no caret,
 * no list of what it expected. The line counts from the top of `source`,
 * frontmatter included, where the parser counts from below it and puts an
 * early end on the line after the last.
 */
export function parseErrorReason(error, source = "") {
    const message = String(error?.message ?? error);
    const offset = (FRONTMATTER.exec(source)?.[0].match(/\n/g) ?? []).length;
    const at =
        error?.hash?.loc?.first_line ??
        Number(/on line (\d+)/.exec(message)?.[1] ?? Number.NaN);
    const line = Number.isFinite(at) ? at + offset : undefined;
    const context = message
        .split("\n")
        .find((l) => l.startsWith("..."))
        ?.slice(3)
        .trim();
    const token = error?.hash?.token;
    let detail;
    if (token === "EOF" || /got 'EOF'/.test(message)) {
        detail = "the source ends too early";
    } else if (context) {
        detail = `unexpected text after "${context}"`;
    } else {
        detail = message
            .split("\n")[0]
            .replace(/^(Parse|Lexical) error on line \d+[.:]?\s*/, "")
            .replace(/\.$/, "");
    }
    return line
        ? `a parse error at line ${line}: ${detail || "the source isn't valid"}`
        : `a parse error: ${detail}`;
}

/** The model `view` draws from, or `{ error }`; `undefined` for an ordinary image view. */
function readView(view, configuration, warnings) {
    const mermaidUrl =
        view.properties?.["mermaid.url"] ??
        configuration.properties?.["mermaid.url"];
    const found = sourceOf(view, mermaidUrl);
    if (!found) return undefined;
    if (found.error) return { kind: "flowchart", error: found.error };
    let parsed;
    try {
        parsed = read(found.source);
    } catch (error) {
        return {
            kind: "flowchart",
            error: parseErrorReason(error, found.source),
        };
    }
    const ignored = new Ignored();
    let model;
    try {
        model = readFlowchart(parsed.db, ignored);
    } catch (error) {
        if (error instanceof NotDrawnYet)
            return { kind: "flowchart", error: error.message };
        throw error;
    }
    const warning = ignored.warning(view.key);
    if (warning) warnings.push(warning);
    return {
        ...model,
        ...(parsed.title && { title: parsed.title }),
        config: parsed.config ?? {},
    };
}

/**
 * Gives every image view in `workspace` that carries Mermaid source its
 * `mermaid` model, in place. Returns the notices to print, in view order
 * and one per diagram at most: the error of a diagram that can't be drawn,
 * or the ignored-styling warning of one that draws.
 */
export function readMermaidDiagrams(workspace) {
    const views = workspace.views ?? {};
    const configuration = views.configuration ?? {};
    const notices = [];
    for (const view of views.imageViews ?? []) {
        const mermaid = readView(view, configuration, notices);
        if (!mermaid) continue;
        view.mermaid = mermaid;
        if (mermaid.error) notices.push(diagramError(view.key, mermaid.error));
    }
    return notices;
}
