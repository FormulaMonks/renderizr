/**
 * The class names the build writes on footnotes, from `CLASSES` in
 * `scripts/documentation/classes.js` (ADR 31).
 */
const FOOTNOTES = "rz-footnotes";
const FOOTNOTE_REF = "rz-footnote-ref";
const FOOTNOTE_BACKREF = "rz-footnote-backref";

/** Whether `element` is the list of footnotes the build puts at a foot. */
export const isFootnotes = (element: Element) =>
    element.classList.contains(FOOTNOTES);

/** The id a reference or a back link points at, as the build wrote it. */
const target = (link: Element) => (link.getAttribute("href") ?? "").slice(1);

/**
 * The footnotes of one rendered section, listed page by page. The build
 * lists every footnote of the section at its foot, numbered across the whole
 * section; each page of a split section shows, in that same list, only the
 * footnotes its own references use, with their numbers. A footnote
 * referenced on two pages shows on both, and keeps only the back links to
 * the references on the page on screen.
 *
 * The footnotes move in and out of the one list, so each id stays on the
 * page once and a reference and a back link scroll to an element on screen.
 */
export default class PageFootnotes {
    #section: HTMLElement | null;
    #list: HTMLElement | null;
    #items: HTMLElement[];

    /** @param root The rendered section, its blocks as children. */
    constructor(root: HTMLElement) {
        this.#section =
            (Array.from(root.children).find(isFootnotes) as
                | HTMLElement
                | undefined) ?? null;
        this.#list = this.#section?.querySelector<HTMLElement>("ol") ?? null;
        this.#items = Array.from(this.#list?.children ?? []) as HTMLElement[];
    }

    /** List the footnotes the references inside `nodes`, one page, use. */
    show(nodes: HTMLElement[]): void {
        if (!(this.#section && this.#list)) return;

        const references = nodes.flatMap((node) =>
            Array.from(node.querySelectorAll(`.${FOOTNOTE_REF} a`)),
        );
        const used = new Set(references.map(target));
        const onPage = new Set(references.map((reference) => reference.id));

        for (const item of this.#items) {
            if (!used.has(item.id)) {
                item.remove();
                continue;
            }
            for (const link of Array.from(
                item.querySelectorAll(`.${FOOTNOTE_BACKREF}`),
            )) {
                if (onPage.has(target(link))) link.removeAttribute("hidden");
                else link.setAttribute("hidden", "");
            }
            // In the build's order, which is the order of their numbers.
            this.#list.appendChild(item);
        }

        if (used.size) this.#section.removeAttribute("hidden");
        else this.#section.setAttribute("hidden", "");
    }
}
