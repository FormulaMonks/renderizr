import { asciidocToMarkdown, isAsciiDoc } from "../components/asciidoc";
import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import ScrollSpy from "../components/scroll-spy";
import type { DocumentationSection } from "../types/structurizr-documentation";
import Page from "./_page";
import history from "history/hash";
import styles from "./docs.module.css";

const HEADING_TAG = /^H[1-6]$/;
const SECTION_PARAM = "section";
const SUBSECTION_PARAM = "subsection";

/** A documentation section, already reduced to plain Markdown. */
type DocSection = {
    id: string;
    title: string;
    body: string;
};

/** A slice of a rendered section: one "page" of documentation. */
type PageGroup = {
    id: string;
    title: string;
    /** Content that precedes the first page boundary. */
    isIntro: boolean;
    /** The heading that opens the page, if any. */
    heading: HTMLElement | null;
    /** Top level blocks belonging to the page. */
    nodes: HTMLElement[];
};

/** One entry of the ordered, cross-section page sequence. */
type FlatPage = {
    id: string;
    title: string;
    isIntro: boolean;
    sectionId: string;
    sectionTitle: string;
    /** Index of the page inside its own section. */
    groupIndex: number;
};

type DocsMenuItem = {
    id: string;
    title: string;
    items?: DocsMenuItem[];
    selectable?: boolean;
    kind: "section" | "page" | "heading";
    /** Page this entry navigates to; `-1` for "on this page" anchors. */
    pageIndex: number;
    headingId: string | null;
};

const isHeading = (element: Element) => HEADING_TAG.test(element.tagName);

const headingLevel = (element: Element) => Number(element.tagName.slice(1));

const textOf = (element: Element | null) => (element?.textContent ?? "").trim();

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/**
 * Split a rendered section into pages.
 *
 * `markdown-it-shift-headings` turns the leading `#` of a section into an
 * `h2`, so that heading is the section title and never a page boundary. Every
 * heading at the shallowest remaining level opens a new page; anything before
 * the first of them is the section's intro.
 */
function splitIntoPages(root: HTMLElement | null): PageGroup[] {
    const blocks = Array.from(root?.children ?? []) as HTMLElement[];
    if (!blocks.length) return [];

    const headings = blocks.filter(isHeading);
    // The first heading is the section title only when nothing below it is as
    // shallow; a document that opens straight into `## Something` has no title
    // of its own, and that heading is a page boundary like any other.
    const [first, ...rest] = headings;
    const titleHeading =
        first &&
        rest.every((other) => headingLevel(other) > headingLevel(first))
            ? first
            : null;

    const bodyHeadings = titleHeading ? rest : headings;
    const shallowest = bodyHeadings.length
        ? Math.min(...bodyHeadings.map(headingLevel))
        : 0;
    const boundaries = new Set(
        bodyHeadings.filter((heading) => headingLevel(heading) === shallowest),
    );

    const pages: PageGroup[] = [];
    let current: PageGroup | null = null;

    for (const block of blocks) {
        if (boundaries.has(block)) {
            current = {
                id: block.id,
                title: textOf(block),
                isIntro: false,
                heading: block,
                nodes: [],
            };
            pages.push(current);
        } else if (!current) {
            current = {
                id: titleHeading?.id || "overview",
                title: textOf(titleHeading),
                isIntro: true,
                heading: titleHeading,
                nodes: [],
            };
            pages.push(current);
        }

        current.nodes.push(block);
    }

    // An intro holding nothing but the section title is not worth a page of
    // its own; the section entry then opens on the first real page.
    const [intro] = pages;
    if (
        pages.length > 1 &&
        intro.isIntro &&
        intro.nodes.every((node) => node === intro.heading)
    ) {
        intro.heading?.remove();
        pages.shift();
    }

    return pages;
}

/** Nest the "on this page" headings by their level. */
function buildHeadingTree(headings: HTMLElement[]): DocsMenuItem[] {
    const roots: DocsMenuItem[] = [];
    const stack: { level: number; item: DocsMenuItem }[] = [];

    for (const heading of headings) {
        if (!heading.id) continue;

        const level = headingLevel(heading);
        const item: DocsMenuItem = {
            id: `heading:${heading.id}`,
            title: textOf(heading),
            kind: "heading",
            // Scrolling the page being read is not a navigation.
            selectable: false,
            pageIndex: -1,
            headingId: heading.id,
            items: [],
        };

        while (stack.length && stack[stack.length - 1].level >= level) {
            stack.pop();
        }

        if (stack.length) stack[stack.length - 1].item.items?.push(item);
        else roots.push(item);

        stack.push({ level, item });
    }

    return roots;
}

