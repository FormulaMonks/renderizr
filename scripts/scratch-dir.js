/**
 * Folders a run writes files into that must outlive the function that made
 * them but not the process: the static faces of a font with no cache, and
 * the bundled export engine Node imports. Each is removed when the process
 * exits, so the paths stay valid for the whole run.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A new folder in the system's temporary folder, named `prefix` and a
 * random suffix, which the process removes when it exits.
 */
export function scratchDir(prefix) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
    return dir;
}
