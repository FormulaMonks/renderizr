import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
    ROOT_TYPE,
    STRUCTURIZR_ENUMS,
    STRUCTURIZR_TYPES,
} from "./structurizr-schema.js";

/**
 * Edit mode's one writer of `workspace.json` (spec 7, ADR 17).
 *
 * It starts from the file on disk, reads it the way Structurizr does (keys
 * Structurizr doesn't define dropped, fractions truncated, `position`
 * clamped, unknown routing modes and paper sizes dropped), applies the layout
 * the author edited and the stamps Structurizr Local writes, and prints the
 * result with the rules of Jackson, the Java JSON library behind
 * Structurizr's writer. Keys keep the order the file has; a key the writer
 * adds goes where Structurizr's alphabetical order puts it. The page's copy of
 * the workspace is never saved: the build's transforms have changed it.
 */

/* ---------------------------------------------------------------- printing */

/** Jackson's escapes; any other control character becomes `\u00XX`. */
const ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\b": "\\b",
    "\f": "\\f",
};

const quote = (text) =>
    `"${text.replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: these are the characters Jackson escapes
        /["\\\u0000-\u001f]/g,
        (char) =>
            ESCAPES[char] ??
            `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
    )}"`;

function print(value, depth, newline) {
    if (Array.isArray(value)) {
        if (value.length === 0) return "[ ]";
        return `[ ${value.map((item) => print(item, depth, newline)).join(", ")} ]`;
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value);
        if (entries.length === 0) return "{ }";
        const inner = newline + "  ".repeat(depth + 1);
        const fields = entries.map(
            ([key, item]) =>
                `${quote(key)} : ${print(item, depth + 1, newline)}`,
        );
        return `{${inner}${fields.join(`,${inner}`)}${newline}${"  ".repeat(depth)}}`;
    }
    if (typeof value === "string") return quote(value);
    return JSON.stringify(value);
}

/**
 * `workspace` printed as Structurizr's writer prints it: Jackson's default
 * pretty printer, two-space indent, `"key" : value`, arrays inline, `{ }` and
 * `[ ]` for empty containers, no final newline. `newline` is the file's line
 * ending.
 */
export const printWorkspace = (workspace, { newline = "\n" } = {}) =>
    print(workspace, 0, newline);

/* ------------------------------------------------------------------ reading */

/**
 * Whether Jackson leaves `value` out: Structurizr's writer includes non-empty
 * values only, so nulls, empty strings and empty lists and maps go. An empty
 * object of a model class stays, as `{ }`.
 */
const isEmpty = (value, kind) =>
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof kind === "object" &&
        !Array.isArray(kind) &&
        Object.keys(value).length === 0);

/** A value read into a Java field of `kind`, or `undefined` when Structurizr drops it. */
function readValue(value, kind) {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(kind)) {
        if (!Array.isArray(value)) return undefined;
        return value
            .map((item) => readValue(item, kind[0]))
            .filter((item) => item !== undefined);
    }
    if (typeof kind === "object") {
        if (typeof value !== "object" || Array.isArray(value)) return undefined;
        const map = {};
        for (const [key, item] of Object.entries(value)) {
            // Structurizr's maps hold strings: 1 reads as "1".
            const read =
                kind.map === "value" &&
                item !== null &&
                typeof item !== "object"
                    ? String(item)
                    : readValue(item, kind.map);
            if (read !== undefined) map[key] = read;
        }
        return map;
    }
    if (kind === "int") {
        const number = Number(value);
        return Number.isFinite(number) ? Math.trunc(number) : undefined;
    }
    if (kind === "number") {
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }
    if (kind === "value") return value;
    if (kind.startsWith("enum:")) {
        const allowed = STRUCTURIZR_ENUMS[kind.slice("enum:".length)];
        return allowed?.includes(value) ? value : undefined;
    }
    return readObject(value, kind);
}

/** Field rules beyond a field's type, as Structurizr's setters apply them. */
const SETTERS = {
    // RelationshipView.setPosition clamps to 0 to 100.
    RelationshipView: {
        position: (value) => Math.min(100, Math.max(0, value)),
    },
};

function readObject(value, type) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return undefined;
    const fields = STRUCTURIZR_TYPES[type];
    if (!fields)
        throw new Error(`The writer knows no Structurizr type ${type}.`);
    const read = {};
    for (const [key, item] of Object.entries(value)) {
        if (!Object.hasOwn(fields, key)) continue;
        let field = readValue(item, fields[key]);
        const setter = SETTERS[type]?.[key];
        if (setter && field !== undefined) field = setter(field);
        if (isEmpty(field, fields[key])) continue;
        read[key] = field;
    }
    return read;
}