export default class Docs extends Page {
    #sections: DocSection[] = [];

    // Built once, from the rendered HTML, and reused for the life of the page.
    #menuItems: DocsMenuItem[] = [];
    #sectionPages = new Map<string, DocsMenuItem[]>();
    #flatPages: FlatPage[] = [];
    #pageOwners = new Map<number, DocsMenuItem>();
    #modelBuilt = false;

    #groups: PageGroup[] = [];
    #renderedSectionId: string | null = null;
    /** Heading id of the rendered section -> the page that holds it. */
    #headingPages = new Map<string, number>();
    #currentIndex = -1;
    #pendingHeadingId: string | null = null;

    #menu: Menu<DocsMenuItem> | null = null;
    #viewer: MarkdownRenderer | null = null;
    #spy: ScrollSpy | null = null;
    #unlisten: (() => void) | null = null;

    constructor(
        container: HTMLElement | null = null,
        name = "Docs",
        sections: DocumentationSection[] = [],
    ) {
        super(container, name);

        this.#sections = sections
            .toSorted((a, b) => (a.order < b.order ? -1 : 1))
            .map((section) => {
                const adoc = isAsciiDoc(section.filename);

                return {
                    id: section.id ?? section.filename.replace(/\.md$/, ""),
                    // The document's own first heading beats a filename every
                    // time; "0001-record-architecture-decisions.md" only
                    // becomes a title as a last resort.
                    title:
                        section.title ||
                        (adoc
                            ? section.content.match(/^=\s+(.+)$/m)?.[1]
                            : section.content.match(/^#\s+(.+)$/m)?.[1]
                        )?.trim() ||
                        section.filename
                            .replace(/\.[a-z]+$/i, "")
                            .replace(/^\d+[-_. ]*/, "")
                            .replace(/[-_]/g, " ")
                            .replace(/\b\w/g, (match) => match.toUpperCase()),
                    // AsciiDoc is converted once, up front: everything
                    // downstream — rendering, page splitting, the table of
                    // contents — then deals in Markdown only.
                    body: adoc
                        ? asciidocToMarkdown(section.content)
                        : section.content,
                };
            });
    }

    /**
     * Render every section once, off-document, and derive the table of
     * contents from the real heading elements and their `markdown-it-anchor`
     * ids. A regex over the raw markdown cannot tell a heading from a `#` in a
     * fenced code block, and has no idea what id the anchor plugin minted.
     */
    #buildModel() {
        if (this.#modelBuilt) return;
        this.#modelBuilt = true;

        const host = document.createElement("div");
        const parser = new MarkdownRenderer(host);

        for (const section of this.#sections) {
            if (section.body?.trim()) parser.setContent(section.body);
            else host.innerHTML = "";

            const groups = splitIntoPages(
                host.querySelector<HTMLElement>(".markdown-renderer") ?? host,
            );

            const sectionItem: DocsMenuItem = {
                id: `section:${section.id}`,
                title: section.title,
                kind: "section",
                // The section entry addresses its first page — the intro when
                // there is one, otherwise the first real page.
                pageIndex: groups.length ? this.#flatPages.length : -1,
                headingId: null,
                items: [],
            };
            const pageItems: DocsMenuItem[] = [];

            groups.forEach((group, groupIndex) => {
                const index = this.#flatPages.length;

                this.#flatPages.push({
                    id: group.id,
                    title: group.title || section.title,
                    isIntro: group.isIntro,
                    sectionId: section.id,
                    sectionTitle: section.title,
                    groupIndex,
                });

                if (group.isIntro) {
                    this.#pageOwners.set(index, sectionItem);
                    return;
                }

                const pageItem: DocsMenuItem = {
                    id: `page:${section.id}:${group.id}`,
                    title: group.title,
                    kind: "page",
                    pageIndex: index,
                    headingId: null,
                    items: [],
                };

                pageItems.push(pageItem);
                this.#pageOwners.set(index, pageItem);
            });

            sectionItem.items = pageItems;
            this.#sectionPages.set(sectionItem.id, pageItems);
            this.#menuItems.push(sectionItem);
        }

