/**
 * Collapsed sections in rendered documentation: GitHub's `<details>` and
 * AsciiDoc's `[%collapsible]` block, which the build gives the same classes
 * (`scripts/documentation/collapsed-sections.js`). The browser opens and
 * closes them; this opens the ones around a link's target, and prints every
 * one open.
 */
import "./collapsed-sections.module.css";

/** The class the build gives every collapsed section's `<details>`. */
const COLLAPSED = "rz-collapsed";

/**
 * Open every collapsed section around `target`, so a link or an address
 * that names a heading inside one lands on something the reader sees.
 */
export function openAround(target: Element | null): void {
    for (
        let details = target?.closest("details");
        details;
        details = details.parentElement?.closest("details")
    ) {
        details.setAttribute("open", "");
    }
}

/** The collapsed sections `beforeprint` opened, for `afterprint` to close. */
let openedForPrint: Element[] = [];

/** Print every collapsed section open. */
const openForPrint = () => {
    openedForPrint = Array.from(
        document.querySelectorAll(`details.${COLLAPSED}`),
    ).filter((details) => !details.hasAttribute("open"));
    for (const details of openedForPrint) details.setAttribute("open", "");
};

/** Return each collapsed section to the state the reader left it in. */
const restoreAfterPrint = () => {
    for (const details of openedForPrint) details.removeAttribute("open");
    openedForPrint = [];
};

if (typeof window !== "undefined") {
    window.addEventListener("beforeprint", openForPrint);
    window.addEventListener("afterprint", restoreAfterPrint);
}
