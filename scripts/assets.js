import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { renderDocumentation } from "./documentation/index.js";
import { cacheRoot, fontEntry, readCached, writeCached } from "./font-cache.js";
import {
    decompressWoff2,
    hheaMetrics,
    isVariable,
    pinWeight,
} from "./fonts.js";
import { readMermaidDiagrams } from "./mermaid/index.js";

/** Google only serves woff2 to browsers it recognizes. */
const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const isUrl = (value) => /^https?:\/\//i.test(value);

const DATA_URI = /^data:[^,]*?(;base64)?,/is;

/** Whether `value` is a `data:` URI. */
export const isDataUri = (value) => DATA_URI.test(value);

/** The bytes a `data:` URI carries. */
const decodeDataUri = (uri) => {
    const [head, base64] = DATA_URI.exec(uri);
    const data = uri.slice(head.length);
    return base64
        ? Buffer.from(data, "base64")
        : Buffer.from(decodeURIComponent(data), "utf8");
};

/** How long one remote theme, icon, image or logo may take to download. */
export const DOWNLOAD_TIMEOUT_MS = 10_000;

/** The bytes at `url`. Throws when it answers with an error or is too slow. */
async function fetchBytes(url) {
    let response;
    try {
        response = await fetch(url, {
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
    } catch (error) {
        if (error?.name === "TimeoutError") {
            throw new Error(
                `${url} took longer than ${DOWNLOAD_TIMEOUT_MS / 1000}s to answer`,
            );
        }
        throw error;
    }
    if (!response.ok) {
        throw new Error(
            `${url} responded ${response.status} ${response.statusText}`,
        );
    }
    return Buffer.from(await response.arrayBuffer());
}

const readSource = async (source) =>
    isDataUri(source)
        ? decodeDataUri(source)
        : isUrl(source)
          ? fetchBytes(source)
          : readFile(resolve(process.cwd(), source));

/* --------------------------------------------------------------- downloads */

/** How long a failed download stands before a load tries it again. */
export const RETRY_FAILED_MS = 60_000;

/**
 * Every theme, icon and image this process downloaded, by URL: what it read
 * as, and when it failed. Edit mode loads the workspace again on every
 * save, so without these a theme with hundreds of icons would download them
 * all each time, and a save would wait on every one that fails.
 */
const downloads = new Map();

/** Failures already warned about, so a remembered one doesn't warn again. */
const reported = new WeakSet();

/**
 * `read(url)`, run once per process. One that failed fails again at once
 * until `RETRY_FAILED_MS` passes, and then runs again.
 */
function download(url, read) {
    const known = downloads.get(url);
    if (
        known &&
        (known.failedAt === undefined ||
            Date.now() - known.failedAt < RETRY_FAILED_MS)
    ) {
        return known.value;
    }
    const entry = { value: inTurn(read, url), failedAt: undefined };
    entry.value.catch(() => {
        entry.failedAt = Date.now();
    });
    downloads.set(url, entry);
    return entry.value;
}

/**
 * How many downloads run at once. A theme can name hundreds of icons; asked
 * for all together, the last in line would spend their time limit waiting.
 */
const PARALLEL_DOWNLOADS = 16;

let running = 0;
const queue = [];

/** `read(url)` once fewer than `PARALLEL_DOWNLOADS` others are running. */
async function inTurn(read, url) {
    // A finished download hands its place straight to the next in line.
    if (running >= PARALLEL_DOWNLOADS) {
        await new Promise((start) => queue.push(start));
    } else {
        running += 1;
    }
    try {
        return await read(url);
    } finally {
        const next = queue.shift();
        if (next) next();
        else running -= 1;
    }
}

/** Forget every download, so the next load fetches again. For tests. */
export function forgetDownloads() {
    downloads.clear();
}

/** Warn about `error` with `message`, unless an earlier load already did. */
function warnOnce(error, message) {
    if (error && typeof error === "object") {
        if (reported.has(error)) return;
        reported.add(error);
    }
    process.stderr.write(`warning: ${message} — ${error.message}\n`);
}

/* ------------------------------------------------------------------ images */

/**
 * Sniff type and intrinsic size from the bytes, so a mislabeled extension
 * cannot produce a broken <img> or a wrong aspect ratio.
 */
function describeImage(buffer) {
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
        return {
            mime: "image/png",
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20),
        };
    }

    if (buffer.length > 10 && buffer.subarray(0, 3).toString() === "GIF") {
        return {
            mime: "image/gif",
            width: buffer.readUInt16LE(6),
            height: buffer.readUInt16LE(8),
        };
    }

    if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
        for (let at = 2; at < buffer.length - 9; ) {
            if (buffer[at] !== 0xff) {
                at += 1;
                continue;
            }
            const marker = buffer[at + 1];
            // SOF0-SOF15, skipping the four that are not frame headers.
            if (
                marker >= 0xc0 &&
                marker <= 0xcf &&
                ![0xc4, 0xc8, 0xcc].includes(marker)
            ) {
                return {
                    mime: "image/jpeg",
                    height: buffer.readUInt16BE(at + 5),
                    width: buffer.readUInt16BE(at + 7),
                };
            }
            at += 2 + buffer.readUInt16BE(at + 2);
        }
        return { mime: "image/jpeg" };
    }

    if (
        buffer.length > 30 &&
        buffer.subarray(0, 4).toString() === "RIFF" &&
        buffer.subarray(8, 12).toString() === "WEBP"
    ) {
        return { mime: "image/webp" };
    }

    const head = buffer.subarray(0, 1024).toString("utf8");
    if (/<svg[\s>]/i.test(head)) {
        const svg = buffer.toString("utf8");
        const viewBox = svg.match(
            /viewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)/i,
        );
        return {
            mime: "image/svg+xml",
            width: viewBox ? Math.round(Number(viewBox[1])) : undefined,
            height: viewBox ? Math.round(Number(viewBox[2])) : undefined,
        };
    }

    throw new Error("Unrecognized image format");
}

