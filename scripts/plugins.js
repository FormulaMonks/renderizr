import { findUnspellable, makeArtifactSafe } from "./escapes.js";

/** The module the page imports its workspace from. */
export const WORKSPACE_MODULE = "virtual:renderizr/workspace";

/** The id Vite gives `WORKSPACE_MODULE` once a plugin resolves it. */
export const RESOLVED_WORKSPACE_MODULE = `\0${WORKSPACE_MODULE}`;

/**
 * The source of `WORKSPACE_MODULE`: the workspace as its default export, and
 * as `version` the version of `workspace.json` edit mode loaded it from
 * (spec 7.4), `null` anywhere else. In a DSL session, `error` is the DSL
 * pipeline's error, `{ message, blank }`, while the last run failed (spec
 * 5.3); `null` anywhere else.
 */
export const workspaceModuleSource = (
    workspace,
    version = null,
    error = null,
) =>
    `export default ${JSON.stringify(workspace)};\nexport const version = ${JSON.stringify(version)};\nexport const error = ${JSON.stringify(error)};`;

/** `value`, or what it gives when it is a function: a value read late. */
const current = (value) => (typeof value === "function" ? value() : value);

/**
 * Compiles `workspace` into the page as `WORKSPACE_MODULE`. Builds and
 * `pnpm dev` use this; edit mode serves the module from disk instead
 * (ADR 15). `pnpm dev` passes `workspace`, and `error`, as functions,
 * read on every load, since its set reloads (spec 264).
 */
export function workspaceModule(workspace, error = null) {
    return {
        name: "renderizr:workspace",
        resolveId: (id) =>
            id === WORKSPACE_MODULE ? RESOLVED_WORKSPACE_MODULE : null,
        load: (id) =>
            id === RESOLVED_WORKSPACE_MODULE
                ? workspaceModuleSource(
                      current(workspace),
                      null,
                      current(error),
                  )
                : null,
    };
}

/* ------------------------------------------------------------------- set */

/** The module the page imports the rest of its set from (ADR 26). */
export const SET_MODULE = "virtual:renderizr/set";

/** The id Vite gives `SET_MODULE` once a plugin resolves it. */
export const RESOLVED_SET_MODULE = `\0${SET_MODULE}`;

/**
 * @typedef {object} WorkspacePayload
 *   One software system scoped workspace of a set, as the page enters it:
 *   the file `<slug>.json` holds it in a multi-file build.
 * @property {object} workspace The workspace JSON.
 * @property {{ logo: object | null, font: { family: string, css: string | null } | null, primaryColor: string | null }} branding
 *   Its branding, loaded: the logo as `loadLogo` gives it, and the font's
 *   family with its embedded faces, `css: null` when the landscape scoped
 *   workspace's faces, already in the page, are the same.
 * @property {object[]} crossings Its elements that lead into another
 *   workspace of the set, as `loadSet` gives them.
 *
 * @typedef {object} PageSet
 *   The set as the page takes it.
 * @property {object[]} crossings The landscape scoped workspace's crossings.
 * @property {{ slug: string, payload: WorkspacePayload }[]} workspaces
 * @property {boolean} [inline] Whether the page holds every payload, as
 *   `--single-file` needs, rather than loading each from its file.
 */

/**
 * The set `loadSet` gives, with the branding `loadSetBranding` loads for
 * it, as the page takes it. The landscape scoped workspace's own branding
 * stays compiled into the page, as a lone workspace's is.
 * @returns {PageSet}
 */
export function pageSet(set, branding) {
    const embedded = branding.landscape.font?.css ?? null;
    return {
        crossings: set.landscape.crossings ?? [],
        workspaces: set.workspaces.map((member, at) => {
            const { logo, font, primaryColor } = branding.workspaces[at];
            return {
                slug: member.slug,
                payload: {
                    workspace: member.workspace,
                    branding: {
                        logo,
                        font: font && {
                            family: font.family,
                            css: font.css === embedded ? null : font.css,
                        },
                        primaryColor,
                    },
                    crossings: member.crossings ?? [],
                },
            };
        }),
    };
}

