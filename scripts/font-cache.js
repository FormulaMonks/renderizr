/**
 * Where `loadFont` keeps what it fetches from Google Fonts, and the static
 * faces it makes from it (spec #364, _The cache_): under
 * `node_modules/.cache/renderizr` in the nearest project, one folder per
 * family, weights, subsets and italic. Entries never expire; deleting the
 * folder refreshes them.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * The folder the cache lives in: `RENDERIZR_CACHE_DIR` when the environment
 * sets it (empty for no cache, as the test builds that stub Google Fonts
 * do), else `node_modules/.cache/renderizr` in the nearest project above
 * `cwd`, the first folder holding a `package.json` with a `node_modules`
 * beside it. `null` with no such project (`npx`, a global install).
 */
export function cacheRoot(cwd = process.cwd(), env = process.env) {
    if (env.RENDERIZR_CACHE_DIR !== undefined) {
        return env.RENDERIZR_CACHE_DIR
            ? resolve(env.RENDERIZR_CACHE_DIR)
            : null;
    }
    let dir = resolve(cwd);
    for (;;) {
        if (
            existsSync(join(dir, "package.json")) &&
            existsSync(join(dir, "node_modules"))
        ) {
            return join(dir, "node_modules", ".cache", "renderizr");
        }
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/** `text` as a file name part: lower case, runs of anything else as `-`. */
const part = (text) =>
    String(text)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

/**
 * The folder name of `font`'s entry: its family, weights, subsets and
 * italic, in any order the flags give them.
 */
export function fontKey({ family, weights, subsets, italic }) {
    const sorted = (list) => [...new Set(list.map(String))].sort().map(part);
    return [
        part(family),
        sorted(weights).join("-"),
        sorted(subsets).join("+"),
        ...(italic ? ["italic"] : []),
    ].join("_");
}

/** The folder of `font`'s entry under `root`. */
export const fontEntry = (root, font) => join(root, "fonts", fontKey(font));

/** The bytes at `path`, or `null` when nothing is there or there is no path. */
export async function readCached(path) {
    if (!path) return null;
    try {
        return await readFile(path);
    } catch (error) {
        if (error?.code === "ENOENT") return null;
        throw error;
    }
}

/**
 * Write `bytes` to `path` whole: to a file beside it, then renamed, so a run
 * that stops halfway, or another run reading at once, never sees half.
 */
export async function writeCached(path, bytes) {
    await mkdir(dirname(path), { recursive: true });
    const partial = `${path}.${process.pid}.partial`;
    await writeFile(partial, bytes);
    await rename(partial, path);
}
