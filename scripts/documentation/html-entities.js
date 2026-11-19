/**
 * Text into HTML and back, for every module of the build that writes markup
 * by hand or reads what markdown-it, asciidoctor.js or the sanitizer wrote
 * (ADR 31). One pair, so every piece of markup the build writes escapes the
 * same characters.
 */

/** The characters `escapeHtml` writes as entities, and their entities. */
const ESCAPES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
});

/** The named entities `unescapeHtml` reads, by lowercase name. */
const NAMED = Object.freeze({
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
});

/** The highest code point Unicode holds. */
const MAX_CODE_POINT = 0x10ffff;

/**
 * `value` as HTML text, safe inside a double-quoted attribute too: `&`, `<`,
 * `>` and `"` become entities, the way markdown-it escapes them.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const escapeHtml = (value) =>
    String(value).replace(/[&<>"]/g, (character) => ESCAPES[character]);

/**
 * The text `html` escapes: the entities of `NAMED` and every numeric one
 * read back. One pass reads each entity once, so `&amp;lt;` reads as `&lt;`
 * and never as `<`. An entity it does not know stays as written.
 *
 * @param {unknown} html
 * @returns {string}
 */
export const unescapeHtml = (html) =>
    String(html).replace(
        /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
        (entity, decimal, hex, name) => {
            if (name) return NAMED[name.toLowerCase()] ?? entity;
            const code = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
            return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : entity;
        },
    );
