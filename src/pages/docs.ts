import { asciidocToMarkdown, isAsciiDoc } from "../components/asciidoc";
import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import type { DocumentationSection } from "../types/structurizr-documentation";
import Page from "./_page";
import history from "history/hash";
import styles from "./docs.module.css";

export default class Docs extends Page {
    #sections: DocumentationSection[] | null = null;
    #currentSection: DocumentationSection | null = null;

    constructor(
        container: HTMLElement | null = null,
        name = "Docs",
        sections: DocumentationSection[] = [],
    ) {
        super(container, name);
        this.#sections = sections
            .toSorted((a, b) => (a.order < b.order ? -1 : 1))
            .map((section) => {
                section.id =
                    section.id ?? section.filename.replace(/\.md$/, "");
                // The document's own first heading beats a filename every
                // time; "0001-record-architecture-decisions.md" only becomes a
                // title as a last resort.
                section.title =
                    section.title ||
                    (isAsciiDoc(section.filename)
                        ? section.content.match(/^=\s+(.+)$/m)?.[1]
                        : section.content.match(/^#\s+(.+)$/m)?.[1]
                    )?.trim() ||
                    section.filename
                        .replace(/\.[a-z]+$/i, "")
                        .replace(/^\d+[-_. ]*/, "")
                        .replace(/[-_]/g, " ")
                        .replace(/\b\w/g, (match) => match.toUpperCase());

                const body = isAsciiDoc(section.filename)
                    ? asciidocToMarkdown(section.content)
                    : section.content;

                const subtitles = Array.from(
                    body.matchAll(/^#{2,3} (?:[_*]{1,2})?([^#_*\n]*)/gm),
                ).map((r) => ({
                    id: r[1].replace(/ /g, "-").toLowerCase(),
                    title: r[1],
                }));

                section.items = subtitles;

                return section;
            });
    }

    #getSectionFromUrl() {
        const search = new URLSearchParams(history.location.search);
        const sectionId = search.get("section");
        return this.#sections?.find((s) => s.id === sectionId);
    }

    #setSectionInUrl(section: DocumentationSection) {
        const search = new URLSearchParams(history.location.search);
        search.set("section", section.id);
        history.push({
            search: search.toString(),
        });
    }

    render() {
        this.container!.innerHTML = `
            <div class="${styles.docs}">
                <div id="docs-menu" class=${styles.menu}></div>
                <div id="docs-content" class="${styles.section}"></div>
            </div>
        `;

        this.#currentSection = this.#getSectionFromUrl() ?? this.#sections![0];

        const menu = this.addComponent(
            new Menu<DocumentationSection>(
                document.getElementById("docs-menu")!,
                this.#sections!,
            ),
        );

        const docViewer = this.addComponent(
            new MarkdownRenderer(document.getElementById("docs-content")!),
        );

        menu.onSelectionChange((section) => {
            if (!section) return;
            this.#setSectionInUrl(section);
            docViewer.setContentFormatter(
                isAsciiDoc(section.filename)
                    ? asciidocToMarkdown
                    : (content) => content,
            );
            docViewer.setContent(section.content);
            this.container?.scrollTo(0, 0);
        });

        this.renderAllComponents();

        // Wait until menu is rendered
        window.setTimeout(() => {
            menu.setActive(this.#currentSection!);
        }, 100);
    }
    clear(): void {
        this.container!.innerHTML = "";
    }
}
