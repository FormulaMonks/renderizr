/**
 * Shared plumbing for the `scripts/*.test.js` suite: fixture paths, temporary
 * directories, a child-process runner for the CLI, and a stub for `fetch` so no
 * test ever touches the network.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

export const FIXTURES = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const fixture = (name) => join(FIXTURES, name);
export const BUILD_JS = resolve(REPO_ROOT, "scripts/build.js");

/**
 * Make a scratch directory and hand it to `body`, removing it afterwards even
 * when the body throws.
 */
export async function withTempDir(body) {
    const dir = await mkdtemp(join(tmpdir(), "renderizr-test-"));
    try {
        return await body(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

/**
 * Run `scripts/build.js` in a child process. The CLI calls `process.exit` on
 * bad input, so its failure modes cannot be observed in-process.
 *
 * Resolves with `{ code, stdout, stderr }` whatever the exit status.
 */
export async function runCli(args, { cwd = REPO_ROOT, env = {} } = {}) {
    try {
        const { stdout, stderr } = await run(
            process.execPath,
            [BUILD_JS, ...args],
            {
                cwd,
                env: { ...process.env, ...env },
                maxBuffer: 64 * 1024 * 1024,
            },
        );
        return { code: 0, stdout, stderr };
    } catch (error) {
        return {
            code: error.code ?? 1,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? "",
        };
    }
}

/**
 * Run `source` as an ES module in a child process rooted at the repository, and
 * resolve with its `{ stdout, stderr }`.
 *
 * Used for the argument-parsing paths that call `process.exit`, which cannot be
 * observed in-process. A non-zero exit rejects, so `assert.rejects` is the way
 * to assert on a failure and its message.
 */
export async function evalInChild(source) {
    const { stdout, stderr } = await run(
        process.execPath,
        ["--input-type=module", "-e", source],
        {
            cwd: REPO_ROOT,
            maxBuffer: 8 * 1024 * 1024,
        },
    );
    return { stdout, stderr };
}

/**
 * Replace the global `fetch` for the duration of `body`.
 *
 * `routes` maps a URL (or a predicate) to a response description. Anything not
 * matched rejects, so a test that accidentally reaches for the network fails
 * loudly rather than going out to Google Fonts.
 */
export async function withFetch(routes, body) {
    const original = globalThis.fetch;
    const calls = [];

    globalThis.fetch = async (url, init) => {
        const href = String(url);
        calls.push({ url: href, init });

        const match = routes[href] ?? routes.default;
        if (!match) {
            throw new Error(`unstubbed fetch: ${href}`);
        }

        const value =
            typeof match === "function" ? await match(href, init) : match;
        if (value instanceof Error) throw value;

        const {
            ok = true,
            status = ok ? 200 : 404,
            statusText = ok ? "OK" : "Not Found",
            body: payload = "",
        } = value;

        const buffer = Buffer.isBuffer(payload)
            ? payload
            : Buffer.from(
                  typeof payload === "string"
                      ? payload
                      : JSON.stringify(payload),
              );

        return {
            ok,
            status,
            statusText,
            text: async () => buffer.toString("utf8"),
            json: async () => JSON.parse(buffer.toString("utf8")),
            arrayBuffer: async () =>
                buffer.buffer.slice(
                    buffer.byteOffset,
                    buffer.byteOffset + buffer.byteLength,
                ),
        };
    };

    try {
        return await body(calls);
    } finally {
        globalThis.fetch = original;
    }
}

/**
 * The document with the *contents* of every script and style element emptied
 * out, opening tags and their attributes left intact.
 *
 * A bundled page carries megabytes of JavaScript containing strings that look
 * exactly like markup — jQuery alone ships `/<link/` as a regular expression —
 * so "is this file self-contained" can only be asked of the skeleton. Keeping
 * the opening tags is what makes the question answerable: an external
 * `<script src>` is an empty element, so a replacement that swallowed the
 * whole tag would erase the very evidence being looked for.
 */
export const htmlSkeleton = (html) =>
    html
        .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, "$1</script>")
        .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, "$1</style>");

/**
 * Every `src`/`href`/`srcset`/`data`/`poster` attribute value in `html`, as
 * `{ attribute, value }`. Used to ask what a document can still go and fetch.
 */
export const assetReferences = (html) =>
    [
        ...html.matchAll(
            /\b(src|href|srcset|data|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
        ),
    ].map(([, attribute, raw]) => ({
        attribute: attribute.toLowerCase(),
        value: raw.replace(/^["']|["']$/g, ""),
    }));

/**
 * A workspace that is not JSON. Written to a scratch directory at test time
 * rather than committed, so the repository's own JSON tooling has nothing to
 * choke on.
 */
export const BROKEN_JSON = '{ "name": "Broken", "views": { ,, }';

export async function writeBrokenWorkspace(dir) {
    const path = join(dir, "broken.json");
    await writeFile(path, BROKEN_JSON);
    return path;
}

/** A real, decodable 1x1 transparent GIF. */
export const GIF_1X1 = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
);

/**
 * A JPEG header: SOI, a JFIF APP0 segment that the marker walker has to skip
 * over by its length, then an SOF0 frame header declaring 32x64, then EOI.
 */
export const JPEG_32X64 = Buffer.concat([
    /* SOI */ Buffer.from("ffd8", "hex"),
    /* APP0, length 16, "JFIF\0", version, density */
    Buffer.from("ffe00010" + "4a46494600" + "0101000001000100" + "0000", "hex"),
    /* SOF0, length 17, 8-bit precision, height 0x0040, width 0x0020 */
    Buffer.from("ffc00011" + "08" + "0040" + "0020", "hex"),
    /* three components, then EOI */
    Buffer.from("03" + "012200" + "021101" + "031101" + "ffd9", "hex"),
]);

/** A WEBP container header — enough for the sniffer, which reads no further. */
export const WEBP_HEADER = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0x20, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPVP8 "),
    Buffer.alloc(24, 0),
]);
