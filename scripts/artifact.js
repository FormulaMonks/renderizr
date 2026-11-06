import { createHash } from "node:crypto";
import { findUnspellable, makeArtifactSafe } from "./escapes.js";
import {
    payloadFile,
    payloadSource,
    RESOLVED_SET_MODULE,
    RESOLVED_WORKSPACE_MODULE,
    SCRIPT_ELEMENT,
    SET_MODULE,
    UNNAMED_WORKSPACE,
    WORKSPACE_MODULE,
    workspaceModuleSource,
} from "./plugins.js";

/**
 * `--artifact`: the page as a folder of separate files that a Claude
 * artifact publishes, split by how often each changes, with a manifest that
 * says which is which (spec 296).
 *
 * - The shell, `index.html`: a fragment for a host that supplies its own
 *   document skeleton, with the workspace's name in its `<title>`.
 * - The runtime: `renderizr.js`, `renderizr-vendor.js` and `renderizr.css`,
 *   byte for byte the same for every workspace at a Renderizr version. The
 *   page loads its workspace from `workspace.json` at startup, so nothing
 *   specific to one workspace is compiled in.
 * - The documentation runtime: `renderizr-docs.js`, the documentation stack, which
 *   the entry imports only to show documentation or decisions. The same
 *   for every workspace at a version too, and left out when no workspace
 *   of the set has documentation or decisions.
 * - The workspace payloads: `workspace.json` for the landscape scoped
 *   workspace, or a lone workspace, and `<slug>.json` for each other
 *   workspace of a set (ADR 26), `<slug>--payload.json` for a slug that
 *   would name a file of the folder. Each holds only what its workspace gives,
 *   its branding included, so a render changes only the payloads of the
 *   workspaces that changed. The page applies a workspace's branding as it
 *   starts or as the reader enters the workspace.
 * - `branding.css`, the landscape scoped workspace's embedded font faces,
 *   when the render embeds a font. The faces stay data URIs: whether the
 *   artifact viewer loads a font from a published file is untested.
 * - `manifest.json`, which lists every file with its layer, size and hash,
 *   and says when the site was built.
 */

/** The file the page loads its landscape scoped workspace from. */
export const WORKSPACE_FILE = "workspace.json";

/** The file that describes the folder. */
export const MANIFEST_FILE = "manifest.json";

/** The runtime's entry, which the shell's module script loads. */
export const ENTRY_FILE = "renderizr.js";

/** The runtime's stylesheet, which the shell links. */
export const STYLESHEET_FILE = "renderizr.css";

/** The embedded font faces, which the shell links when there are any. */
export const BRANDING_FILE = "branding.css";

/** The documentation runtime, which the entry imports on demand. */
export const DOCS_RUNTIME_FILE = "renderizr-docs.js";

/**
 * The page modules that hold the documentation and decision pages, which
 * the entry imports dynamically, and only for a workspace that has any.
 */
const DOCS_PAGES = ["/src/pages/docs.ts", "/src/pages/adrs.ts"];

/**
 * The Rollup output options that give the runtime fixed names, with no
 * content hash, so an update replaces each file in place and the manifest's
 * hash says whether it changed. The documentation stack goes to
 * `renderizr-docs.js`; the rest of the vendor code to
 * `renderizr-vendor.js`; Renderizr's own code to the entry.
 */
export const ARTIFACT_OUTPUT = Object.freeze({
    entryFileNames: ENTRY_FILE,
    chunkFileNames: "renderizr-[name].js",
    assetFileNames: "renderizr[extname]",
    manualChunks: (id, { getModuleIds, getModuleInfo }) =>
        docsModulesOf(getModuleIds, getModuleInfo).has(id)
            ? "docs"
            : isVendor(id)
              ? "vendor"
              : "renderizr",
});

/**
 * Whether the module `id` is vendor code: a package, or one of the helpers
 * Rollup and Vite add, which packages import too. Keeping those helpers out
 * of the entry keeps the vendor chunk from importing the entry back.
 */
const isVendor = (id) =>
    id.includes("/node_modules/") ||
    (id.startsWith("\0") &&
        id !== RESOLVED_WORKSPACE_MODULE &&
        id !== RESOLVED_SET_MODULE);

/** `docsModulesOf`'s answer for each build's module graph. */
const docsModules = new WeakMap();

/**
 * The documentation stack: every module the documentation and decision
 * pages import, directly or not, that the entry does not import itself.
 * Markdown-it, highlight.js, the pages and the decision graph come out of
 * it; code the diagrams share with them stays with the diagrams, so a page
 * with no documentation never loads `renderizr-docs.js`.
 */
function docsModulesOf(getModuleIds, getModuleInfo) {
    // `getModuleInfo` is one function per build, so it keys the answer.
    if (docsModules.has(getModuleInfo)) return docsModules.get(getModuleInfo);
    const ids = [...getModuleIds()];
    const reach = (from) => {
        const seen = new Set();
        const queue = [...from];
        while (queue.length) {
            const id = queue.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            queue.push(...(getModuleInfo(id)?.importedIds ?? []));
        }
        return seen;
    };
    const statics = reach(ids.filter((id) => getModuleInfo(id)?.isEntry));
    const docs = new Set(
        [
            ...reach(
                ids.filter((id) =>
                    DOCS_PAGES.some((page) => id.endsWith(page)),
                ),
            ),
        ].filter((id) => !statics.has(id)),
    );
    docsModules.set(getModuleInfo, docs);
    return docs;
}

