/**
 * The page's side of an export (ADR 21): the engine builds the file, and the
 * page names it and saves it. `exportFileName` is pure; `saveWithLink` saves
 * through the browser's own download.
 */

import type { ExportFormat } from "../engine/contract";

/** What the reader sees when they export, which the file's name says. */
export type ExportedView = {
    /** The workspace's name; a nameless workspace exports as "workspace". */
    workspace: string;
    /** The view's key. */
    view: string;
    /** The animation step shown, or null (or left out) for the full view. */
    step?: number | null;
    /** The diagram color scheme; only dark shows in the name. */
    scheme?: "light" | "dark";
    format: ExportFormat;
};

/**
 * Saves an export's `blob` as a file called `name`. Settles once the browser
 * starts saving it, which ends the export button's busy state.
 */
export type SaveExport = (blob: Blob, name: string) => void | Promise<void>;

/** How long the `blob:` URL outlives the click that saves from it. */
const REVOKE_DELAY = 1000;

/**
 * `text` in kebab-case: words split at spaces, punctuation and lower to
 * upper case changes, accents dropped, everything else outside a-z and 0-9
 * left out.
 */
function kebab(text: string): string {
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
 * The export's file name: `<workspace>-<view key>[-step-N][-dark].<ext>`,
 * both names in kebab-case. A light export of the full view takes the plain
 * name.
 */
export function exportFileName(exported: ExportedView): string {
    const { workspace, view, step, scheme, format } = exported;
    const parts = [kebab(workspace) || "workspace", kebab(view)];
    if (step !== null && step !== undefined) parts.push(`step-${step}`);
    if (scheme === "dark") parts.push("dark");
    return `${parts.join("-")}.${format}`;
}

/** Saves `blob` as `name` through an `<a download>` on a `blob:` URL. */
export function saveWithLink(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoked at once, the URL can be gone before the browser reads it.
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY);
}