/** The line ending `text` uses: CRLF when it has one, LF otherwise. */
const newlineOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

/**
 * Parse `text` as Structurizr reads a workspace and hand back what its
 * writer would keep, with the line ending the file uses.
 */
export function readWorkspace(text) {
    const workspace = readObject(JSON.parse(text), ROOT_TYPE) ?? {};
    // Structurizr's server keeps only the scope of a workspace's own
    // configuration when it saves.
    if (workspace.configuration) {
        const { scope } = workspace.configuration;
        workspace.configuration = scope === undefined ? {} : { scope };
    }
    return { workspace, newline: newlineOf(text) };
}

/* ------------------------------------------------------------------ layout */

/**
 * Set `object[key]` to `value`. A key the object has keeps its place; a new
 * one goes before the first key that sorts after it, as Structurizr's writer
 * sorts keys alphabetically.
 */
export function setInOrder(object, key, value) {
    if (Object.hasOwn(object, key)) {
        object[key] = value;
        return;
    }
    const entries = Object.entries(object);
    const at = entries.findIndex(([other]) => other > key);
    entries.splice(at === -1 ? entries.length : at, 0, [key, value]);
    for (const other of Object.keys(object)) delete object[other];
    for (const [other, item] of entries) object[other] = item;
}

/** The view collections that hold a stored layout (spec 8). */
const LAYOUT_VIEWS = [
    "systemLandscapeViews",
    "systemContextViews",
    "containerViews",
    "componentViews",
    "dynamicViews",
    "deploymentViews",
    "customViews",
];

const findView = (workspace, key) => {
    for (const collection of LAYOUT_VIEWS) {
        const view = workspace.views?.[collection]?.find((v) => v.key === key);
        if (view) return view;
    }
    return undefined;
};

/** `value` as a whole number, as Structurizr reads it, or `undefined`. */
const whole = (value) => {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? number : undefined;
};

/** `{ x, y }` in whole numbers, or `undefined` when either isn't a number. */
const pointOf = (at) => {
    const x = whole(at?.x);
    const y = whole(at?.y);
    return x === undefined || y === undefined ? undefined : { x, y };
};

/** `order` as an integer when it reads as one, as the page reads it. */
const orderOf = ({ order }) => {
    const text = String(order ?? "").trim();
    return /^\d+$/.test(text) ? Number(text) : undefined;
};

/**
 * Each relationship listing of `view` by its key: the relationship id for
 * its first listing, then `id#1`, `id#2` for repeats, as a dynamic view
 * lists one relationship at several orders. In a `dynamic` view a second
 * listing at one order, read as an integer when it is one, is the same edge
 * and takes no key. This is the page's rule (`relationshipKeys` in
 * `src/model/edited-layout.ts`), and `test/edited-layout.test.js` holds the
 * two to it.
 */
function relationshipsByKey(view, dynamic) {
    const byKey = new Map();
    const repeats = new Map();
    const listed = new Set();
    for (const relationship of view.relationships ?? []) {
        if (dynamic) {
            const at = `${relationship.id}\n${orderOf(relationship) ?? relationship.order}`;
            if (listed.has(at)) continue;
            listed.add(at);
        }
        const repeat = repeats.get(relationship.id) ?? 0;
        repeats.set(relationship.id, repeat + 1);
        byKey.set(
            repeat === 0 ? relationship.id : `${relationship.id}#${repeat}`,
            relationship,
        );
    }
    return byKey;
}

/**
 * Lay the edited layouts in `views` (view key to edited layout) over
 * `workspace`, in place:
 *
 * - `elements`, element id to `{ x, y }`. An element landing on exactly
 *   (0,0), which reads as unplaced (ADR 10), goes to (5,0) (spec 7.3).
 * - `relationships`, relationship key to `{ vertices, routing, position }`,
 *   each optional; an empty list deletes the stored vertices, an unknown
 *   routing mode is ignored and `position` stops at 0 and 100. A stored
 *   `jump` stays as found (spec 7.3, 12.8).
 * - `dimensions`, `{ width, height }`.
 * - `paperSize`: `null` deletes it, as Decrease and Increase do (spec 14);
 *   a known paper size, which undo brings back, is set.
 *
 * Numbers are whole, as Structurizr reads them. Views, elements and
 * relationships the workspace no longer has are skipped.
 */