/**
 * `svg` with every comment gone, removed again until none is left: removing
 * one can join the halves of another.
 */
function withoutComments(svg) {
    let previous;
    let current = svg;
    do {
        previous = current;
        current = current.replace(/<!--[\s\S]*?-->/g, "");
    } while (current !== previous);
    return current;
}

/** Editor cruft is where the savings are; path data is left alone. */
const minifySvg = (svg) =>
    withoutComments(
        svg
            .replace(/<\?xml[\s\S]*?\?>/g, "")
            .replace(/<!DOCTYPE[\s\S]*?>/gi, ""),
    )
        .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
        .replace(/<(desc|title)[\s\S]*?<\/\1>/gi, "")
        .replace(/\s(sodipodi|inkscape|rdf|cc|dc):[\w-]+\s*=\s*"[^"]*"/gi, "")
        .replace(/\sxmlns:(sodipodi|inkscape|rdf|cc|dc)\s*=\s*"[^"]*"/gi, "")
        .replace(/>\s+</g, "><")
        .trim();

function encodeSvg(svg) {
    // Percent-encoding usually beats base64 for markup; take whichever is smaller.
    const percent = `data:image/svg+xml,${encodeURIComponent(svg)
        .replace(/'/g, "%27")
        .replace(/%20/g, " ")
        .replace(/%3D/g, "=")
        .replace(/%3A/g, ":")
        .replace(/%2F/g, "/")}`.replace(/"/g, "'");
    const base64 = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

    return percent.length <= base64.length ? percent : base64;
}

export function toDataUri(buffer, mime) {
    if (mime === "image/svg+xml") {
        return encodeSvg(minifySvg(buffer.toString("utf8")));
    }

    return `data:${mime};base64,${buffer.toString("base64")}`;
}

/* -------------------------------------------------------------------- logo */

const SVG_SCRIPT = /<script[\s>]|\son\w+\s*=/i;

/**
 * The logo at `logo.source`, a path, a URL or a `data:` URI, as a data URI
 * with its sniffed size. Whatever the source, its type comes from its bytes,
 * an SVG carrying script is refused and an oversized one warns.
 */
export async function loadLogo(logo) {
    if (!logo) return null;

    const buffer = await readSource(logo.source);
    const { mime, width, height } = describeImage(buffer);

    if (mime === "image/svg+xml" && SVG_SCRIPT.test(buffer.toString("utf8"))) {
        // A data: URI would fill the terminal.
        const name = isDataUri(logo.source)
            ? "The data: URI logo"
            : logo.source;
        throw new Error(
            `${name} contains script, which would run in the page. Export a flattened SVG instead.`,
        );
    }

    // The logo renders at 40px tall; anything beyond 4x that is wasted bytes.
    if (height && height > 160) {
        process.stderr.write(
            `warning: logo is ${width ?? "?"}x${height}px but renders at 40px tall — scale it down to save ${Math.round(buffer.length / 1024)}KB\n`,
        );
    }

    return {
        src: toDataUri(buffer, mime),
        alt: logo.alt || "",
        href: logo.href || null,
        width: width ?? null,
        height: height ?? null,
    };
}

/* -------------------------------------------------------------------- font */

const FACE_RE = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
const FACE_URL_RE = /url\((https:\/\/[^)]+)\)/g;
const familyParam = (family) => family.trim().replace(/\s+/g, "+");

