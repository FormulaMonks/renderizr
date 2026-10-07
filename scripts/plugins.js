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

/**
 * Compiles `workspace` into the page as `WORKSPACE_MODULE`. Builds and
 * `pnpm dev` use this; edit mode serves the module from disk instead
 * (ADR 15).
 */
export function workspaceModule(workspace) {
    return {
        name: "renderizr:workspace",
        resolveId: (id) =>
            id === WORKSPACE_MODULE ? RESOLVED_WORKSPACE_MODULE : null,
        load: (id) =>
            id === RESOLVED_WORKSPACE_MODULE
                ? workspaceModuleSource(workspace)
                : null,
    };
}

/** Injects the embedded font faces before first paint. */
export function branding({ font }) {
    return {
        name: "renderizr:branding",
        transformIndexHtml: {
            order: "pre",
            handler: (html) => ({
                html,
                tags: font
                    ? [
                          {
                              tag: "style",
                              children: font.css,
                              injectTo: "head",
                          },
                      ]
                    : [],
            }),
        },
    };
}

const SCRIPT_TAG = /<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g;
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
                    .replace(SCRIPT_TAG, (tag, src) => {
                        const code = scripts.get(basename(src));
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
                // concatenation into two live stylesheet requests.
                const inlineCode = [];
                const withoutCode = html.replace(
                    /<script\b[\s\S]*?<\/script>/g,
                    (tag) => {
                        if (tag.startsWith('<script type="module">')) {
                            inlineCode.push(tag);
                        }
                        return "";
                    },
                );

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