        parser.clear();
    }

    #indexFromUrl(search: string): number {
        if (!this.#flatPages.length) return -1;

        const params = new URLSearchParams(search);
        const sectionId = params.get(SECTION_PARAM);
        const pageId = params.get(SUBSECTION_PARAM);

        if (!sectionId) return 0;

        if (pageId) {
            const exact = this.#flatPages.findIndex(
                (page) => page.sectionId === sectionId && page.id === pageId,
            );
            if (exact >= 0) return exact;
        }

        const first = this.#flatPages.findIndex(
            (page) => page.sectionId === sectionId,
        );

        return first >= 0 ? first : 0;
    }

    #setUrl(page: FlatPage, push: boolean) {
        const search = new URLSearchParams(history.location.search);

        search.set(SECTION_PARAM, page.sectionId);
        if (page.isIntro) search.delete(SUBSECTION_PARAM);
        else search.set(SUBSECTION_PARAM, page.id);

        const next = search.toString();
        if (next === history.location.search.replace(/^\?/, "")) return;

        // The page the reader arrives on is where they already are.
        if (push) history.push({ search: next });
        else history.replace({ search: next });
    }

    #renderSection(sectionId: string) {
        const content = document.getElementById("docs-content");
        const section = this.#sections.find((item) => item.id === sectionId);

        if (!(content && section && this.#viewer)) return;

        // `MarkdownRenderer.render()` bails on empty content, which would
        // leave the previous section on screen.
        if (section.body?.trim()) this.#viewer.setContent(section.body);
        else content.innerHTML = "";

        this.#groups = splitIntoPages(
            content.querySelector<HTMLElement>(".markdown-renderer") ?? content,
        );
        this.#renderedSectionId = sectionId;

        const base = this.#flatPages.findIndex(
            (page) => page.sectionId === sectionId,
        );

        this.#headingPages.clear();
        this.#groups.forEach((group, groupIndex) => {
            for (const node of group.nodes) {
                if (node.id && isHeading(node)) {
                    this.#headingPages.set(node.id, base + groupIndex);
                }
            }
        });
    }

    #paintGroup(current: PageGroup | undefined) {
        for (const group of this.#groups) {
            const hidden = group !== current;

            for (const node of group.nodes) {
                node.classList.toggle(styles.pageHidden, hidden);
                node.classList.remove(styles.pageHeading);
            }
        }

        current?.heading?.classList.add(styles.pageHeading);
    }

    /**
     * Rebuild the three-level menu: section -> page -> the headings of the
     * page on screen. Only the page being read carries anchors; the rest of
     * the tree would be a wall of links to content nobody is looking at.
     */
    #syncMenu(index: number, headings: HTMLElement[]) {
        for (const sectionItem of this.#menuItems) {
            const pages = this.#sectionPages.get(sectionItem.id) ?? [];

            for (const pageItem of pages) pageItem.items = [];
            sectionItem.items = [...pages];
        }

        const owner = this.#pageOwners.get(index);

        if (owner) {
            const tree = buildHeadingTree(headings);
            owner.items =
                owner.kind === "section"
                    ? [...tree, ...(owner.items ?? [])]
                    : tree;
        }

        this.#menu?.setItems(this.#menuItems);
        // Re-entrant: `setActive` emits, and the callback lands back in
        // `#goToPage`, which bails on the page it is already showing.
        if (owner) this.#menu?.setActive(owner);
    }

    #pagerButton(
        direction: "previous" | "next",
        targetIndex: number,
        target: FlatPage,
        current: FlatPage,
    ): string {
        const crossesSection = target.sectionId !== current.sectionId;
        const next = direction === "next";

        return `
            <button
                type="button"
                class="${styles.pagerButton} ${next ? styles.pagerNext : ""}"
                data-page-index="${targetIndex}"
            >
                <span class="${styles.pagerLabel}">${next ? "Next" : "Previous"}</span>
                ${crossesSection ? `<span class="${styles.pagerSection}">${escapeHtml(target.sectionTitle)}</span>` : ""}
                <span class="${styles.pagerTitle}">${escapeHtml(target.title)}</span>
            </button>
        `;
    }

    #renderPager(index: number) {
        const pager = document.getElementById("docs-pager");
        if (!pager) return;

        const current = this.#flatPages[index];
        const previous = this.#flatPages[index - 1];
        const next = this.#flatPages[index + 1];

        pager.innerHTML = [
            previous
                ? this.#pagerButton("previous", index - 1, previous, current)
                : "",
            next ? this.#pagerButton("next", index + 1, next, current) : "",
        ].join("");
    }

    #startSpy(headings: HTMLElement[]) {
        this.#spy?.clear();
        this.#spy = new ScrollSpy({
            targets: headings,
            onChange: (id) =>
                this.#menu?.setHighlighted(id ? `heading:${id}` : null),
        });
        this.#spy.render();
    }

    /**
     * Upstream already gives every rendered heading a `scroll-margin-top` that
     * clears the sticky header, so `scrollIntoView` lands in the right place
     * without any arithmetic here.
     */
    #scrollToHeading(id: string | null) {
        if (!id) return;

        document
            .getElementById(id)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    #goToPage(index: number, push = true) {
        if (index < 0 || index >= this.#flatPages.length) return;
        if (index === this.#currentIndex) return;

        const target = this.#flatPages[index];
        this.#currentIndex = index;

        if (this.#renderedSectionId !== target.sectionId) {
            this.#renderSection(target.sectionId);
        }

        const group = this.#groups[target.groupIndex];
        const headings = (group?.nodes ?? []).filter(
            (node) => isHeading(node) && node !== group?.heading,
        );

        this.#paintGroup(group);

        const breadcrumb = document.getElementById("docs-breadcrumb");
        if (breadcrumb) {
            breadcrumb.textContent = target.isIntro ? "" : target.sectionTitle;
        }

        this.#renderPager(index);
        this.#syncMenu(index, headings);
        this.#setUrl(target, push);

        const heading = this.#pendingHeadingId;
        this.#pendingHeadingId = null;

        // A new page starts at its top, unless the reader followed a link to
        // something further down it.
        if (heading) this.#scrollToHeading(heading);
        else window.scrollTo({ top: 0 });

        this.#startSpy(headings);
    }

    #onMenuSelection = (item: DocsMenuItem) => {
        if (item.kind === "heading") {
            this.#scrollToHeading(item.headingId);
            return;
        }

        this.#goToPage(item.pageIndex);
    };

    /**
     * A link inside the content pointing at a heading on another page of the
     * same section — a document's own table of contents, typically.
     * `MarkdownRenderer` has already scrolled to it, which does nothing while
     * the target is hidden; turn it into a page change instead.
     */
    #onContentClick = (event: Event) => {
        const link = (event.target as HTMLElement).closest("a");
        const href = link?.getAttribute("href");
        if (!href?.startsWith("#") || href.length < 2) return;

        const id = decodeURIComponent(href.slice(1));
        const index = this.#headingPages.get(id);
        if (index === undefined || index === this.#currentIndex) return;

        event.preventDefault();
        this.#pendingHeadingId = id;
        this.#goToPage(index);
    };

    #onPagerClick = (event: Event) => {
        const button = (event.target as HTMLElement)?.closest<HTMLElement>(
            "[data-page-index]",
        );

        if (button) this.#goToPage(Number(button.dataset.pageIndex));
    };

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="${styles.docs}">
                <nav id="docs-menu" class="${styles.menu}" aria-label="Documentation"></nav>
                <article class="${styles.section}">
                    <p id="docs-breadcrumb" class="${styles.breadcrumb}"></p>
                    <div id="docs-content" class="${styles.docBody}"></div>
                    <nav id="docs-pager" class="${styles.pager}" aria-label="Documentation pages"></nav>
                </article>
            </div>
        `;

        this.#groups = [];
        this.#headingPages.clear();
        this.#renderedSectionId = null;
        this.#currentIndex = -1;
        this.#pendingHeadingId = null;

        this.#viewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("docs-content")!),
        );

        this.#buildModel();

        this.#menu = this.addComponent(
            new Menu<DocsMenuItem>(
                document.getElementById("docs-menu")!,
                this.#menuItems,
            ),
        );

        this.#menu.onSelectionChange(this.#onMenuSelection);

        // `Menu.render()` builds synchronously, so the first `setActive` in
        // `#goToPage` below has a menu to paint.
        this.renderAllComponents();

        document
            .getElementById("docs-pager")
            ?.addEventListener("click", this.#onPagerClick);
        this.container.addEventListener("click", this.#onContentClick);

        this.#goToPage(this.#indexFromUrl(history.location.search), false);

        this.#unlisten = history.listen((update) => {
            const params = new URLSearchParams(update.location.search);
            if (params.get("page") !== "docs") return;

            this.#goToPage(this.#indexFromUrl(update.location.search), false);
        });
    }

    clear(): void {
        this.#unlisten?.();
        this.#unlisten = null;

        this.#spy?.clear();
        this.#spy = null;

        document
            .getElementById("docs-pager")
            ?.removeEventListener("click", this.#onPagerClick);
        this.container?.removeEventListener("click", this.#onContentClick);

        this.removeAllComponents();
        this.#menu = null;
        this.#viewer = null;
        this.#groups = [];
        this.#headingPages.clear();
        this.#renderedSectionId = null;
        this.#currentIndex = -1;
        this.#pendingHeadingId = null;

        this.container!.innerHTML = "";
    }
}
