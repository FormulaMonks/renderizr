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
    /** A display math expression, which scrolls inside its own block. */
    mathDisplay: "rz-math-display",
    /** The list of a section's or a decision's footnotes, at its foot. */
    footnotes: "rz-footnotes",
    /** The `<sup>` around a reference to a footnote. */
    footnoteRef: "rz-footnote-ref",
    /** A link from a footnote back to one of its references. */
    footnoteBackref: "rz-footnote-backref",
});
