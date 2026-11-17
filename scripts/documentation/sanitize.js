import xss from "xss";

/**
 * The raw HTML an author writes in a section or decision, sanitized the way
 * GitHub sanitizes it (ADR 31): GitHub's allowlist plus `video`, keeping `id`
 * and `class`. `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`,
 * event handlers, `style` attributes and `javascript:` links go.
 *
 * markdown-it hands raw HTML over in pieces (`<details>` in one token, the
 * Markdown inside it in others, `</details>` in a last one), so the sanitizer
 * judges each tag on its own and never balances them: js-xss filters tag by
 * tag, where a tree-building sanitizer would close `<details>` at once and
 * drop the lone `</details>`.
 */

/** GitHub's allowlist, plus `video`. */
export const KEPT_TAGS = Object.freeze([
    "a",
    "abbr",
    "b",
    "bdo",
    "blockquote",
    "br",
    "caption",
    "cite",
    "code",
    "dd",
    "del",
    "details",
    "dfn",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "img",
    "ins",
    "kbd",
    "li",
    "mark",
    "ol",
    "p",
    "picture",
    "pre",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "samp",
    "small",
    "source",
    "span",
    "strike",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "tt",
    "ul",
    "var",
    "video",
    "wbr",
]);

/** The attributes every kept tag keeps: GitHub's, plus `id` and `class`. */
const GLOBAL_ATTRIBUTES = [
    "id",
    "class",
    "abbr",
    "align",
    "alt",
    "aria-describedby",
    "aria-hidden",
    "aria-label",
    "aria-labelledby",
    "border",
    "cellpadding",
    "cellspacing",
    "colspan",
    "datetime",
    "dir",
    "headers",
    "height",
    "hreflang",
    "itemprop",
    "lang",
    "media",
    "open",
    "rel",
    "reversed",
    "role",
    "rowspan",
    "scope",
    "span",
    "start",
    "summary",
    "tabindex",
    "target",
    "title",
    "type",
    "valign",
    "value",
    "width",
];

/** The attributes one tag keeps on top of the global ones. */
const TAG_ATTRIBUTES = {
    a: ["href"],
    blockquote: ["cite"],
    del: ["cite"],
    img: ["src", "srcset", "sizes", "loading"],
    ins: ["cite"],
    q: ["cite"],
    source: ["src", "srcset", "sizes"],
    video: [
        "src",
        "poster",
        "controls",
        "autoplay",
        "loop",
        "muted",
        "playsinline",
        "preload",
    ],
};

/** The attributes that hold an address, and the schemes each may use. */
const LINK = ["http", "https", "mailto"];
const MEDIA = ["http", "https", "data:image/"];
const ADDRESS_SCHEMES = {
    href: LINK,
    cite: LINK,
    src: MEDIA,
    srcset: MEDIA,
    poster: MEDIA,
};

/**
 * Whether `address` is relative, or uses one of `schemes`. Browsers ignore
 * whitespace and control characters inside a scheme, so `java\tscript:`
 * reads as `javascript:`, and so does the check.
 */
function safeAddress(address, schemes) {
    const plain = [...address]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code > 0x20 && (code < 0x7f || code > 0x9f);
        })
        .join("");
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(plain)?.[1].toLowerCase();
    if (!scheme) return true;
    return schemes.some((allowed) =>
        allowed.endsWith("/")
            ? plain.toLowerCase().startsWith(allowed)
            : scheme === allowed,
    );
}

/**
 * An attribute's value as the page gets it, or `""` when it carries an
 * address in a scheme it may not use. A `srcset` goes whole when any of its
 * candidates does.
 */
function safeAttrValue(_tag, name, value) {
    const decoded = xss.friendlyAttrValue(value);
    const schemes = ADDRESS_SCHEMES[name];
    if (schemes) {
        const addresses =
            name === "srcset"
                ? decoded.split(/,\s+/).map((candidate) => candidate.trim())
                : [decoded];
        if (!addresses.every((address) => safeAddress(address, schemes)))
            return "";
    }
    return xss.escapeAttrValue(decoded);
}

const filter = new xss.FilterXSS({
    whiteList: Object.fromEntries(
        KEPT_TAGS.map((tag) => [
            tag,
            [...GLOBAL_ATTRIBUTES, ...(TAG_ATTRIBUTES[tag] ?? [])],
        ]),
    ),
    stripIgnoreTag: true,
    // These go with what they hold, as GitHub drops them; any other tag
    // outside the allowlist goes and leaves its text.
    stripIgnoreTagBody: [
        "script",
        "style",
        "iframe",
        "noscript",
        "noembed",
        "noframes",
        "xmp",
    ],
    css: false,
    onTagAttr: (tag, name, value, isWhiteAttr) => {
        if (!isWhiteAttr) return undefined;
        // A kept attribute with no value (`open`, `controls`) stays bare; one
        // whose address is unsafe goes, rather than staying as an empty
        // `href` that points at the page itself.
        if (value === "" && !ADDRESS_SCHEMES[name]) return name;
        const safe = safeAttrValue(tag, name, value);
        return safe ? `${name}="${safe}"` : "";
    },
});

/**
 * `html` with every tag, attribute and address outside the allowlist gone.
 * Text stays, and so does each tag on its own: an opening tag with no closing
 * one is not closed.
 *
 * @param {string} html
 * @returns {string}
 */
export const sanitizeHtml = (html) => filter.process(html);

/**
 * Sanitize the raw HTML markdown-it reads from the source, and only that:
 * the `html_block` and `html_inline` tokens its own parser rules make. A
 * plugin's tokens, `html_block` ones included, never reach the sanitizer, so
 * Renderizr's own markup (alert icons, highlighting, resolved links, math,
 * footnotes, diagram cards) stays as it renders.
 *
 * @param {import("markdown-it").default} md
 */
export function sanitizeRawHtml(md) {
    wrap(md.block.ruler, "html_block");
    wrap(md.inline.ruler, "html_inline");
}

/**
 * Replace the parser rule `name` of `ruler` with one that sanitizes each
 * token of type `name` the rule pushes.
 *
 * @param {import("markdown-it").default["block"]["ruler"] | import("markdown-it").default["inline"]["ruler"]} ruler
 * @param {"html_block" | "html_inline"} name
 */
function wrap(ruler, name) {
    const rule = ruler.__rules__[ruler.__find__(name)];
    if (!rule) return;
    const parse = rule.fn;

    ruler.at(
        name,
        (state, ...rest) => {
            const from = state.tokens.length;
            const matched = parse(state, ...rest);
            for (const token of state.tokens.slice(from)) {
                if (token.type !== name) continue;
                // A block that held nothing but a script leaves nothing,
                // not even its line break.
                const html = sanitizeHtml(token.content);
                token.content = html.trim() ? html : "";
            }
            return matched;
        },
        { alt: rule.alt },
    );
}
