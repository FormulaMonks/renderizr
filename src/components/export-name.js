/**
 * The one rule that names an export's file, which the toolbar export and
 * the CLI export share so both name a view's file alike. Plain JavaScript,
 * so the CLI in `scripts/` runs this same copy; `export-name.d.ts` types it
 * for the page.
 */

import { slugOf } from "../model/slug.js";

/**
 * `text` in kebab-case: words split at spaces, punctuation and lower to
 * upper case changes, accents dropped, everything else outside a-z and 0-9
 * left out.
 *
 * @param {string} text
 * @returns {string}
 */
function kebab(text) {
    return text
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * The export's file name:
 * `<workspace>-<view key>[-<perspective>][-step-N][-dark].<ext>`. The
 * workspace's name and the view's key go in kebab-case, the perspective's
 * name as its slug (ADR 30). A light export of the full view with no
 * perspective takes the plain name.
 *
 * @param {import("./export-name").ExportedView} exported
 * @returns {string}
 */
export function exportFileName(exported) {
    const { workspace, view, perspective, step, scheme, format } = exported;
    const parts = [kebab(workspace) || "workspace", kebab(view)];
    const perspectiveSlug = perspective ? slugOf(perspective) : "";
    if (perspectiveSlug) parts.push(perspectiveSlug);
    if (step !== null && step !== undefined) parts.push(`step-${step}`);
    if (scheme === "dark") parts.push("dark");
    return `${parts.join("-")}.${format}`;
}
