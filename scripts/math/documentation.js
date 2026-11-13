/**
 * PROTOTYPE (wayfinder ticket #332): mathematical expressions in documentation.
 *
 * `renderDocumentationMath` runs in `prepareWorkspace` and rewrites the
 * Markdown of every section and decision, in every documentation scope, so
 * each expression arrives at the page already rendered. The page still
 * renders the Markdown with markdown-it, so the rendered math goes in as
 * inline HTML whose text is written as character references: markdown-it
 * passes them through untouched by emphasis, escapes or the typographer.
 *
 * It reads both syntaxes the grilling settled:
 *
 * - GitHub's: `$…$`, $`…`$, `$$…$$` and a ```math fence.
 * - Structurizr's: an inline code span wrapped in dollars (`$…$`) and a
 *   ```katex fence.
 *
 * `RENDERIZR_MATH` picks the renderer: `temml` (MathML, the default),
 * `temml-css` (MathML with Temml's own small stylesheet and font), `katex`
 * (KaTeX's HTML and MathML, with its stylesheet and fonts in the page) or
 * `off` (today's behavior).
 *
 * A real build renders the Markdown itself and reads math from markdown-it's
 * tokens; this scanner only finds code the way markdown-it would for the
 * fixture's cases.
 */

import katex from "katex";
import temml from "temml";

export const MATH_RENDERER = process.env.RENDERIZR_MATH ?? "temml";

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^`\n]*$/;
const MATH_FENCES = new Set(["math", "katex"]);

/** One expression to HTML, or a thrown parse error. */
function render(tex, display) {
    if (MATH_RENDERER === "katex") {
        return katex.renderToString(tex, {
            displayMode: display,
            throwOnError: true,
            output: "htmlAndMathml",
        });
    }
    const math = temml.renderToString(tex, {
        displayMode: display,
        throwOnError: true,
    });
    // A display expression scrolls on its own on a narrow screen rather
    // than pushing the whole page sideways.
    return display ? `<span class="math-display">${math}</span>` : math;
}

/**
 * Make rendered math safe to drop into Markdown: one line, every text node's
 * punctuation as a character reference, and KaTeX's empty struts kept alive
 * past the page's empty-element sweep.
 */
function protect(html) {
    return html
        .replace(/\n/g, " ")
        .replace(/>([^<]+)</g, (_, text) => {
            const safe = text.replace(
                /[\\*_`~[\]()!"'\-.+|{}^=:$%@,?/<>]/g,
                (ch) => `&#${ch.charCodeAt(0)};`,
            );
            return `>${safe}<`;
        })
        .replace(/(<span\b[^>]*>)([\s​]*)(<\/span>)/g, "$1$2<!---->$3");
}

/** Render, or hand back `fallback` and warn when the expression doesn't parse. */
function tryRender(tex, display, fallback, where) {
    try {
        return protect(render(tex, display));
    } catch (error) {
        process.stderr.write(
            `warning: ${where}: math that doesn't parse stays as written: ${String(error.message).split("\n")[0]}\n`,
        );
        return fallback;
    }
}

const isSpace = (ch) => ch === undefined || /\s/.test(ch);

/**
 * Inline math in one paragraph's text, with fenced code already set aside.
 * Code spans stay code unless they are one of the two math spellings.
 */