/** Whether `workspace` has documentation or decisions to show. */
const hasDocumentation = (workspace) =>
    (workspace.documentation?.sections?.length ?? 0) > 0 ||
    (workspace.documentation?.decisions?.length ?? 0) > 0;

/* --------------------------------------------------------------- payload */

/**
 * @typedef {import("./plugins.js").WorkspacePayload & {
 *     workspaces: { slug: string, name: string }[],
 * }} LandscapePayload
 *   What `workspace.json` holds: the landscape scoped workspace's payload
 *   and the set's other workspaces by slug and name.
 */

/**
 * The landscape scoped workspace's payload: `workspace`, its `branding`
 * and the `set` as `pageSet` gives it.
 * @returns {LandscapePayload}
 */
export const landscapePayload = ({ workspace, branding, set }) => ({
    workspace,
    // Its faces are in `branding.css`, which the shell links.
    branding: {
        ...branding,
        font: branding.font && { family: branding.font.family, css: null },
    },
    crossings: set?.crossings ?? [],
    workspaces: (set?.workspaces ?? []).map(({ slug, payload }) => ({
        slug,
        name: payload.workspace.name ?? UNNAMED_WORKSPACE,
    })),
});

/**
 * The source of `SET_MODULE` under `--artifact`: the landscape scoped
 * workspace's payload, loaded from `workspace.json` before the page starts,
 * the set it names, and the build date from `manifest.json`. Top-level
 * await holds back every module that imports it, so the page starts with
 * the workspace in hand, as it does when the workspace is compiled in.
 *
 * The build date lives in the manifest, which goes out on every publish
 * anyway: in `workspace.json` it would change that payload's hash on every
 * render. Without the manifest the page still opens, with no build date.
 */
const SET_MODULE_SOURCE = [
    "const [response, manifest] = await Promise.all([",
    `    fetch("./${WORKSPACE_FILE}"),`,
    `    fetch("./${MANIFEST_FILE}").then((r) => (r.ok ? r.json() : null)).catch(() => null),`,
    "]);",
    "if (!response.ok)",
    `    throw new Error(\`Couldn't load ${WORKSPACE_FILE}: \${response.status} \${response.statusText}\`);`,
    "export const landscape = await response.json();",
    "export const buildDate = manifest?.buildDate ?? null;",
    "export const crossings = landscape.crossings;",
    "export const workspaces = landscape.workspaces;",
    "export const inlined = null;",
].join("\n");

/* --------------------------------------------------------------- manifest */

/**
 * @typedef {"shell" | "runtime" | "docs-runtime" | "workspace" | "branding"} Layer
 *   What a file of the folder is, by how often it changes.
 */

/** The layer of the file `path`, by its fixed name. */
export function layerOf(path) {
    if (path === "index.html" || path === MANIFEST_FILE) return "shell";
    if (path === BRANDING_FILE) return "branding";
    if (path.endsWith(".json")) return "workspace";
    if (path === DOCS_RUNTIME_FILE) return "docs-runtime";
    if (/^renderizr(-[\w-]+)?\.(js|css)$/.test(path)) return "runtime";
    throw new Error(
        `Expected only the shell, the runtime, the documentation runtime, the workspace payloads and branding in an artifact, got ${path}`,
    );
}

const sha256 = (source) => createHash("sha256").update(source).digest("hex");

/**
 * The source of `manifest.json` for `files`, each `{ path, layer, source }`
 * in the order to list them, built by Renderizr `version` at `buildDate`.
 * The manifest lists itself last, with its own size and no hash, since a
 * hash of itself cannot be inside it.
 */
export function manifestSource({ version, buildDate, files }) {
    const listed = files.map(({ path, layer, source }) => ({
        path,
        layer,
        bytes: Buffer.byteLength(source),
        sha256: sha256(source),
    }));
    const sourceOf = (bytes) =>
        payloadSource({
            renderizr: version,
            buildDate,
            files: [...listed, { path: MANIFEST_FILE, layer: "shell", bytes }],
        });
    // Its own size counts its own digits: settle on a size that names
    // itself, which takes a pass or two.
    let bytes = 0;
    let source = sourceOf(bytes);
    while (Buffer.byteLength(source) !== bytes) {
        bytes = Buffer.byteLength(source);
        source = sourceOf(bytes);
    }
    return source;
}

/* ------------------------------------------------------------------ shell */

const TITLE = /<title>[\s\S]*?<\/title>/i;
const STYLE_ELEMENT = /<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi;

/**
 * The shell for the `index.html` Vite wrote: the page's `<title>`, its
 * inline scripts (the theme script), the stylesheet, `branding.css` when
 * `branded`, the inline styles (the primary color), then the mount point
 * and the entry's module script, with no document skeleton.
 * The host supplies the skeleton and drops what it puts in `<head>`, so
 * the title comes first, where the host reads it, and the entry comes
 * last. Vite's own `index.html` holds no bundled code, so its tags can be
 * read with patterns.
 */
