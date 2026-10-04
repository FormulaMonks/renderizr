/**
 * How the workspace's documentation is addressed. The model lists the ids a
 * link may lead to, and the docs page and its links address the same
 * sections, so the rule lives here where all of them can reach it.
 */

import type { DocumentationSection } from "../types/structurizr-documentation";

/**
 * The id a documentation section is addressed by in the URL. Shared by the
 * docs page, its links and the activation targets, so none of them can
 * disagree about it.
 */
export const sectionId = (section: DocumentationSection): string =>
    section.id ?? section.filename.replace(/\.md$/, "");