/** The file name Google's CSS keeps in the cache. */
const CSS_FILE = "fonts.css";

function fontCandidates({ family, weights, italic }) {
    const numeric = weights
        .map(Number)
        .filter((weight) => Number.isFinite(weight))
        .sort((a, b) => a - b);
    const min = numeric[0] ?? 400;
    const max = numeric[numeric.length - 1] ?? 700;
    const name = familyParam(family);
    const list = numeric.length ? numeric.join(";") : "400";

    // A variable range is one file for every weight, and usually half the bytes
    // of two static faces. Not every family has one, hence the ladder.
    return italic
        ? [
              `${name}:ital,wght@0,${min}..${max};1,${min}..${max}`,
              `${name}:ital,wght@${numeric.flatMap((w) => [`0,${w}`, `1,${w}`]).join(";")}`,
              name,
          ]
        : [`${name}:wght@${min}..${max}`, `${name}:wght@${list}`, name];
}

/** Google's CSS for `font`, from the first candidate it answers, or `null`. */
async function fetchFontCss(font) {
    for (const candidate of fontCandidates(font)) {
        const response = await fetch(
            `https://fonts.googleapis.com/css2?family=${candidate}&display=block`,
            { headers: { "User-Agent": BROWSER_UA } },
        );
        if (response.ok) return response.text();
    }
    return null;
}

/** The woff2 at `url`. Throws when Google answers with an error. */
async function fetchFontFile(url) {
    const response = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA },
    });
    if (!response.ok) {
        throw new Error(
            `${url} responded ${response.status} ${response.statusText}`,
        );
    }
    return Buffer.from(await response.arrayBuffer());
}

/**
 * `read()`'s bytes, kept at `path` in the cache: read from there when a run
 * already wrote them, and written there when it did not. With no cache
 * (`path` null), every call reads afresh.
 */
async function cached(path, read) {
    const kept = path && (await readCached(path));
    if (kept) return kept;
    const bytes = await read();
    if (path) await writeCached(path, bytes);
    return bytes;
}

/**
 * A folder for the static faces of a run with no cache, removed when the
 * process exits.
 */
let scratchFaces = null;

function scratchFacesDir() {
    if (!scratchFaces) {
        scratchFaces = mkdtempSync(join(tmpdir(), "renderizr-fonts-"));
        const dir = scratchFaces;
        process.once("exit", () =>
            rmSync(dir, { recursive: true, force: true }),
        );
    }
    return scratchFaces;
}

/** What an `@font-face` rule declares: its style and its weight range. */
function faceDeclaration(face) {
    const style = /font-style:\s*([\w-]+)/.exec(face)?.[1] ?? "normal";
    const [, low = "400", high] =
        /font-weight:\s*(\d+)(?:\s+(\d+))?/.exec(face) ?? [];
    return { style, min: Number(low), max: Number(high ?? low) };
}

/**
 * The weights to pin a variable face declared over `min` to `max` at: the
 * ones `font` asks for inside the range, else the lightest it covers.
 */
function weightsToPin(font, { min, max }) {
    const asked = [
        ...new Set(
            font.weights
                .map(Number)
                .filter((weight) => weight >= min && weight <= max),
        ),
    ].sort((a, b) => a - b);
    return asked.length ? asked : [min];
}

