import MarkdownRenderer from "../components/markdown-renderer";
import Menu from "../components/menu";
import type { DocumentationSection } from "../types/structurizr-documentation";
import Page from "./_page";
import history from "history/browser";
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
                section.title =
                    section.title ||
                    section.filename
                        .replace(/[-_]/g, " ")
                        .replace(/\.md$/, "")
                        .replace(/\b\w/g, (match) => match.toUpperCase());
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
        history.push({ search: search.toString() });
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
            docViewer.setContent(section.content);
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
