import AsciiMathParser from "asciimath2tex";
import temml from "temml";
import { CLASSES } from "./classes.js";

/**
 * Math in documentation (ADR 31): Temml writes each expression as MathML in
 * the build, and the browser draws it with its own math font, so it follows
 * both color schemes and `--font` leaves it alone. The page adds Temml's
 * stylesheet and font with the documentation runtime.
 *
 * - `markdownMath`, a markdown-it plugin: GitHub's `$…$`, `` $`…`$ ``,
 *   `$$…$$` and ` ```math `, and Structurizr's `` `$…$` `` and
 *   ` ```katex `.
 * - `asciidocMath`, an asciidoctor.js plugin: `latexmath:[…]`, `stem:[…]`,
 *   `asciimath:[…]` and the `[stem]`, `[latexmath]` and `[asciimath]`
 *   blocks. AsciiMath goes through asciimath2tex to LaTeX first.
 *
 * An expression that fails to parse stays as written, and the render warns
 * once for it through the `warnMath` of its `env` (`mathWarnings`).
 */

/**
 * Reports that the expression `source` stays as written, since `error`
 * stopped it.
 *
 * @typedef {(source: string, error: unknown) => void} MathWarnings
 */

/**
 * What a render reports a formula that fails to parse through: each
 * expression once, to `warn`, the way `renderDocumentation` reports a Mermaid
 * block. Make one per render of the documentation, so `pnpm dev` warns again
 * after a reload; a set shared by the whole process went quiet after the
 * first.
 *
 * @param {(message: string) => void} warn
 * @returns {MathWarnings}
 */
export function mathWarnings(warn) {
    const warned = new Set();
    return (source, error) => {
        if (warned.has(source)) return;
        warned.add(source);
        const reason = String(/** @type {any} */ (error)?.message ?? error)
            .split("\n")[0]
            .trim();
        warn(
            `math that does not parse stays as written: ${source} (${reason})`,
        );
    };
}

/**
 * `tex` as MathML, or `null` when it fails to parse. `source` is the
 * expression as the author wrote it, for `warn`.
 *
 * @param {string} tex
 * @param {{ display?: boolean, source?: string, warn?: MathWarnings | null }} [options]
 * @returns {string | null}
 */
export function renderMath(
    tex,
    { display = false, source = tex, warn = null } = {},
) {
    try {
        return temml.renderToString(tex, {
            displayMode: display,
            throwOnError: true,
        });
    } catch (error) {
        warn?.(source, error);
        return null;
    }
}

/** The AsciiMath parser, made on first use. */
let asciiMath = null;

/** AsciiMath `source` as MathML, through LaTeX, or `null`. */
function renderAsciiMath(source, display, warn) {
    asciiMath ??= new AsciiMathParser();
    let tex;
    try {
        tex = asciiMath.parse(source);
    } catch (error) {
        warn?.(source, error);
        return null;
    }
    return renderMath(tex, { display, source, warn });
}

/** A display expression in the block that scrolls it on a narrow screen. */
const displayBlock = (math, tag = "div", attributes = "") =>
    `<${tag}${attributes} class="${CLASSES.mathDisplay}">${math}</${tag}>`;

/* -------------------------------------------------------------- Markdown */

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;
const BACKTICK = 0x60;

const isSpace = (code) =>
    code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
const isDigit = (code) => code >= 0x30 && code <= 0x39;

/** The length of the run of backticks at `pos` of `src`. */
function backtickRun(src, pos, max) {
    let end = pos;
    while (end < max && src.charCodeAt(end) === BACKTICK) end++;
    return end - pos;
}

/**
 * Where the code span opening with the `length` backticks at `pos` closes:
 * the position just past its closing run, or -1 when none closes it.
 */
function codeSpanEnd(src, pos, length, max) {
    let at = pos + length;
    while (at < max) {
        if (src.charCodeAt(at) !== BACKTICK) {
            at++;
            continue;
        }
        const run = backtickRun(src, at, max);
        if (run === length) return at + run;
        at += run;
    }
    return -1;
}

/**
 * `` $`…`$ ``, GitHub's code-span spelling, opening at `pos`.
 *
 * @returns {{ tex: string, end: number } | null}
 */
