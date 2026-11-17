/**
 * A small reader and writer of the start tags in rendered HTML, for the
 * plugins that rewrite an attribute after markdown-it or asciidoctor.js has
 * written the markup (the media resolver, the color-scheme images). It runs
 * after the sanitizer, so every tag it reads is well formed and every value
 * escapes its `>`. A tag nothing changes stays as written, byte for byte.
 */

const ATTRIBUTE =
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * One attribute of a tag: its name, its value with the entities a sanitizer
 * writes decoded (`null` for a bare attribute such as `controls`), and the
 * text it was written as, which a tag keeps while the value stays the same.
 *
 * @typedef {{ name: string, value: string | null, raw?: string }} Attribute
 */

const decodeValue = (value) =>
    value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

const encodeValue = (value) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The attributes of a start tag, from the text between its name and its
 * `>`.
 *
 * @param {string} text
 * @returns {Attribute[]}
 */
function parse(text) {
    return [...text.matchAll(ATTRIBUTE)].map((match) => {
        const value = match[2] ?? match[3] ?? match[4];
        return {
            name: match[1].toLowerCase(),
            value: value === undefined ? null : decodeValue(value),
            raw: match[0],
        };
    });
}

/** @param {Attribute} attribute */
const write = ({ name, value, raw }) =>
    raw ?? (value === null ? name : `${name}="${encodeValue(value)}"`);

/**
 * The attributes of one tag, which a rewrite reads and changes.
 */
export class Attributes {
    /** @param {Attribute[]} list */
    constructor(list) {
        this.list = list;
        this.changed = false;
    }

    /** @param {string} name */
    has(name) {
        return this.list.some((attribute) => attribute.name === name);
    }

    /**
     * @param {string} name
     * @returns {string | null | undefined} The value, `null` when bare,
     *   `undefined` when absent.
     */
    get(name) {
        return this.list.find((attribute) => attribute.name === name)?.value;
    }

    /**
     * @param {string} name
     * @param {string | null} value
     */
    set(name, value) {
        const attribute = this.list.find((each) => each.name === name);
        if (attribute?.value === value) return;
        if (attribute) {
            attribute.value = value;
            delete attribute.raw;
        } else {
            this.list.push({ name, value });
        }
        this.changed = true;
    }

    /** @param {string} name */
    remove(name) {
        const kept = this.list.filter((attribute) => attribute.name !== name);
        if (kept.length === this.list.length) return;
        this.list = kept;
        this.changed = true;
    }

    /** @param {string} name */
    addClass(name) {
        const classes = (this.get("class") ?? "").split(/\s+/).filter(Boolean);
        if (!classes.includes(name))
            this.set("class", [...classes, name].join(" "));
    }
}

/**
 * The attributes of a start tag, from the text between its name and its
 * `>`.
 *
 * @param {string} text
 */
export const attributesOf = (text) => new Attributes(parse(text));

/**
 * `tag` written back with `attributes`.
 *
 * @param {string} tag
 * @param {Attributes} attributes
 * @param {string} [end] What closed the original tag: `>` or `/>`.
 */
export const writeTag = (tag, attributes, end = ">") =>
    `<${tag}${attributes.list.map((attribute) => ` ${write(attribute)}`).join("")}${end}`;

/**
 * `html` with the start tags named `tags` passed through `rewrite`, which
 * changes their attributes in place or returns a string to stand for the
 * tag (`""` drops it). A tag `rewrite` leaves alone stays as written.
 *
 * @param {string} html
 * @param {string[]} tags
 * @param {(tag: string, attributes: Attributes) => string | void} rewrite
 * @returns {string}
 */
export function rewriteTags(html, tags, rewrite) {
    const pattern = new RegExp(`<(${tags.join("|")})\\b([^>]*?)(/?)>`, "gi");
    return html.replace(pattern, (whole, name, text, slash) => {
        const tag = name.toLowerCase();
        const attributes = attributesOf(text);
        const replaced = rewrite(tag, attributes);
        if (typeof replaced === "string") return replaced;
        return attributes.changed
            ? writeTag(name, attributes, `${slash}>`)
            : whole;
    });
}