/**
 * The static TTFs of the woff2 `faces` of `font`, by subset, style and
 * weight, written in `dir` next to the woff2: a variable face pinned at
 * each weight it needs, a static one decompressed as it is, since resvg
 * reads TTF and OTF only. A face a run already wrote is kept.
 */
async function staticFaces(font, faces, woff2Of, dir) {
    const written = new Map();
    for (const { subset, face, url } of faces) {
        const declared = faceDeclaration(face);
        const name = basename(new URL(url).pathname, ".woff2");
        let ttf;
        const decompressed = async () => {
            ttf ??= await decompressWoff2(woff2Of(url));
            return ttf;
        };
        const variable = async () => isVariable(await decompressed());
        const weights =
            declared.min === declared.max
                ? [declared.min]
                : weightsToPin(font, declared);
        for (const weight of weights) {
            const file = join(dir, `${name}-${weight}.ttf`);
            if (!written.has(file)) {
                await cached(file, async () =>
                    (await variable())
                        ? pinWeight(await decompressed(), weight)
                        : decompressed(),
                );
            }
            written.set(file, {
                file,
                subset,
                style: declared.style,
                weight,
            });
        }
    }
    return [...written.values()];
}

/**
 * The face whose `hhea` the text sits on: the upright one nearest weight
 * 400.
 */
const metricsFace = (faces) =>
    [...faces].sort(
        (a, b) =>
            (a.style === "normal" ? 0 : 1) - (b.style === "normal" ? 0 : 1) ||
            Math.abs(a.weight - 400) - Math.abs(b.weight - 400),
    )[0];

/**
 * `font` from Google Fonts: its faces embedded in `css` as `data:` URLs,
 * the static TTFs resvg draws with as `faces` (each a `file` with its
 * `subset`, `style` and `weight`), and the `hhea` ascent and descent the
 * text sits on as `metrics`. Google's CSS, the woff2 and the TTFs are
 * cached in the nearest project above `cwd` (see `cacheRoot`); with no
 * project, every run fetches, and the TTFs live in a folder removed when
 * the process exits.
 */
export async function loadFont(font, { cwd = process.cwd() } = {}) {
    if (!font) return null;

    const root = cacheRoot(cwd);
    const entry = root && fontEntry(root, font);
    const inEntry = (file) => entry && join(entry, file);

    let css = (await readCached(inEntry(CSS_FILE)))?.toString("utf8") ?? null;
    const fresh = !css;
    if (fresh) {
        css = await fetchFontCss(font);

        if (!css) {
            throw new Error(
                `Google Fonts has no family called "${font.family}". Check the name at fonts.google.com.`,
            );
        }

        if (!css.includes("format('woff2')")) {
            throw new Error(
                "Google Fonts returned a format other than woff2, which would triple the embedded size.",
            );
        }
    }

    // css2 ignores &subset=; the subset name only appears in a comment per face.
    const wanted = new Set(font.subsets);
    const faces = [];

    for (const [, subset, face] of css.matchAll(FACE_RE)) {
        if (!wanted.has(subset)) continue;
        for (const [, url] of face.matchAll(FACE_URL_RE)) {
            faces.push({ subset, face, url });
        }
    }

    if (!faces.length) {
        throw new Error(
            `"${font.family}" has no ${font.subsets.join("/")} subset.`,
        );
    }

    const woff2 = new Map(faces.map(({ url }) => [url, null]));

    await Promise.all(
        [...woff2.keys()].map(async (url) => {
            const file = basename(new URL(url).pathname);
            woff2.set(
                url,
                await cached(inEntry(file), () => fetchFontFile(url)),
            );
        }),
    );

    // Only once every face is in: a CSS kept alone would name faces a later
    // run has to fetch anyway.
    if (entry && fresh) await writeCached(join(entry, CSS_FILE), css);

    const embedded = [...new Set(faces.map(({ face }) => face))]
        .map((face) =>
            face.replace(FACE_URL_RE, (match, url) => {
                const bytes = woff2.get(url);
                return bytes
                    ? `url(data:font/woff2;base64,${bytes.toString("base64")})`
                    : match;
            }),
        )
        .join("");

    const ttfs = await staticFaces(
        font,
        faces,
        (url) => woff2.get(url),
        entry ?? scratchFacesDir(),
    );
    const metrics = hheaMetrics(await readFile(metricsFace(ttfs).file));

    const count = new Set(faces.map(({ face }) => face)).size;
    process.stdout.write(
        `Embedded ${font.family} (${count} face${count === 1 ? "" : "s"}, ${Math.round(embedded.length / 1024)}KB)\n`,
    );

    return {
        family: font.family,
        css: `${embedded}:root{--renderizr-font:'${font.family.replace(/'/g, "")}',Helvetica,Arial,sans-serif}`,
        metrics,
        faces: ttfs,
    };
}

