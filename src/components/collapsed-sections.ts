/**
 * PROTOTYPE (#339): collapsed sections that read like Notion's toggles.
 *
 * GitHub's `<details>` and `<summary>` stay the source, and asciidoctor.js
 * writes the same pair for AsciiDoc's `[%collapsible]` block (with its body in
 * a `<div class="content">`), so one pass and one set of styles cover both.
 * The browser keeps doing the opening and closing: Enter and Space on the
 * focused summary, a click anywhere on it.
 */
import styles from "./markdown-renderer.module.css";

const HEADING = /^H[1-6]$/;

/**
 * Mark every collapsed section in rendered documentation, and the ones whose
 * summary is a heading (`<summary><h3>Title</h3></summary>`), which fold like
 * a collapsible heading.
 */
export function decorateCollapsedSections(root: HTMLElement): void {
    for (const details of root.querySelectorAll("details")) {
        details.classList.add(styles.toggle);

        const summary = details.querySelector(":scope > summary");
        if (!summary) continue;

        summary.classList.add(styles.toggleSummary);

        // Only a summary that holds nothing but a heading (and whitespace).
        const elements = Array.from(summary.children);
        const text = Array.from(summary.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join("")
            .trim();
        if (
            elements.length === 1 &&
            HEADING.test(elements[0].tagName) &&
            !text
        ) {
            details.classList.add(styles.toggleHeading);
        }
    }
}

/**
 * Open every collapsed section around an element, so a link or address that
 * targets a heading inside one lands on something visible.
 */
export function openAround(target: Element | null): void {
    for (
        let details = target?.closest("details");
        details;
        details = details.parentElement?.closest("details")
    ) {
        details.open = true;
    }
}

/**
 * Print every collapsed section open, then put each back the way the reader
 * left it.
 */
let closedForPrint: HTMLDetailsElement[] = [];

if (typeof window !== "undefined") {
    window.addEventListener("beforeprint", () => {
        closedForPrint = Array.from(
            document.querySelectorAll<HTMLDetailsElement>(
                `details.${styles.toggle}:not([open])`,
            ),
        );
        for (const details of closedForPrint) details.open = true;
    });
    window.addEventListener("afterprint", () => {
        for (const details of closedForPrint) details.open = false;
        closedForPrint = [];
    });
}