export function applyLayout(workspace, views) {
    for (const [key, layout] of Object.entries(views ?? {})) {
        const view = findView(workspace, key);
        if (!view) continue;
        for (const [id, at] of Object.entries(layout?.elements ?? {})) {
            const element = view.elements?.find((e) => e.id === id);
            const point = pointOf(at);
            if (!element || !point) continue;
            if (point.x === 0 && point.y === 0) point.x = 5;
            setInOrder(element, "x", point.x);
            setInOrder(element, "y", point.y);
        }
        const relationships = relationshipsByKey(
            view,
            workspace.views.dynamicViews?.includes(view) ?? false,
        );
        for (const [id, route] of Object.entries(layout?.relationships ?? {})) {
            const relationship = relationships.get(id);
            if (!relationship) continue;
            if (Array.isArray(route?.vertices)) {
                const vertices = route.vertices.map(pointOf).filter(Boolean);
                if (vertices.length === 0)
                    Reflect.deleteProperty(relationship, "vertices");
                else setInOrder(relationship, "vertices", vertices);
            }
            if (STRUCTURIZR_ENUMS.Routing.includes(route?.routing))
                setInOrder(relationship, "routing", route.routing);
            const position = whole(route?.position);
            if (position !== undefined)
                setInOrder(
                    relationship,
                    "position",
                    Math.min(100, Math.max(0, position)),
                );
        }
        const width = whole(layout?.dimensions?.width);
        const height = whole(layout?.dimensions?.height);
        if (width >= 0 && height >= 0)
            setInOrder(view, "dimensions", { height, width });
        if (layout?.paperSize === null)
            Reflect.deleteProperty(view, "paperSize");
        else if (STRUCTURIZR_ENUMS.PaperSize.includes(layout?.paperSize))
            setInOrder(view, "paperSize", layout.paperSize);
    }
    return workspace;
}

/* ------------------------------------------------------------------ stamps */

/**
 * The stamps Structurizr Local writes on a save (spec 7.1): the date in UTC
 * to the second, the agent, an `id` only when the workspace has none, and the
 * key of the view the author last opened. `lastModifiedUser` stays as found.
 */
export function stampWorkspace(workspace, { agent, now, view }) {
    setInOrder(
        workspace,
        "lastModifiedDate",
        `${now.toISOString().slice(0, 19)}Z`,
    );
    setInOrder(workspace, "lastModifiedAgent", agent);
    if (workspace.id === undefined) setInOrder(workspace, "id", 1);
    if (view) {
        if (!workspace.views) setInOrder(workspace, "views", {});
        if (!workspace.views.configuration)
            setInOrder(workspace.views, "configuration", {});
        setInOrder(workspace.views.configuration, "lastSavedView", view);
    }
    return workspace;
}

/* ------------------------------------------------------------------ saving */

/** A content hash of `workspace.json` as it sits on disk (spec 6.1). */
export const versionOf = (text) =>
    createHash("sha256").update(text).digest("base64url").slice(0, 22);

/**
 * `text` with the edited layouts in `views` applied and stamped. `changed`
 * is false when the layout leaves the workspace as Structurizr would read
 * it, so a save that moves nothing writes nothing.
 */
export function renderWorkspace(text, { views, view, agent, now }) {
    const { workspace, newline } = readWorkspace(text);
    const unchanged = printWorkspace(workspace, { newline });
    applyLayout(workspace, views);
    if (printWorkspace(workspace, { newline }) === unchanged)
        return { text, changed: false };
    stampWorkspace(workspace, { agent, now, view });
    return { text: printWorkspace(workspace, { newline }), changed: true };
}

/**
 * Copy the stamps of `before` that `after` lacks onto `after` (spec 7.1):
 * the id, the date, the agent, the user and the last saved view, which a run of
 * Structurizr's tools leaves out.
 */
function carryStamps(before, after) {
    for (const key of [
        "id",
        "lastModifiedDate",
        "lastModifiedAgent",
        "lastModifiedUser",
    ]) {
        if (before[key] !== undefined && after[key] === undefined)
            setInOrder(after, key, before[key]);
    }
    const view = before.views?.configuration?.lastSavedView;
    if (
        view !== undefined &&
        after.views?.configuration?.lastSavedView === undefined
    ) {
        if (!after.views) setInOrder(after, "views", {});
        if (!after.views.configuration)
            setInOrder(after.views, "configuration", {});
        setInOrder(after.views.configuration, "lastSavedView", view);
    }
}

