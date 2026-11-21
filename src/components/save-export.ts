/**
 * The page's side of an export (ADR 21): the engine builds the file, and the
 * page names it and saves it. `exportFileName` (from `export-name.js`, which
 * the CLI shares) is pure; `exportSaver` picks how to save: the browser's
 * own download, or the Claude artifact viewer's.
 */

export { type ExportedView, exportFileName } from "./export-name.js";

/**
 * Saves an export's `blob` as a file called `name`. Settles once the browser
 * starts saving it or the reader declines the save, which ends the export
 * button's busy state, and rejects when the save fails.
 */
export type SaveExport = (blob: Blob, name: string) => void | Promise<void>;

/** How long the `blob:` URL outlives the click that saves from it. */
const REVOKE_DELAY = 1000;

/**
 * The Claude artifact viewer's `downloads` capability: it confirms each save
 * with the reader and resolves once they accept, or rejects with a `code`
 * (`declined`, `rate_limited`, `unavailable` and others).
 */
type Downloads = {
    save(file: { filename: string; data: Blob }): Promise<unknown>;
};

/** What the artifact viewer puts on `window.claude`, as far as export goes. */
type ArtifactViewer = {
    use(capability: "downloads"): Promise<Downloads | null>;
};

/** The rejection code of a save the reader turned down. */
const DECLINED = "declined";

/**
 * How the page saves an export, settled once at page load: through a link
 * outside a Claude artifact, through the viewer's `downloads` inside one,
 * and null inside an artifact published without `downloads`, where nothing
 * saves a file and the toolbar hides its export group.
 */
export async function exportSaver(): Promise<SaveExport | null> {
    // Only the artifact viewer defines `window.claude`.
    const viewer = (window as Window & { claude?: ArtifactViewer }).claude;
    if (!viewer) return saveWithLink;
    // A viewer that fails to answer grants nothing, and the page still loads.
    const downloads = await viewer.use("downloads").catch(() => null);
    if (!downloads) return null;
    return (blob, name) => saveWithDownloads(downloads, blob, name);
}

/**
 * Saves `blob` as `name` through the viewer's `downloads`. A save the reader
 * declines settles quietly; every other refusal is a failure.
 */
async function saveWithDownloads(
    downloads: Downloads,
    blob: Blob,
    name: string,
): Promise<void> {
    try {
        await downloads.save({ filename: name, data: blob });
    } catch (error) {
        if ((error as { code?: unknown } | null)?.code !== DECLINED)
            throw error;
    }
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