/* --------------------------------------------------------------- workspace */

/**
 * The fields of an image view that hold its picture (spec 14). `IMAGE_FIELDS`
 * in `src/model/resolve-view.ts` names the same three for the engine.
 */
const IMAGE_FIELDS = ["content", "contentLight", "contentDark"];

/**
 * `style` with its icon resolved against `themeUrl`. A published theme names
 * its icons relative to its own URL (`AWS-Cloud_light-bg.png`). Once
 * `inlineWorkspaceAssets` folds the theme in, nothing remains to resolve them
 * against.
 */
function withThemeIcon(style, themeUrl) {
    const { icon } = style;
    if (
        typeof icon !== "string" ||
        !icon.trim() ||
        isUrl(icon) ||
        icon.startsWith("data:")
    ) {
        return style;
    }
    return { ...style, icon: new URL(icon, themeUrl).href };
}

/** The theme at `url`. */
const readTheme = async (url) =>
    JSON.parse((await fetchBytes(url)).toString("utf8"));

/** The image at `url` as a data URI. */
async function readImage(url) {
    const buffer = await fetchBytes(url);
    return toDataUri(buffer, describeImage(buffer).mime);
}

/**
 * Themes, element icons and image views are all fetched by Structurizr's
 * own pages at runtime. A self-contained page cannot do
 * that, so every one of them is resolved here and folded into the
 * workspace. An image that cannot be inlined keeps its URL, and the engine
 * draws its placeholder.
 */
async function inlineWorkspaceAssets(workspace) {
    const views = workspace.views ?? {};
    views.configuration ??= {};
    const configuration = views.configuration;
    configuration.styles ??= {};
    const styles = configuration.styles;
    const themes = configuration.themes ?? [];

    // Downloaded side by side, merged in order: each theme lays its styles
    // under the ones before it.
    const loaded = await Promise.all(
        themes.map((themeUrl) =>
            download(themeUrl, readTheme).then(
                // The download is shared, and the styles change below.
                (theme) => structuredClone(theme),
                (error) => {
                    warnOnce(error, `could not load theme ${themeUrl}`);
                    return null;
                },
            ),
        ),
    );
    loaded.forEach((theme, index) => {
        if (!theme) return;
        styles.elements = [
            ...(theme.elements ?? []).map((style) =>
                withThemeIcon(style, themes[index]),
            ),
            ...(styles.elements ?? []),
        ];
        styles.relationships = [
            ...(theme.relationships ?? []),
            ...(styles.relationships ?? []),
        ];
    });

    if (themes.length) {
        // Leaving these in makes the renderer wait on the network at startup.
        configuration.themes = [];
    }

    const remote = new Map();
    const collect = (value) => {
        if (typeof value === "string" && isUrl(value)) remote.set(value, null);
    };

    for (const style of styles.elements ?? []) collect(style.icon);
    // A Mermaid diagram draws from its source; its picture is never fetched.
    const imageViews = (views.imageViews ?? []).filter((view) => !view.mermaid);
    for (const view of imageViews) {
        for (const field of IMAGE_FIELDS) collect(view[field]);
    }

    await Promise.all(
        [...remote.keys()].map(async (url) => {
            try {
                remote.set(url, await download(url, readImage));
            } catch (error) {
                warnOnce(error, `could not inline ${url}`);
            }
        }),
    );

    for (const style of styles.elements ?? []) {
        if (style.icon && remote.get(style.icon)) {
            style.icon = remote.get(style.icon);
        }
    }
    for (const view of imageViews) {
        for (const field of IMAGE_FIELDS) {
            if (view[field] && remote.get(view[field])) {
                view[field] = remote.get(view[field]);
            }
        }
    }

    return workspace;
}

