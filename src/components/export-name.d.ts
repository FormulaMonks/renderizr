/**
 * The types of `export-name.js`, the one rule that names an export's file.
 * The rule stays plain JavaScript so the CLI in `scripts/` runs the same
 * copy as the page; this file lets the page's TypeScript import it.
 */

import type { ColorScheme, ExportFormat } from "../engine/contract";

/** What the reader sees when they export, which the file's name says. */
export type ExportedView = {
    /** The workspace's name; a nameless workspace exports as "workspace". */
    workspace: string;
    /** The view's key. */
    view: string;
    /** The perspective the view draws under, or null (or left out) for none. */
    perspective?: string | null;
    /** The animation step shown, or null (or left out) for the full view. */
    step?: number | null;
    /** The diagram color scheme; only dark shows in the name. */
    scheme?: ColorScheme;
    format: ExportFormat;
};

/** The export's file name, `<workspace>-<view key>[-<perspective>][-step-N][-dark].<ext>`. */
export declare function exportFileName(exported: ExportedView): string;
