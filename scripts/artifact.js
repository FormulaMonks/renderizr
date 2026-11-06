import { createHash } from "node:crypto";
import { findUnspellable, makeArtifactSafe } from "./escapes.js";
import {
    payloadSource,
    RESOLVED_SET_MODULE,
    RESOLVED_WORKSPACE_MODULE,
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
 * - The workspace payloads: `workspace.json` for the landscape scoped
 *   workspace, or a lone workspace, and `<slug>.json` for each other
 *   workspace of a set (ADR 26). Each holds only what its workspace gives,
 *   so a render changes only the payloads of the workspaces that changed.
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

/**
 * The Rollup output options that give the runtime fixed names, with no
 * content hash, so an update replaces each file in place and the manifest's
 * hash says whether it changed. Vendor code goes to `renderizr-vendor.js`;
 * Renderizr's own code, the documentation pages with it, goes to the entry.
 */
export const ARTIFACT_OUTPUT = Object.freeze({
    entryFileNames: ENTRY_FILE,
    chunkFileNames: "renderizr-[name].js",
    assetFileNames: "renderizr[extname]",
    manualChunks: (id) => (isVendor(id) ? "vendor" : "renderizr"),
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
    branding,
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
    if (path.endsWith(".json")) return "workspace";
    if (/^renderizr(-[\w-]+)?\.(js|css)$/.test(path)) return "runtime";
    throw new Error(
        `Expected only the shell, the runtime and the workspace payloads in an artifact, got ${path}`,
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
const SCRIPT_ELEMENT = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi;
const STYLE_ELEMENT = /<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi;

/**
 * The shell for the `index.html` Vite wrote: the page's `<title>`, its
 * inline scripts (the theme script) and styles, then the stylesheet, the
 * mount point and the entry's module script, with no document skeleton.
 * The host supplies the skeleton and drops what it puts in `<head>`, so
 * the title comes first, where the host reads it, and the entry comes
 * last. Vite's own `index.html` holds no bundled code, so its tags can be
 * read with patterns.
 */
export function shellOf(html) {
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
        ...(head.match(STYLE_ELEMENT) ?? []),
        body.replace(SCRIPT_ELEMENT, "").trim(),
        `<script type="module" src="./${ENTRY_FILE}"></script>`,
    ];
    return `${parts.filter(Boolean).join("\n")}\n`;
}

/* ---------------------------------------------------------------- plugins */

/**
 * The Vite plugins for `--artifact`. `workspace`, `branding` and `set` are
 * as `createConfig` takes them; `version` names the runtime in the
 * manifest; `buildDate` goes into the manifest too.
 *
 * The first plugin provides the page's workspace and set modules: an empty
 * workspace module, and a set module that loads `workspace.json`. The
 * second writes the folder once Vite has written the page.
 */
export function artifact({ workspace, branding, set, version, buildDate }) {
    const landscape = landscapePayload({ workspace, branding, set });
    const payloads = [
        [WORKSPACE_FILE, landscape],
        ...(set?.workspaces ?? []).map(({ slug, payload }) => [
            `${slug}.json`,
            payload,
        ]),
    ];
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
                    source: shellOf(String(html.source)),
                });
                delete bundle["index.html"];

                for (const [fileName, output] of Object.entries(bundle)) {
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
                    delete bundle[fileName];
                }
                for (const [path, payload] of payloads)
                    files.push({ path, source: payloadSource(payload) });

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
