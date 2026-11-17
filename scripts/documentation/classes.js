/**
 * The class names the build writes into rendered documentation. They stay
 * the same from build to build, so `src/components/markdown-renderer.module.css`
 * targets each through `:global()` and the documentation runtime stays the
 * same byte for byte for every workspace (ADR 31). The `rz-` prefix keeps
 * them clear of an author's own classes.
 */
export const CLASSES = Object.freeze({
    /** The scroll container around every table. */
    tableWrap: "rz-table",
    /** Every alert box, with one of the five types below. */
    alert: "rz-alert",
    /** The alert's icon and label row. */
    alertTitle: "rz-alert-title",
    alertNote: "rz-alert-note",
    alertTip: "rz-alert-tip",
    alertImportant: "rz-alert-important",
    alertWarning: "rz-alert-warning",
    alertCaution: "rz-alert-caution",
    /** A link to a document the workspace does not contain. */
    unresolvedLink: "rz-unresolved-link",
    /** A collapsed section's `<details>`, from Markdown or AsciiDoc. */
    collapsed: "rz-collapsed",
    /** A collapsed section's `<summary>`. */
    collapsedSummary: "rz-collapsed-summary",
    /** A list holding a task, its task items and their checkboxes. */
    taskList: "rz-task-list",
    taskListItem: "rz-task-list-item",
    taskListCheckbox: "rz-task-list-checkbox",
    /** AsciiDoc's `menu:File[Save]`, a key cap per step. */
    menu: "rz-menu",
    /** An image that shows in the light or the dark color scheme only. */
    schemeLight: "rz-scheme-light",
    schemeDark: "rz-scheme-dark",
    /** The list of a section's or a decision's footnotes, at its foot. */
    footnotes: "rz-footnotes",
    /** The `<sup>` around a reference to a footnote. */
    footnoteRef: "rz-footnote-ref",
    /** A link from a footnote back to one of its references. */
    footnoteBackref: "rz-footnote-backref",
    /** A diagram card (glossary), the link that opens its diagram. */
    diagramCard: "rz-diagram-card",
    diagramCardIcon: "rz-diagram-card-icon",
    diagramCardText: "rz-diagram-card-text",
    diagramCardType: "rz-diagram-card-type",
    diagramCardTitle: "rz-diagram-card-title",
    diagramCardOpen: "rz-diagram-card-open",
    /** The note in a diagram card's place when there is no diagram to open. */
    diagramNote: "rz-diagram-note",
    /**
     * The `<details>` in a Mermaid block's note that shows the first lines
     * of its source, fading out, and the whole source once opened.
     */
    diagramNoteSource: "rz-diagram-note-source",
});