/** What a workspace's file is called in `--out`: its slug. */
const payloadFile = (slug) => `${slug}.json`;

/**
 * The source of `SET_MODULE`: the landscape scoped workspace's
 * `crossings`, each other workspace's slug and name as `workspaces`, and
 * as `inlined` every payload by slug when the page holds them, `null` when
 * it loads each from its file.
 */
const setModuleSource = ({ crossings = [], workspaces = [], inline = false }) =>
    [
        `export const crossings = ${JSON.stringify(crossings)};`,
        `export const workspaces = ${JSON.stringify(
            workspaces.map(({ slug, payload }) => ({
                slug,
                name: payload.workspace.name ?? "Workspace",
            })),
        )};`,
        `export const inlined = ${
            inline
                ? JSON.stringify(
                      Object.fromEntries(
                          workspaces.map(({ slug, payload }) => [
                              slug,
                              payload,
                          ]),
                      ),
                  )
                : "null"
        };`,
    ].join("\n");

/**
 * Compiles the rest of `set`, a `PageSet`, into the page as `SET_MODULE`,
 * and writes each other workspace into `--out` as `<slug>.json`, which the
 * page loads the first time the reader enters it (ADR 26). The dev server
 * serves the same files. With `inline`, the page holds every workspace and
 * the build writes no file of its own. A lone workspace's set names no
 * other workspace. `pnpm dev` passes `set` as a function, read on every
 * load and request, since its set reloads (spec 264).
 */
export function setModule(set = {}) {
    /** The payload of each file the page loads, by file name. */
    const files = () => {
        const { workspaces = [], inline = false } = current(set);
        return new Map(
            inline
                ? []
                : workspaces.map(({ slug, payload }) => [
                      payloadFile(slug),
                      payload,
                  ]),
        );
    };
    return {
        name: "renderizr:set",
        resolveId: (id) => (id === SET_MODULE ? RESOLVED_SET_MODULE : null),
        load: (id) =>
            id === RESOLVED_SET_MODULE ? setModuleSource(current(set)) : null,
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                const path = new URL(request.url ?? "/", "http://dev").pathname;
                const base = server.config.base ?? "/";
                const name = path.startsWith(base)
                    ? path.slice(base.length)
                    : null;
                const payload = name === null ? undefined : files().get(name);
                if (payload === undefined) return next();
                response.setHeader("Content-Type", "application/json");
                response.end(JSON.stringify(payload));
            });
        },
        generateBundle() {
            for (const [fileName, payload] of files())
                this.emitFile({
                    type: "asset",
                    fileName,
                    source: JSON.stringify(payload),
                });
        },
    };
}

/**
 * Injects the embedded font faces, and the primary color when one is set,
 * before first paint. The color's selector outweighs both color schemes'
 * blocks in `main.css`, so it holds in light and dark alike, and the colors
 * `main.css` derives from it follow.
 */
export function branding({ font, primaryColor = null }) {
    const css = [
        font?.css,
        primaryColor &&
            `html:root, html:root[data-theme] { --color-primary: ${primaryColor}; }`,
    ].filter(Boolean);
    return {
        name: "renderizr:branding",
        transformIndexHtml: {
            order: "pre",
            handler: (html) => ({
                html,
                tags: css.map((children) => ({
                    tag: "style",
                    children,
                    injectTo: "head",
                })),
            }),
        },
    };
}

const SCRIPT_ELEMENT = /<script\b[\s\S]*?<\/script\b[^>]*>/gi;
const SCRIPT_SRC = /^<script\b[^>]*\ssrc="([^"]+)"/i;
const STYLE_TAG =
    /<link[^>]*\shref="([^"]+)"[^>]*\srel="stylesheet"[^>]*>|<link[^>]*\srel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/g;
const PRELOAD_TAG = /<link[^>]*rel="modulepreload"[^>]*>/g;
const ICON_TAG = /<link[^>]*rel="icon"[^>]*>/g;

const basename = (href) => href.replace(/^.*[/\\]/, "").split("?")[0];