/**
 * How long, in ms, the writer counts the file as its own write. The watcher
 * reports a write within moments, at times more than once; past this, the
 * same content on disk came from someone else.
 */
const UNHEARD_MS = 10_000;

/**
 * The refusal of a save made against a file that has changed since (spec
 * 7.4). It carries `version`, the file's version now, so the page can save
 * against it once the author keeps the edits (spec 6.2).
 */
export class StaleVersionError extends Error {
    constructor(file, version) {
        super(
            `${basename(file)} changed on disk since this page last read it.`,
        );
        this.name = "StaleVersionError";
        this.version = version;
    }
}

/**
 * Saves edited layouts, and the workspaces the DSL pipeline's runs produce
 * (spec 5.2), into one `workspace.json`, one write at a time, each
 * through a temporary file in the same folder renamed over it. It remembers
 * the versions it wrote recently, each once its rename has landed, so edit
 * mode's watcher can tell its own writes from outside changes, even when the
 * event for an earlier write arrives after a later one.
 */
export class WorkspaceWriter {
    #file;
    #agent;
    #now;
    #queue = Promise.resolve();
    /** The version of the writer's latest write and when it was, in ms. */
    #latest = null;
    #clock;

    constructor(file, { agent, now = () => new Date(), clock = Date.now }) {
        this.#file = file;
        this.#agent = agent;
        this.#now = now;
        this.#clock = clock;
    }

    /**
     * Whether `text`, the file as it is now, is the writer's latest write,
     * made moments ago. The watcher's news of any write of its own reads the
     * file as it is by then, so a late report of an earlier one finds the
     * latest. An earlier file back on disk, as when a tool restores one, is
     * someone else's change.
     */
    wrote(text) {
        const latest = this.#latest;
        return (
            latest !== null &&
            latest.version === versionOf(text) &&
            this.#clock() - latest.at < UNHEARD_MS
        );
    }

    /**
     * Apply `views` (view key to edited layout) to the file on disk and write
     * it, stamping `view` as the last saved view. Refuses with a
     * `StaleVersionError` when the file's version isn't `version`. Resolves
     * with the file's new version and whether anything was written.
     */
    save({ version, view, views }) {
        const run = this.#queue.then(() =>
            this.#save({ version, view, views }),
        );
        this.#queue = run.catch(() => {});
        return run;
    }

    async #save({ version, view, views }) {
        const text = await readFile(this.#file, "utf8");
        if (versionOf(text) !== version)
            throw new StaleVersionError(this.#file, versionOf(text));
        const rendered = renderWorkspace(text, {
            views,
            view,
            agent: this.#agent,
            now: this.#now(),
        });
        if (!rendered.changed) return { version, written: false };
        return this.#write(rendered.text);
    }

    /**
     * Make `text`, the workspace a run of Structurizr's tools wrote, the
     * file's content (spec 5.2), read the way Structurizr reads it, with no
     * layout of the author's applied and stamped. It writes only when the
     * workspace differs from the file's in more than the stamps, which the
     * tools don't write, so a run on unchanged files writes nothing.
     * Resolves as `save` does.
     */
    replace(text) {
        const run = this.#queue.then(() => this.#replace(text));
        this.#queue = run.catch(() => {});
        return run;
    }

    async #replace(text) {
        const { workspace } = readWorkspace(text);
        const current = await readFile(this.#file, "utf8").catch((error) => {
            if (error.code === "ENOENT") return null;
            throw error;
        });
        let newline = "\n";
        if (current !== null) {
            newline = newlineOf(current);
            const before = (() => {
                try {
                    return readWorkspace(current).workspace;
                } catch {
                    return null;
                }
            })();
            if (before) {
                carryStamps(before, workspace);
                if (printWorkspace(workspace, { newline }) === current)
                    return { version: versionOf(current), written: false };
            }
        }
        stampWorkspace(workspace, { agent: this.#agent, now: this.#now() });
        return this.#write(printWorkspace(workspace, { newline }));
    }

    /** Write `text` over the file through a temporary file beside it. */
    async #write(text) {
        const temporary = join(
            dirname(this.#file),
            `.${basename(this.#file)}.${randomBytes(6).toString("hex")}.tmp`,
        );
        try {
            await writeFile(temporary, text, "utf8");
            await rename(temporary, this.#file);
        } catch (error) {
            await rm(temporary, { force: true });
            throw error;
        }
        const version = versionOf(text);
        this.#latest = { version, at: this.#clock() };
        return { version, written: true };
    }
}
