import { CLASSES } from "./classes.js";
import { attributesOf, rewriteTags, writeTag } from "./html-tags.js";

/**
 * Images that follow the color scheme, the way GitHub shows them, except
 * that they follow the site's own color scheme, which the theme toggle sets
 * as well as the system:
 *
 * - An image whose address ends in `#gh-dark-mode-only` or
 *   `#gh-light-mode-only` takes `rz-scheme-dark` or `rz-scheme-light`, and
 *   loses the fragment.
 * - A `<picture>` whose sources ask for `prefers-color-scheme` becomes one
 *   picture per color scheme, each holding that scheme's source and the
 *   fallback image, since a `media` query reads the system alone.
 *
 * The module CSS hides the image of the other color scheme. It runs on the
 * rendered HTML, so Markdown images and raw HTML alike take part.
 */

const FRAGMENT = /#gh-(dark|light)-mode-only$/;
const SCHEME_MEDIA =
    /^\s*\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)\s*$/i;
const PICTURE = /<picture\b([^>]*)>([\s\S]*?)<\/picture>/gi;
const SOURCE = /\s*<source\b([^>]*?)\/?>/gi;

/** The class of each color scheme. */
const SCHEME_CLASS = {
    light: CLASSES.schemeLight,
    dark: CLASSES.schemeDark,
};

/**
 * The color scheme a `<source>` asks for, from the text of its attributes,
 * or `undefined`.
 *
 * @param {string} text
 */
const schemeOf = (text) =>
    SCHEME_MEDIA.exec(
        attributesOf(text).get("media") ?? "",
    )?.[1]?.toLowerCase();

/**
 * The content of a picture as it shows in `scheme`: the other scheme's
 * sources go, and this scheme's lose their `media`.
 */
const pictureFor = (content, scheme) =>
    content.replace(SOURCE, (source, text) => {
        const asked = schemeOf(text);
        if (!asked) return source;
        if (asked !== scheme) return "";
        return rewriteTags(source, ["source"], (_tag, attributes) => {
            attributes.remove("media");
        });
    });

/**
 * `html` with its color-scheme images marked for the scheme they show in.
 *
 * @param {string} html
 * @returns {string}
 */
export function followColorScheme(html) {
    const pictures = html.replace(PICTURE, (whole, text, content) => {
        const sources = [...content.matchAll(SOURCE)];
        if (!sources.some(([, source]) => schemeOf(source))) return whole;
        return ["light", "dark"]
            .map((scheme) => {
                const attributes = attributesOf(text);
                attributes.addClass(SCHEME_CLASS[scheme]);
                return `${writeTag("picture", attributes)}${pictureFor(content, scheme)}</picture>`;
            })
            .join("");
    });

    return rewriteTags(pictures, ["img"], (_tag, attributes) => {
        const src = attributes.get("src");
        const scheme = src ? FRAGMENT.exec(src) : null;
        if (!scheme || !src) return;
        attributes.set("src", src.slice(0, scheme.index));
        attributes.addClass(SCHEME_CLASS[scheme[1]]);
    });
}

/**
 * The markdown-it plugin for images that follow the color scheme.
 *
 * @param {import("markdown-it").default} md
 */
export function colorSchemeImages(md) {
    const render = md.renderer.render;
    md.renderer.render = function (tokens, options, env) {
        return followColorScheme(render.call(this, tokens, options, env));
    };
}

/**
 * The asciidoctor.js plugin for images that follow the color scheme, which
 * reads the raw HTML of a passthrough.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciiDocColorSchemeImages(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_embedded(node) {
                    return followColorScheme(
                        await super.convert_embedded(node),
                    );
                }
            },
    );
}
