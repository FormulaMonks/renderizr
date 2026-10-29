import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * The DSL scan (spec 264, _Previewing a set with `pnpm dev`_): the files a
 * `workspace.dsl` reads, so the dev server re-exports only the DSL a change
 * touches.
 *
 *     const scan = await scanDsl("/w/orders/workspace.dsl");
 *     holds(scan, "/w/shared/people.dsl"); // true when orders includes it
 *
 * It reads the DSL's text for `workspace extends`, `!include` (a file or a
 * whole folder), `!docs`, `!adrs` and `!script` files, each relative to the
 * file that names it, and follows `workspace extends` and `!include`
 * transitively. It is no parser: Renderizr leaves the DSL to Structurizr's
 * tools (ADR 16). A path it can't resolve, such as `${SHARED}/people.dsl`
 * or a script that reads files of its own, makes the DSL `unresolvable`, and
 * the dev server re-exports it on every change. A URL is no dependency: the
 * dev server watches none.
 */

/**
 * @typedef {object} DslScan
 * @property {string[]} files Every absolute path the DSL reads, itself
 *   first: a file, or a folder for everything under it.
 * @property {boolean} unresolvable Whether a path it names can't be
 *   resolved, so any change may touch it.
 *
 * @typedef {object} DslReference
 * @property {"extends" | "include" | "docs" | "adrs" | "script"} directive
 * @property {string} path The path as written, without its quotes.
 */

/** The languages an inline `!script` block names in place of a file. */
const SCRIPT_LANGUAGES = /^(groovy|kotlin|ruby|javascript)$/i;

/**
 * What a script calls to read a file of its own, in the languages
 * Structurizr runs: `new File(…)`, `Files.readAllLines`, `Paths.get`,
 * Ruby's `File.read` or Node's `fs`.
 */
const READS_FILES =
    /\b(?:File|Files|Paths?|FileReader)\s*[.(]|\bjava\.(?:io|nio)\b|\brequire\s*\(\s*["']fs["']/;

/** A token: a quoted string, or a run of anything but whitespace. */
const TOKEN = String.raw`("[^"]*"|\S+)`;

/** The directives that name a file, at the start of a line. */
const DIRECTIVES = [
    [
        "extends",
        new RegExp(String.raw`^\s*workspace\s+extends\s+${TOKEN}`, "i"),
    ],
    ["include", new RegExp(String.raw`^\s*!include\s+${TOKEN}`, "i")],
    ["docs", new RegExp(String.raw`^\s*!docs\s+${TOKEN}`, "i")],
    ["adrs", new RegExp(String.raw`^\s*!adrs\s+${TOKEN}`, "i")],
    ["script", new RegExp(String.raw`^\s*!script\s+${TOKEN}`, "i")],
];

/** `text` without its comments: `/* … *\/` blocks, `//` and `#` lines. */
const withoutComments = (text) =>
    text
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ""))
        .split(/\r?\n/)
        .map((line) => (/^\s*(\/\/|#)/.test(line) ? "" : line));

/**
 * The body of the `{ … }` block that opens on line `at` of `lines`, or
 * the rest of the text when it never closes.
 */
function blockAt(lines, at) {
    const rest = lines.slice(at).join("\n");
    const open = rest.indexOf("{");
    if (open === -1) return "";
    let depth = 0;
    for (let index = open; index < rest.length; index++) {
        if (rest[index] === "{") depth++;
        else if (rest[index] === "}" && --depth === 0)
            return rest.slice(open + 1, index);
    }
    return rest.slice(open + 1);
}

/** Whether `path` is a URL, which no watcher can follow. */
const isUrl = (path) => /^[a-z][a-z0-9+.-]*:\/\//i.test(path);

/**
 * The files the DSL `text` names, in order, and whether one of them, or
 * an inline script that reads files of its own, can't be resolved. Pure:
 * it reads nothing.
 *
 * @returns {{ references: DslReference[], unresolvable: boolean }}
 */
export function dslReferences(text) {
    const lines = withoutComments(String(text));
    const references = [];
    let unresolvable = false;
    for (const [at, line] of lines.entries()) {
        for (const [directive, pattern] of DIRECTIVES) {
            const match = pattern.exec(line);
            if (!match) continue;
            const path = match[1].replace(/^"|"$/g, "");
            if (directive === "script" && SCRIPT_LANGUAGES.test(path)) {
                if (READS_FILES.test(blockAt(lines, at))) unresolvable = true;
            } else if (path.includes("${")) {
                unresolvable = true;
            } else if (!isUrl(path)) {
                references.push({ directive, path });
            }
            break;
        }
    }
    return { references, unresolvable };
}

/* ------------------------------------------------------------------- scan */

/** The text of the file at `path`, or `null` when it isn't one. */
const readText = (path) => readFile(path, "utf8").catch(() => null);

/**
 * Every file under the folder `path`, recursively, leaving out names that
 * start with a dot; `null` when `path` isn't a folder.
 */
async function filesUnder(path) {
    const entries = await readdir(path, { withFileTypes: true }).catch(
        () => null,
    );
    if (!entries) return null;
    const files = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith(".")) continue;
        const inside = join(path, entry.name);
        if (entry.isDirectory())
            files.push(...((await filesUnder(inside)) ?? []));
        else files.push(inside);
    }
    return files;
}

/**
 * Scan the DSL at `file`, an absolute path, for every file it reads.
 *
 * @returns {Promise<DslScan>}
 */
export async function scanDsl(file) {
    const files = new Set();
    let unresolvable = false;
    const scanned = new Set();

    const scan = async (path) => {
        if (scanned.has(path)) return;
        scanned.add(path);
        files.add(path);
        const text = await readText(path);
        if (text === null) return;
        const found = dslReferences(text);
        unresolvable ||= found.unresolvable;
        for (const { directive, path: named } of found.references) {
            const target = resolve(dirname(path), named);
            files.add(target);
            if (directive === "docs" || directive === "adrs") continue;
            if (directive === "script") {
                if (READS_FILES.test((await readText(target)) ?? ""))
                    unresolvable = true;
                continue;
            }
            const inside = await filesUnder(target);
            for (const member of inside ?? [target]) await scan(member);
        }
    };

    await scan(resolve(file));
    return { files: [...files], unresolvable };
}

/** Whether `path` is `folder` or lies under it. */
export const under = (path, folder) => {
    const inside = relative(folder, path);
    return (
        inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)
    );
};

/** Whether a change to `path`, an absolute path, touches the DSL `scan`. */
export const holds = (scan, path) =>
    scan.files.some((dependency) => under(path, dependency));

/**
 * The DSL, of `scans` by path, that a change to the `changed` paths
 * touches and must re-export: each whose dependencies hold one of them,
 * each that is unresolvable, and each not scanned yet (`null`).
 *
 * @param {string[]} changed
 * @param {Map<string, DslScan | null>} scans
 * @returns {string[]}
 */
export const staleExports = (changed, scans) =>
    [...scans]
        .filter(
            ([, scan]) =>
                !scan ||
                scan.unresolvable ||
                changed.some((path) => holds(scan, path)),
        )
        .map(([dsl]) => dsl);
