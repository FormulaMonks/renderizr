import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

const RENDERER_DIR = fileURLToPath(
    new URL("../vendor/structurizr/js/", import.meta.url),
);

/** In load order: each file extends the namespace the one before it created. */
export const RENDERER_FILES = [
    "structurizr.js",
    "structurizr-util.js",
    "structurizr-ui.js",
    "structurizr-workspace.js",
    "structurizr-diagram.js",
];

const VIRTUAL_ID = "virtual:structurizr-renderer";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Exposes Structurizr's own renderer as a string, to be injected at runtime as
 * a classic script.
 *
 * It cannot be bundled as ES modules. The five files share one `structurizr`
 * namespace through a free global, and they are written for sloppy mode: they
 * assign to undeclared names in a dozen places, which is legal in a classic
 * script and a ReferenceError inside a module. Rewriting each occurrence would
 * mean re-auditing every upstream release; injecting the source as a script
 * runs it exactly as the Structurizr server runs it, and stays inside a strict
 * CSP because an inline script is not `eval`.
 *
 * The five are concatenated before minification so that names shared across
 * them survive, and so the whole renderer costs one string in the bundle.
 */
export function structurizrRenderer() {
    return {
        name: "renderizr:structurizr-renderer",
        resolveId(id) {
            return id === VIRTUAL_ID ? RESOLVED_ID : null;
        },
        async load(id) {
            if (id !== RESOLVED_ID) return null;

            const sources = await Promise.all(
                RENDERER_FILES.map((file) =>
                    readFile(resolve(RENDERER_DIR, file), "utf-8"),
                ),
            );

            const { code } = await transformWithEsbuild(
                sources.join("\n;\n"),
                "structurizr-renderer.js",
                { minify: true, loader: "js" },
            );

            return `export default ${JSON.stringify(code)};`;
        },
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
                        output.code.replace(/__VITE_PRELOAD__/g, "void 0"),
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

                this.emitFile({
                    type: "asset",
                    fileName: "artifact.html",
                    source: `${inlineStyles.join("")}\n${body}\n${inlineCode.join("")}`,
                });
            }
        },
    };
}