export function shellOf(html, { branded = false } = {}) {
    const head = html.slice(0, html.indexOf("<body>"));
    const body = html.slice(
        html.indexOf("<body>") + "<body>".length,
        html.indexOf("</body>"),
    );
    const inlineScripts = (head.match(SCRIPT_ELEMENT) ?? []).filter(
        (tag) => !/^<script\b[^>]*\ssrc=/i.test(tag),
    );
    const parts = [
        head.match(TITLE)?.[0],
        ...inlineScripts,
        `<link rel="stylesheet" href="./${STYLESHEET_FILE}">`,
        branded && `<link rel="stylesheet" href="./${BRANDING_FILE}">`,
        ...(head.match(STYLE_ELEMENT) ?? []),
        withoutScripts(body).trim(),
        `<script type="module" src="./${ENTRY_FILE}"></script>`,
    ];
    return `${parts.filter(Boolean).join("\n")}\n`;
}

/**
 * `html` with every script element taken out. One pass can join the halves
 * of a nested tag into a new one, so it repeats until nothing changes.
 */
function withoutScripts(html) {
    let previous;
    let current = html;
    do {
        previous = current;
        current = current.replace(SCRIPT_ELEMENT, "");
    } while (current !== previous);
    return current;
}

/* ---------------------------------------------------------------- plugins */

/**
 * The Vite plugins for `--artifact`. `workspace`, `branding` and `set` are
 * as `createConfig` takes them, `branding` the landscape scoped
 * workspace's; `version` names the runtime in the manifest; `buildDate`
 * goes into the manifest too.
 *
 * The first plugin provides the page's workspace and set modules: an empty
 * workspace module, and a set module that loads `workspace.json`. The
 * second writes the folder once Vite has written the page.
 */
export function artifact({ workspace, branding, set, version, buildDate }) {
    const landscape = landscapePayload({ workspace, branding, set });
    const faces = branding.font?.css ?? null;
    const payloads = [
        [WORKSPACE_FILE, landscape],
        ...(set?.workspaces ?? []).map(({ slug, payload }) => [
            payloadFile(slug),
            payload,
        ]),
    ];
    const documented = payloads.some(([, payload]) =>
        hasDocumentation(payload.workspace),
    );
    return [
        {
            name: "renderizr:artifact-modules",
            resolveId: (id) =>
                id === WORKSPACE_MODULE
                    ? RESOLVED_WORKSPACE_MODULE
                    : id === SET_MODULE
                      ? RESOLVED_SET_MODULE
                      : null,
            load: (id) =>
                id === RESOLVED_WORKSPACE_MODULE
                    ? workspaceModuleSource(null)
                    : id === RESOLVED_SET_MODULE
                      ? SET_MODULE_SOURCE
                      : null,
        },
        {
            name: "renderizr:artifact",
            enforce: "post",
            generateBundle(_options, bundle) {
                const files = [];
                const html = bundle["index.html"];
                files.push({
                    path: "index.html",
                    source: shellOf(String(html.source), {
                        branded: faces !== null,
                    }),
                });
                delete bundle["index.html"];

                for (const [fileName, output] of Object.entries(bundle)) {
                    delete bundle[fileName];
                    // The entry still names it, behind the documentation
                    // and decision pages, which a set with no documentation
                    // or decisions never shows.
                    if (fileName === DOCS_RUNTIME_FILE && !documented) continue;
                    files.push({
                        path: fileName,
                        source:
                            output.type === "chunk"
                                ? makeArtifactSafe(
                                      // Vite leaves this marker behind on a
                                      // dynamic import inside the entry, as
                                      // under `--single-file`; the page dies
                                      // on a ReferenceError when the reader
                                      // opens the documentation.
                                      output.code.replace(
                                          /__VITE_PRELOAD__/g,
                                          "void 0",
                                      ),
                                  )
                                : String(output.source),
                    });
                }
                for (const [path, payload] of payloads)
                    files.push({ path, source: payloadSource(payload) });
                if (faces !== null)
                    files.push({ path: BRANDING_FILE, source: `${faces}\n` });

                // The artifact upload reads each file as text and refuses
                // these; find them before the files are written rather than
                // on upload.
                for (const { path, source } of files) {
                    const rejected = findUnspellable(source);
                    if (rejected.length)
                        this.error(
                            `${path} still spells out ${rejected.length} sequence(s) a Claude artifact upload rejects:\n${rejected.slice(0, 5).join("\n")}`,
                        );
                }

                const listed = files.map((file) => ({
                    ...file,
                    layer: layerOf(file.path),
                }));
                for (const { path, source } of [
                    ...listed,
                    {
                        path: MANIFEST_FILE,
                        source: manifestSource({
                            version,
                            buildDate,
                            files: listed,
                        }),
                    },
                ])
                    this.emitFile({ type: "asset", fileName: path, source });
            },
        },
    ];
}