/**
 * Folds every emitted chunk and stylesheet into the HTML, leaving one file with
 * no network dependencies at all. Also emits `artifact.html`, a bare fragment
 * for hosts that supply their own document scaffolding.
 */
export function singleFile() {
    return {
        name: "renderizr:single-file",
        enforce: "post",
        generateBundle(_options, bundle) {
            const scripts = new Map();
            const styles = new Map();

            for (const [fileName, output] of Object.entries(bundle)) {
                if (fileName.endsWith(".html")) continue;

                if (output.type === "chunk") {
                    // Vite leaves this marker behind when dynamic imports are
                    // inlined; nothing resolves it afterwards and the page dies
                    // on a ReferenceError.
                    scripts.set(
                        basename(fileName),
                        makeArtifactSafe(
                            output.code.replace(/__VITE_PRELOAD__/g, "void 0"),
                        ),
                    );
                } else if (fileName.endsWith(".css")) {
                    styles.set(basename(fileName), String(output.source));
                }

                delete bundle[fileName];
            }

            for (const [fileName, output] of Object.entries(bundle)) {
                if (!fileName.endsWith(".html")) continue;

                // Every replacement uses a function so that `$&` and friends
                // inside minified vendor code are not treated as substitution
                // patterns — that failure produces a plausible-looking file
                // with vendor bundles spliced into each other.
                let html = String(output.source)
                    .replace(PRELOAD_TAG, () => "")
                    .replace(ICON_TAG, () => "")
                    .replace(STYLE_TAG, (tag, href, hrefAlt) => {
                        const css = styles.get(basename(href ?? hrefAlt ?? ""));
                        return css === undefined
                            ? tag
                            : `<style>${css}</style>`;
                    })
                    .replace(SCRIPT_ELEMENT, (tag) => {
                        const src = tag.match(SCRIPT_SRC)?.[1];
                        const code = src && scripts.get(basename(src));
                        return code === undefined
                            ? tag
                            : `<script type="module">${code}</script>`;
                    });

                html = html.replace(/\n\s*\n/g, "\n");
                output.source = html;

                // A fragment for hosts that supply their own document
                // scaffolding: styles, then the mount point, then the code —
                // Vite puts module scripts in <head>, which such a host drops.
                //
                // Scripts are lifted out before anything else is matched.
                // Bundled JavaScript contains strings that look exactly like
                // markup — Structurizr's SVG export builds one reading
                // `<style>@import url("+font.url+");</style>` — and scraping
                // those into the document turns an unevaluated string
                // concatenation into two live stylesheet requests. They go
                // again until none is left, so no removal joins the halves of
                // another script tag.
                const inlineCode = [];
                let previous;
                let withoutCode = html;
                do {
                    previous = withoutCode;
                    withoutCode = withoutCode.replace(SCRIPT_ELEMENT, (tag) => {
                        if (tag.startsWith('<script type="module">')) {
                            inlineCode.push(tag);
                        }
                        return "";
                    });
                } while (withoutCode !== previous);

                const inlineStyles =
                    withoutCode.match(/<style>[\s\S]*?<\/style>/g) ?? [];
                const body = withoutCode
                    .slice(
                        withoutCode.indexOf("<body>") + "<body>".length,
                        withoutCode.indexOf("</body>"),
                    )
                    .trim();

                const artifact = `${inlineStyles.join("")}\n${body}\n${inlineCode.join("")}`;

                // The deploy API reads the file as text, so anything it refuses
                // to carry has to be gone before the file is written rather
                // than discovered on upload. `makeArtifactSafe` above handles
                // the bundle; this catches whatever reached the page by some
                // other route.
                const rejected = findUnspellable(artifact);
                if (rejected.length) {
                    this.error(
                        `artifact.html still spells out ${rejected.length} sequence(s) a Claude artifact upload rejects:\n${rejected.slice(0, 5).join("\n")}`,
                    );
                }

                this.emitFile({
                    type: "asset",
                    fileName: "artifact.html",
                    source: artifact,
                });
            }
        },
    };
}
