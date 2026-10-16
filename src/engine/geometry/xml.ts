/**
 * Text made safe to write into XML, shared by everything that writes SVG by
 * hand: the indicator glyphs and the export's serializer (ADR 21).
 */

/**
 * `text` with the characters XML treats as markup escaped, so it reads back
 * as written both between tags and inside a double-quoted attribute value.
 */
export const escapeXml = (text: string) =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