/**
 * Every element's name and every relationship in `model`, by id, wherever the
 * workspace JSON nests them: relationships live on their source element, at
 * any depth of containers, components and deployment nodes.
 */
function modelIndex(model) {
    const names = new Map();
    const relationships = new Map();
    const pending = [model];
    while (pending.length) {
        const item = pending.pop();
        if (Array.isArray(item)) {
            pending.push(...item);
        } else if (item && typeof item === "object") {
            if (typeof item.sourceId === "string") {
                relationships.set(item.id, item);
            } else if (typeof item.id === "string" && item.name) {
                names.set(item.id, item.name);
            }
            pending.push(...Object.values(item));
        }
    }
    return { names, relationships };
}

/**
 * Refuse a workspace the engine could not draw (spec 13): a filtered view
 * whose base view is itself a filtered view, or a dynamic-view relationship
 * whose order isn't an integer (digits only, after trimming; spec 11). The
 * engine checks both again (`findViewError` in `src/model/filter.ts`) with
 * the same messages, and `test/view-types.test.js` and
 * `test/animation.test.js` fail if the two drift apart.
 */
export function validateWorkspace(workspace) {
    const filtered = workspace.views?.filteredViews ?? [];
    const keys = new Set(filtered.map((view) => view.key));
    for (const view of filtered) {
        if (keys.has(view.baseViewKey)) {
            throw new Error(
                `Filtered view "${view.key}" has filtered view "${view.baseViewKey}" as its base; the base of a filtered view must not be filtered.`,
            );
        }
    }

    const dynamic = workspace.views?.dynamicViews ?? [];
    const invalid = (placement) =>
        placement.order !== undefined &&
        placement.order !== null &&
        !/^\d+$/.test(String(placement.order).trim());
    if (!dynamic.some((view) => view.relationships?.some(invalid))) return;
    const { names, relationships } = modelIndex(workspace.model);
    for (const view of dynamic) {
        const placement = view.relationships?.find(invalid);
        if (!placement) continue;
        const relationship = relationships.get(placement.id);
        const name = (id) => names.get(id) ?? id;
        const label = relationship
            ? `${name(relationship.sourceId)} → ${name(relationship.destinationId)}`
            : placement.id;
        throw new Error(
            `Dynamic view "${view.key}": relationship "${label}" has order "${placement.order}"; orders must be integers.`,
        );
    }
}

/**
 * The text of the workspace at `source`, a URL or a path read against `cwd`.
 */
export function readWorkspace(source, { cwd = process.cwd() } = {}) {
    return isUrl(source)
        ? fetch(source).then((response) => {
              if (!response.ok) {
                  throw new Error(
                      `${source} responded ${response.status} ${response.statusText}`,
                  );
              }
              return response.text();
          })
        : readFile(resolve(cwd, source), "utf-8");
}

/** The workspace `raw` holds, read from `source`. Throws when it isn't JSON. */
export function parseWorkspace(raw, source) {
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`${source} is not valid JSON — ${error.message}`);
    }
}

/**
 * The workspace at `source`, a URL or a path read against `cwd`, ready for
 * the site.
 */
export async function loadWorkspace(source, { cwd = process.cwd() } = {}) {
    return prepareWorkspace(
        parseWorkspace(await readWorkspace(source, { cwd }), source),
    );
}

/**
 * `workspace` ready for the site: checked, its documentation rendered, its
 * Mermaid diagrams read, and its themes, icons and images folded in. Changes
 * `workspace` and returns it.
 */
export async function prepareWorkspace(workspace) {
    validateWorkspace(workspace);
    // Every section and decision of every documentation scope, rendered to
    // HTML once for every mode (ADR 31). The page reads the HTML.
    await renderDocumentation(workspace);
    // Before inlining, which leaves a Mermaid diagram's content alone rather
    // than fetch its picture from the Mermaid server. A diagram that can't be
    // drawn warns and the build finishes (spec: When a diagram can't be
    // drawn).
    for (const notice of readMermaidDiagrams(workspace)) {
        process.stderr.write(`warning: ${notice}\n`);
    }
    await inlineWorkspaceAssets(workspace);

    return workspace;
}
