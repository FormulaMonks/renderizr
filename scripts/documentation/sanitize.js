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

/**
 * The tags that go with what they hold, as GitHub drops them; any other tag
 * outside the allowlist goes and leaves its text. A browser reads their body
 * as raw text up to the first closing tag, and so does the sanitizer.
 */
export const DROPPED_WITH_BODY = new Set([
    "script",
    "style",
    "iframe",
    "noscript",
    "noembed",
    "noframes",
    "xmp",
]);

/**
 * The marks the filter leaves where a tag of `DROPPED_WITH_BODY` opens and
 * closes, for `dropBodies` to cut between. Both start with a NUL, which
 * `sanitizeHtml` replaces in its input, so no author text carries one.
 * js-xss's own `stripIgnoreTagBody` writes the text "[removed]" where an
 * opening tag has no closing one, which is how a lone `<script>` ended up
 * reading "[removed]" on the page.
 */
const BODY_OPENS = "\u0000[";
const BODY_CLOSES = "\u0000]";

const filter = new xss.FilterXSS({
    whiteList: Object.fromEntries(
        KEPT_TAGS.map((tag) => [
            tag,
            [...GLOBAL_ATTRIBUTES, ...(TAG_ATTRIBUTES[tag] ?? [])],
        ]),
    ),
    onIgnoreTag: (tag, _html, { isClosing }) => {
        if (!DROPPED_WITH_BODY.has(tag)) return "";
        return isClosing ? BODY_CLOSES : BODY_OPENS;
    },
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
 * `html` with everything from each `BODY_OPENS` to the next `BODY_CLOSES`
 * gone, and a stray `BODY_CLOSES` gone too. An opening mark with no closing
 * one drops the rest of `html`, as a browser reads a `<script>` that never
 * closes.
 *
 * @param {string} html
 */
function dropBodies(html) {
    let kept = "";
    let from = 0;
    for (;;) {
        const opens = html.indexOf(BODY_OPENS, from);
        const closes = html.indexOf(BODY_CLOSES, from);
        if (opens === -1 && closes === -1) return kept + html.slice(from);
        if (opens === -1 || (closes !== -1 && closes < opens)) {
            kept += html.slice(from, closes);
            from = closes + BODY_CLOSES.length;
            continue;
        }
        kept += html.slice(from, opens);
        const end = html.indexOf(BODY_CLOSES, opens);
        if (end === -1) return kept;
        from = end + BODY_CLOSES.length;
    }
}

/**
 * `html` with every tag, attribute and address outside the allowlist gone.
 * Text stays, and so does each tag on its own: an opening tag with no closing
 * one is not closed.
 *
 * @param {string} html
 * @returns {string}
 */
export const sanitizeHtml = (html) =>
    dropBodies(filter.process(html.replaceAll("\u0000", "\ufffd")));

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

/** The name of the tag `html` starts with, lowercased, if it starts with one. */
const tagName = (html) =>
    /^<\/?([a-z][a-z0-9-]*)/i.exec(html)?.[1].toLowerCase();

/**
 * Move the inline `state` past the closing tag of the `name` element it sits
 * inside. markdown-it hands an inline `<script>`, its body and `</script>`
 * over as three tokens, so the sanitizer dropped both tags and left the body
 * on the page as text. The closing tag is found with markdown-it's own tag
 * rule, `parse`, the way a browser reads the body as raw text up to the first
 * closing tag. A tag that never closes leaves `state` where it is, so a lone
 * `<script>` drops the tag alone and keeps the prose after it.
 *
 * @param {import("markdown-it/lib/rules_inline/state_inline.mjs").default} state
 * @param {(state: any, silent: boolean) => boolean} parse
 * @param {string} name
 */
function skipBody(state, parse, name) {
    const from = state.pos;
    for (let at = from; at < state.posMax; at++) {
        if (state.src[at] !== "<") continue;
        state.pos = at;
        const tag = parse(state, true) ? state.src.slice(at, state.pos) : "";
        if (tag.startsWith("</") && tagName(tag) === name) return;
    }
    state.pos = from;
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
            const start = state.pos;
            const matched = parse(state, ...rest);
            if (matched && name === "html_inline") {
                const tag = state.src.slice(start, state.pos);
                const opened = tag.startsWith("</") ? "" : tagName(tag);
                if (opened && DROPPED_WITH_BODY.has(opened))
                    skipBody(state, parse, opened);
            }
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