function renderInline(text, where) {
    let out = "";
    let k = 0;
    // Where in `out` an unescaped `$` sits right before a code span.
    let dollarAt = -1;

    while (k < text.length) {
        const ch = text[k];

        if (ch === "\\" && k + 1 < text.length) {
            out += text.slice(k, k + 2);
            k += 2;
            dollarAt = -1;
            continue;
        }

        if (ch === "`") {
            const run = text.slice(k).match(/^`+/)[0];
            const closeRe = new RegExp(`(?<!\`)${run}(?!\`)`, "g");
            closeRe.lastIndex = k + run.length;
            const close = closeRe.exec(text);
            if (!close) {
                out += run;
                k += run.length;
                dollarAt = -1;
                continue;
            }
            const content = text.slice(k + run.length, close.index);
            const end = close.index + run.length;
            const source = text.slice(k, end);

            // GitHub: $`…`$
            if (dollarAt === out.length - 1 && text[end] === "$") {
                out =
                    out.slice(0, -1) +
                    tryRender(content, false, `$${source}$`, where);
                k = end + 1;
                dollarAt = -1;
                continue;
            }
            // Structurizr: `$…$`
            if (
                /^\$[^$][\s\S]*\$$|^\$[^$]\$$/.test(content) &&
                content.length >= 3
            ) {
                out += tryRender(content.slice(1, -1), false, source, where);
                k = end;
                dollarAt = -1;
                continue;
            }
            out += source;
            k = end;
            dollarAt = -1;
            continue;
        }

        if (ch === "$" && text[k + 1] === "$") {
            const close = findClose(text, k + 2, "$$");
            if (close >= 0) {
                const tex = text.slice(k + 2, close);
                out += tryRender(tex, true, text.slice(k, close + 2), where);
                k = close + 2;
                dollarAt = -1;
                continue;
            }
            out += "$$";
            k += 2;
            dollarAt = -1;
            continue;
        }

        if (ch === "$") {
            // $`…`$ is read when its code span closes.
            if (text[k + 1] === "`") {
                out += "$";
                dollarAt = out.length - 1;
                k += 1;
                continue;
            }
            // Pandoc's rule, which GitHub's matches: no space inside either
            // dollar, and no digit right after the closing one, so prose like
            // "$5 to $10" stays text.
            if (!isSpace(text[k + 1])) {
                const close = findInlineClose(text, k + 1);
                if (close >= 0) {
                    const tex = text.slice(k + 1, close);
                    out += tryRender(
                        tex,
                        false,
                        text.slice(k, close + 1),
                        where,
                    );
                    k = close + 1;
                    dollarAt = -1;
                    continue;
                }
            }
        }

        out += ch;
        k += 1;
        dollarAt = -1;
    }

    return out;
}

function findClose(text, from, marker) {
    for (let k = from; k < text.length; k++) {
        if (text[k] === "\\") {
            k++;
            continue;
        }
        if (text.startsWith(marker, k)) return k;
    }
    return -1;
}

function findInlineClose(text, from) {
    for (let k = from; k < text.length; k++) {
        const ch = text[k];
        if (ch === "\\") {
            k++;
            continue;
        }
        if (ch === "\n" && text[k + 1] === "\n") return -1;
        if (ch !== "$") continue;
        if (isSpace(text[k - 1])) continue;
        if (/\d/.test(text[k + 1] ?? "")) continue;
        return k;
    }
    return -1;
}

/** One section's or decision's Markdown, with every expression rendered. */
export function renderMarkdownMath(markdown, where = "documentation") {
    const lines = markdown.split("\n");
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const fence = lines[i].match(FENCE_OPEN);
        if (fence) {
            const [, indent, marker, info] = fence;
            const closeRe = new RegExp(
                `^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`,
            );
            let j = i + 1;
            while (j < lines.length && !closeRe.test(lines[j])) j++;
            const block = lines.slice(i, j + 1);
            if (MATH_FENCES.has(info.toLowerCase())) {
                const tex = lines.slice(i + 1, j).join("\n");
                const html = tryRender(tex, true, null, where);
                out.push(...(html === null ? block : [`${indent}${html}`]));
            } else {
                out.push(...block);
            }
            i = j + 1;
            continue;
        }

        // An indented code block after a blank line stays code.
        if (
            /^( {4}|\t)/.test(lines[i]) &&
            (i === 0 || lines[i - 1].trim() === "")
        ) {
            while (
                i < lines.length &&
                (/^( {4}|\t)/.test(lines[i]) || lines[i].trim() === "")
            ) {
                out.push(lines[i]);
                i++;
            }
            continue;
        }

        let j = i;
        while (
            j < lines.length &&
            lines[j].trim() !== "" &&
            !FENCE_OPEN.test(lines[j])
        )
            j++;
        if (j === i) {
            out.push(lines[i]);
            i++;
            continue;
        }
        out.push(renderInline(lines.slice(i, j).join("\n"), where));
        i = j;
    }

    return out.join("\n");
}

/** Every documentation scope's documentation. */
function* documentations(workspace) {
    yield workspace.documentation;
    for (const system of workspace.model?.softwareSystems ?? []) {
        yield system.documentation;
        for (const container of system.containers ?? []) {
            yield container.documentation;
            for (const component of container.components ?? []) {
                yield component.documentation;
            }
        }
    }
}

const isAsciiDoc = (doc) =>
    /asciidoc/i.test(doc.format ?? "") ||
    /\.(adoc|asciidoc)$/i.test(doc.filename ?? "");

/** Render the math in every Markdown section and decision of `workspace`. */
export function renderDocumentationMath(workspace) {
    if (MATH_RENDERER === "off") return;

    for (const documentation of documentations(workspace)) {
        for (const section of documentation?.sections ?? []) {
            if (isAsciiDoc(section)) continue;
            section.content = renderMarkdownMath(
                section.content,
                section.filename,
            );
        }
        for (const decision of documentation?.decisions ?? []) {
            if (isAsciiDoc(decision)) continue;
            decision.content = renderMarkdownMath(
                decision.content,
                `decision ${decision.id}`,
            );
        }
    }
}
