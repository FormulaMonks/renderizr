import {
    AbstractNode,
    Extensions,
    load,
    SyntaxHighlighterBase,
} from "@asciidoctor/core";
import { AsciiDocConverter } from "./asciidoc-converter.js";
import { asciidocCollapsedSections } from "./collapsed-sections.js";
import { asciiDocColorSchemeImages } from "./color-scheme.js";
import { asciidocFootnotes } from "./footnotes.js";
import { embeddedViewsInAsciiDoc } from "./embeds.js";
import { highlight } from "./highlight.js";
import { asciiDocKeys } from "./keys.js";
import { asciiDocMedia } from "./media.js";
import { sanitizeHtml } from "./sanitize.js";
import { asciiDocTaskLists } from "./task-lists.js";

/**
 * Whether `document`, a section or a decision, is AsciiDoc: its `format`
 * says so, or its file name ends in `.adoc`.
 *
 * @param {{ format?: string, filename?: string }} [document]
 * @returns {boolean}
 */
export const isAsciiDoc = ({ format, filename = "" } = {}) =>
    format === "AsciiDoc" || /\.adoc$/i.test(filename);

/**
 * Highlights a source block with the highlight.js Markdown fences go
 * through, in the build. A language highlight.js lacks, or none, stays
 * plain.
 */
class HighlightJs extends SyntaxHighlighterBase {
    handlesHighlighting() {
        return true;
    }

    highlight(_node, source, language) {
        return highlight(source, language) || escapeHtml(source);
    }
}

const escapeHtml = (value) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * An inline passthrough (`pass:[…]`, `+++…+++`) is the author's raw HTML
 * too, but asciidoctor.js puts it back into the text during substitution,
 * where no converter method sees it. So the passthroughs of a document the
 * build renders are sanitized just before asciidoctor.js puts them back,
 * and before their own substitutions run, so the markup those write (a
 * `pass:q[*bold*]`'s `<strong>`) stays whole. A passthrough that escapes its
 * text (`+…+`, `pass:c[…]`) holds no HTML to sanitize. A document rendered
 * by anything else in the process is left alone.
 */
const sanitized = new WeakSet();
const restorePassthroughs = AbstractNode.prototype.restorePassthroughs;
AbstractNode.prototype.restorePassthroughs = function (text) {
    if (this.document?.converter instanceof AsciiDocConverter) {
        for (const pass of this.passthroughs ?? []) {
            if (sanitized.has(pass)) continue;
            sanitized.add(pass);
            if (!pass.subs?.includes("specialcharacters")) {
                pass.text = sanitizeHtml(pass.text);
            }
        }
    }
    return restorePassthroughs.call(this, text);
};

/**
 * The document attributes every render sets. Ids follow GitHub's AsciiDoc
 * ids (no prefix, `-` between words), so links written for GitHub land, and
 * an `xref:` to another file keeps its `.adoc`, for the link resolver to
 * find the section it names. `experimental` turns on the `kbd:` and `menu:`
 * macros. Each ends in `@`, so a document can set its own.
 */
const ATTRIBUTES = Object.freeze({
    experimental: "@",
    idprefix: "@",
    showtitle: "@",
    idseparator: "-@",
    relfilesuffix: ".adoc@",
    "source-highlighter": "renderizr",
});

/**
 * @typedef {typeof AsciiDocConverter} ConverterClass
 * @typedef {(Base: ConverterClass) => ConverterClass} ConverterMixin A
 *   subclass of `Base` overriding the `convert_<name>` methods of what it
 *   renders, calling `super` for the rest.
 * @typedef {(this: import("@asciidoctor/core").Registry) => void} ExtensionGroup
 *   Registers asciidoctor.js extensions (`this.block(…)`,
 *   `this.inlineMacro(…)`, `this.treeProcessor(…)`) for every render.
 */

/**
 * The asciidoctor.js every AsciiDoc section and decision renders through,
 * which a feature extends the way markdown-it takes `md.use()`:
 *
 * ```js
 * asciidoc.use((asciidoc) => {
 *     asciidoc.converter(
 *         (Base) =>
 *             class extends Base {
 *                 async convert_inline_kbd(node) { … }
 *             },
 *     );
 *     asciidoc.extensions(function () {
 *         this.block("mermaid", …);
 *     });
 * });
 * ```
 *
 * `converter()` wraps the HTML5 converter (`asciidoc-converter.js`) in a
 * subclass, and `extensions()` adds an asciidoctor.js extension group.
 */
export function createAsciiDoc() {
    /** @type {ConverterClass} */
    let Converter = AsciiDocConverter;
    /** @type {ExtensionGroup[]} */
    const groups = [];

    const asciidoc = {
        /**
         * Run `plugin` against this asciidoctor.js.
         *
         * @template {unknown[]} O
         * @param {(asciidoc: AsciiDoc, ...options: O) => void} plugin
         * @param {O} options
         */
        use(plugin, ...options) {
            plugin(asciidoc, ...options);
            return asciidoc;
        },
        /** @param {ConverterMixin} mixin */
        converter(mixin) {
            Converter = mixin(Converter);
            return asciidoc;
        },
        /** @param {ExtensionGroup} group */
        extensions(group) {
            groups.push(group);
            return asciidoc;
        },
        /**
         * `source` as HTML, its links and images resolved through `env`.
         *
         * @param {string} source
         * @param {import("./markdown.js").RenderEnv} [env]
         * @returns {Promise<string>}
         */
        async render(source, env = {}) {
            // A registry and a converter of its own for every render, since
            // renders run side by side and each resolves against its own
            // documentation scope.
            const document = await load(source, {
                safe: "secure",
                standalone: false,
                attributes: { ...ATTRIBUTES },
                converter: new Converter("html5", {}, env),
                syntax_highlighters: { renderizr: HighlightJs },
                ...(groups.length
                    ? {
                          extension_registry: Extensions.create(
                              "renderizr",
                              function () {
                                  for (const group of groups) group.call(this);
                              },
                          ),
                      }
                    : {}),
            });
            return document.convert();
        },
    };

    // Media and color-scheme images rewrite the whole rendered document, so
    // they come last: they read the diagram cards embedded views write and
    // the images `convert_image` resolves, fragment and all.
    return asciidoc
        .use(asciidocFootnotes)
        .use(asciidocCollapsedSections)
        .use(embeddedViewsInAsciiDoc)
        .use(asciiDocTaskLists)
        .use(asciiDocKeys)
        .use(asciiDocMedia)
        .use(asciiDocColorSchemeImages);
}

/** @typedef {ReturnType<typeof createAsciiDoc>} AsciiDoc */

/**
 * `source` rendered by `asciidoc` into the HTML the page shows, resolving
 * its links and images through `env`, the way `renderMarkdown` renders
 * Markdown.
 *
 * @param {AsciiDoc} asciidoc
 * @param {string} source
 * @param {import("./markdown.js").RenderEnv} [env]
 * @returns {Promise<string>}
 */
export const renderAsciiDoc = async (asciidoc, source, env = {}) => {
    const html = await asciidoc.render(source, env);
    const trimmed = html.trim();
    return trimmed ? `${trimmed}\n` : "";
};