function backtickMath(src, pos, max) {
    const length = backtickRun(src, pos + 1, max);
    const end = codeSpanEnd(src, pos + 1, length, max);
    if (end < 0 || src.charCodeAt(end) !== DOLLAR) return null;
    const tex = src.slice(pos + 1 + length, end - length).trim();
    return tex ? { tex, end: end + 1 } : null;
}

/**
 * `$$…$$`, a display expression, opening at `pos`. A `\$` inside it is the
 * expression's own dollar.
 *
 * @returns {{ tex: string, end: number } | null}
 */
function displayMath(src, pos, max) {
    for (let at = pos + 2; at < max - 1; at++) {
        const code = src.charCodeAt(at);
        if (code === BACKSLASH) at++;
        else if (code === DOLLAR && src.charCodeAt(at + 1) === DOLLAR) {
            const tex = src.slice(pos + 2, at).trim();
            return tex ? { tex, end: at + 2 } : null;
        }
    }
    return null;
}

/**
 * Whether `src` holds an escaped backtick, `` \` ``, at `at`. GitHub writes a
 * dollar beside a backtick as text by escaping the backtick ("uses $\` and
 * \`$ delimiters"), so `` $` `` and `` `$ `` read as text and not as the
 * delimiters of `` $`…`$ ``. TeX has no use for `` \` `` in math, so no
 * expression loses by it.
 */
const escapedBacktick = (src, at) =>
    src.charCodeAt(at) === BACKSLASH && src.charCodeAt(at + 1) === BACKTICK;

/**
 * `$…$`, opening at `pos`, by Pandoc's rule, which GitHub's matches: no
 * space just inside either dollar and no digit right after the closing one,
 * so "$5 a month, or $50 a year" and "$5-$10" stay text. A `\$` is the
 * expression's own dollar, and a code span between the dollars keeps them
 * apart. An escaped backtick just inside either dollar keeps the dollars
 * text too, as `escapedBacktick` says.
 *
 * @returns {{ tex: string, end: number } | null}
 */
function dollarMath(src, pos, max) {
    if (pos + 1 >= max || isSpace(src.charCodeAt(pos + 1))) return null;
    if (escapedBacktick(src, pos + 1)) return null;
    for (let at = pos + 1; at < max; at++) {
        const code = src.charCodeAt(at);
        if (code === BACKSLASH) {
            at++;
        } else if (code === BACKTICK) {
            const length = backtickRun(src, at, max);
            const end = codeSpanEnd(src, at, length, max);
            if (end >= 0) return null;
            at += length - 1;
        } else if (
            code === DOLLAR &&
            !isSpace(src.charCodeAt(at - 1)) &&
            !isDigit(src.charCodeAt(at + 1)) &&
            !escapedBacktick(src, at - 2)
        ) {
            return { tex: src.slice(pos + 1, at), end: at + 1 };
        }
    }
    return null;
}

/**
 * The inline rule: an expression in GitHub's spellings, read where a `$`
 * starts it. One that fails to parse is left to the rules after this one,
 * so it reads as the prose it was written as.
 *
 * @param {import("markdown-it/lib/rules_inline/state_inline.mjs").default} state
 * @param {boolean} silent
 */
function mathInline(state, silent) {
    const { src, pos, posMax: max } = state;
    if (src.charCodeAt(pos) !== DOLLAR) return false;

    const next = src.charCodeAt(pos + 1);
    const display = next === DOLLAR;
    const found =
        next === BACKTICK
            ? backtickMath(src, pos, max)
            : display
              ? displayMath(src, pos, max)
              : dollarMath(src, pos, max);
    if (!found) return false;

    const html = renderMath(found.tex, {
        display,
        source: src.slice(pos, found.end),
        warn: state.env?.warnMath,
    });
    if (html === null) return false;

    if (!silent) {
        const token = state.push("math_inline", "math", 0);
        token.content = found.tex;
        token.meta = { html, display };
    }
    state.pos = found.end;
    return true;
}

/** Structurizr's `` `$…$` ``: a code span wrapped in dollars. */
const STRUCTURIZR_INLINE = /^\$([^$][\s\S]*)\$$/;

/**
 * The core rule after `inline`: Structurizr's `` `$…$` `` code spans become
 * math, and a paragraph holding nothing but a `$$…$$` expression becomes
 * its display block.
 *
 * @param {import("markdown-it/lib/rules_core/state_core.mjs").default} state
 */
