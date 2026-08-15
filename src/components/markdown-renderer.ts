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
import "highlight.js/styles/atom-one-dark-reasonable.min.css";
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
        .use(anchor);

    constructor(element: HTMLElement | null = null) {
        super(element);
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
        const link = (event.target as HTMLElement).closest("a");
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
            ${this.#md.render(this.#markdownContent).replace(
                // biome-ignore lint/suspicious/noMisleadingCharacterClass: <explanation>
                /<[^/>][^>]*>[\s\u200B-\u200D\uFEFF]*<\/[^>]+>/gim,
                "",
            )}
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
