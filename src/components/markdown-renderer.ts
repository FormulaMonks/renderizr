import Component from "./_component";
import markdownIt from "markdown-it";
// @ts-ignore
import shiftHeadings from "markdown-it-shift-headings";
import anchor from "markdown-it-anchor";
// `highlight.js/lib/common` registers 34 languages for roughly 150KB. These are
// the ones that actually turn up in architecture documentation.
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
// No highlight.js stylesheet is imported on purpose: every shipped theme is
// hardcoded to one color scheme. The `hljs-*` token colors live in the module
// CSS instead, where they follow `data-theme`.
import alerts from "./markdown-alerts";
import styles from "./markdown-renderer.module.css";

for (const [name, language] of Object.entries({
    bash,
    css,
    java,
    javascript,
    json,
    markdown,
    python,
    sql,
    typescript,
    xml,
    yaml,
})) {
    hljs.registerLanguage(name, language);
}

/**
 * Empty element pairs left behind by the source markdown (`<p></p>`,
 * `<em></em>`, …) are stripped from the rendered output. The tag list is
 * deliberately explicit and the closing tag is a backreference: structural
 * markup (empty table cells, the table and alert wrappers, inline SVG icons)
 * has to survive even when it looks "empty".
 */
const EMPTY_ELEMENT_PATTERN =
    // biome-ignore lint/suspicious/noMisleadingCharacterClass: zero-width characters are intentionally matched as whitespace
    /<(p|h[1-6]|em|strong|b|i|s|small|span|a|ul|ol|li|blockquote)(?:\s[^>]*)?>[\s\u200B-\u200D\uFEFF]*<\/\1\s*>/gi;

export default class MarkdownRenderer extends Component {
    #markdownContent = "";
    #md = markdownIt({
        html: true,
        typographer: true,
        highlight: (str: string, lang?: string) => {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(str, { language: lang }).value;
                } catch (__) {}
            }

            return ""; // use external default escaping
        },
    })
        .use(shiftHeadings)
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
            alert: styles.alert,
            title: styles.alertTitle,
            note: styles.alertNote,
            tip: styles.alertTip,
            important: styles.alertImportant,
            warning: styles.alertWarning,
            caution: styles.alertCaution,
        });

    constructor(element: HTMLElement | null = null) {
        super(element);

        // Every table gets its own scroll container, so a seven-column table
        // scrolls inside the prose measure instead of dragging the whole page
        // sideways with it.
        this.#md.renderer.rules.table_open = (
            tokens,
            idx,
            options,
            _env,
            self,
        ) =>
            `<div class="${styles.tableWrap}">${self.renderToken(tokens, idx, options)}`;
        this.#md.renderer.rules.table_close = () => "</table></div>";
    }

    #formatContentFn = (content: string): string => content;
    setContentFormatter = (fn: (content: string) => string): void => {
        this.#formatContentFn = fn;
    };

    setContent(content: string): void {
        this.#markdownContent = this.#formatContentFn(content);
        this.render();
    }

    /**
     * Heading anchors would otherwise overwrite the hash the router lives in,
     * so they scroll rather than navigate.
     */
    #handleAnchorClick = (event: Event) => {
        // An SVGElement when the click lands on an alert icon, so `Element` —
        // where `closest()` is defined — is as specific as this can be.
        const target = event.target;
        if (!(target instanceof Element)) return;

        const link = target.closest("a");
        const href = link?.getAttribute("href");
        if (!href?.startsWith("#") || href.length < 2) return;

        const heading = this.element?.querySelector(
            `[id="${CSS.escape(href.slice(1))}"]`,
        );
        if (!heading) return;

        event.preventDefault();
        heading.scrollIntoView({ block: "start" });
    };

    render(): void {
        if (!this.element) return;
        if (!this.#markdownContent) return;

        this.element.classList.add(styles.markdownRenderer);
        this.element.innerHTML = `
        <div class="markdown-renderer">
            ${this.#md
                .render(this.#markdownContent)
                .replace(EMPTY_ELEMENT_PATTERN, "")}
        </div>
        `;

        this.element.removeEventListener("click", this.#handleAnchorClick);
        this.element.addEventListener("click", this.#handleAnchorClick);
    }

    clear(): void {
        if (!this.element) return;
        this.element.removeEventListener("click", this.#handleAnchorClick);
        this.element.innerHTML = "";
    }
}
