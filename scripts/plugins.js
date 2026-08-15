const STRUCTURIZR_ENTRY = "structurizr-ui/src/js/structurizr.js";

/**
 * structurizr.js opens with `var structurizr = structurizr || {...}`, which as
 * a module only ever creates a module-local binding. Rewriting it to the window
 * lets the other four files — which merely read the free `structurizr` name —
 * resolve against it, so the whole set can be imported statically instead of
 * eval'd. Static imports are what make the artifact CSP (no `unsafe-eval`) and
 * a deterministic evaluation order possible.
 */
export function structurizrGlobals() {
    return {
        name: "renderizr:structurizr-globals",
        enforce: "pre",
        transform(code, id) {
            if (!id.includes(STRUCTURIZR_ENTRY)) return null;

            return {
                code: code.replace(
                    "var structurizr = structurizr ||",
                    "window.structurizr = window.structurizr ||",
                ),
                map: null,
            };
        },
    };
}

/**
 * joint.css carries an embedded `lato-light` webfont that nothing references,
 * plus three alternate themes Renderizr never switches to. Together they are
 * the single largest block of dead weight in the CSS.
 */
export function trimJointCss() {
    return {
        name: "renderizr:trim-joint-css",
        enforce: "pre",
        transform(code, id) {
            if (!id.includes("jointjs/dist/joint.css")) return null;

            return {
                code: code
                    .replace(/@font-face\s*\{[^}]*\}/g, "")
                    .replace(
                        /\.joint-theme-(dark|material|modern)[^{]*\{[^}]*\}/g,
                        "",
                    ),
                map: null,
            };
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
