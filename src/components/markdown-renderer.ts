import Component from "./_component";
import styles from "./markdown-renderer.module.css";
import { addMathStylesheet } from "./math-stylesheet";

/**
 * Shows a documentation section or a decision the build rendered (ADR 31).
 * The build turns the Markdown into HTML, resolving its links and images, in
 * `scripts/documentation/`; this only puts that HTML on the page, inside the
 * `.markdown-renderer` wrapper the module CSS styles.
 */
export default class MarkdownRenderer extends Component {
    #html = "";

    constructor(element: HTMLElement | null = null) {
        super(element);
    }

    /** Show `html`, a document the build rendered. */
    setContent(html: string): void {
        this.#html = html;
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
        if (!this.#html) return;

        addMathStylesheet();
        this.element.classList.add(styles.markdownRenderer);
        this.element.innerHTML = `
        <div class="markdown-renderer">
            ${this.#html}
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