function mathTokens(state) {
    state.tokens.forEach((block, index) => {
        if (block.type !== "inline" || !block.children) return;

        for (const token of block.children) {
            if (token.type !== "code_inline") continue;
            const tex = token.content.match(STRUCTURIZR_INLINE)?.[1];
            if (!tex?.trim()) continue;
            const html = renderMath(tex, {
                source: `${token.markup}${token.content}${token.markup}`,
                warn: state.env?.warnMath,
            });
            if (html === null) continue;
            token.type = "math_inline";
            token.tag = "math";
            token.content = tex;
            token.meta = { html, display: false };
        }

        const open = state.tokens[index - 1];
        const close = state.tokens[index + 1];
        const content = block.children.filter(
            (token) =>
                !(token.type === "softbreak" || token.type === "hardbreak") &&
                !(token.type === "text" && !token.content.trim()),
        );
        if (
            open?.type === "paragraph_open" &&
            close?.type === "paragraph_close" &&
            content.length === 1 &&
            content[0].type === "math_inline" &&
            content[0].meta.display
        ) {
            open.hidden = true;
            close.hidden = true;
            block.children = content;
            content[0].block = true;
        }
    });
}

/** The fence languages that hold a display expression. */
const MATH_FENCES = new Set(["math", "katex"]);

/**
 * Math for markdown-it, in GitHub's and Structurizr's spellings, read from
 * markdown-it's tokens so code, indented code and heading slugs stay
 * right. A ` ```math ` or ` ```katex ` fence that fails to parse stays the
 * code block it was written as.
 *
 * @param {import("markdown-it").default} md
 */
export function markdownMath(md) {
    md.inline.ruler.after("escape", "math_inline", mathInline);
    md.core.ruler.after("inline", "math_tokens", mathTokens);

    md.renderer.rules.math_inline = (tokens, index) => {
        const { meta, block } = tokens[index];
        if (block) return `${displayBlock(meta.html)}\n`;
        return meta.display ? displayBlock(meta.html, "span") : meta.html;
    };

    const fence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, index, options, env, self) => {
        const token = tokens[index];
        const language = token.info.trim().split(/\s+/)[0].toLowerCase();
        if (MATH_FENCES.has(language)) {
            const tex = token.content.trim();
            const html =
                tex && renderMath(tex, { display: true, warn: env?.warnMath });
            if (html) return `${displayBlock(html)}\n`;
        }
        return fence
            ? fence(tokens, index, options, env, self)
            : self.renderToken(tokens, index, options);
    };
}

/* -------------------------------------------------------------- AsciiDoc */

/** The text asciidoctor.js escaped, as the author wrote it. */
const unescapeHtml = (value) =>
    value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

const escapeHtml = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * An AsciiDoc expression of `type` (`latexmath` or `asciimath`) as MathML,
 * or `null`, reported to `warn`. LaTeX delimiters an author wrapped a block
 * in are dropped.
 */
function renderStem(source, type, display, warn) {
    if (type === "asciimath") return renderAsciiMath(source, display, warn);
    const tex = source
        .trim()
        .replace(/^\\\[([\s\S]*)\\\]$/, "$1")
        .replace(/^\\\(([\s\S]*)\\\)$/, "$1");
    return renderMath(tex, { display, source, warn });
}

/**
 * Math for asciidoctor.js: a converter of Renderizr's own renders the
 * inline macros and the stem blocks with Temml. The document's `:stem:`
 * attribute picks what `stem` reads, AsciiMath when it names none.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciidocMath(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_inline_quoted(node) {
                    if (node.type !== "latexmath" && node.type !== "asciimath")
                        return super.convert_inline_quoted(node);
                    const source = unescapeHtml(String(node.text ?? ""));
                    return (
                        renderStem(
                            source,
                            node.type,
                            false,
                            this.env.warnMath,
                        ) ?? node.text
                    );
                }

                async convert_stem(node) {
                    const source = unescapeHtml((await node.content()) ?? "");
                    const id = node.id != null ? ` id="${node.id}"` : "";
                    const title = node.hasTitle()
                        ? `<div class="title">${node.title}</div>\n`
                        : "";
                    const html = renderStem(
                        source,
                        node.style,
                        true,
                        this.env.warnMath,
                    );
                    return html === null
                        ? `${title}<pre${id}><code>${escapeHtml(source)}</code></pre>`
                        : `${title}${displayBlock(html, "div", id)}`;
                }
            },
    );
}
