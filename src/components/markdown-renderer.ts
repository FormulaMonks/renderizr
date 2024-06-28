import Component from "./_component";
import markdownIt from "markdown-it";
// @ts-ignore
import shiftHeadings from "markdown-it-shift-headings";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/atom-one-dark-reasonable.min.css";
import styles from "./markdown-renderer.module.css";

export default class MarkdownRenderer extends Component {
    #markdownContent = "";
    #md = markdownIt({
        highlight: (str: string, lang?: string) => {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(str, { language: lang }).value;
                } catch (__) {}
            }

            return ""; // use external default escaping
        },
    }).use(shiftHeadings);

    constructor(element: HTMLElement | null = null) {
        super(element);
    }

    setContent(content: string): void {
        this.#markdownContent = content;
        this.render();
    }

    render(): void {
        if (!this.element) return;
        if (!this.#markdownContent) return;

        this.element.classList.add(styles.markdownRenderer);

        this.element.innerHTML = `
        <div class="markdown-renderer">
            ${this.#md.render(this.#markdownContent)}
        </div>
        `;
    }

    clear(): void {
        if (!this.element) return;
        this.element.innerHTML = "";
    }
}
