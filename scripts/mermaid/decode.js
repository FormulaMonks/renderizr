/**
 * Finds the Mermaid source an image view carries (spec: Which image views
 * draw). Structurizr's `mermaid` keyword writes each content field as a URL
 * on the Mermaid server, `<mermaid.url>/svg/<encoded>` or `/img/<encoded>`,
 * and the encoded part holds the source: `pako:` and Base64 of the deflated
 * JSON template Structurizr fills, or plain Base64. Node's `zlib` decodes
 * both, with no library and no property of our own.
 */

import { inflateSync } from "node:zlib";

/**
 * The fields of an image view that hold its picture; `IMAGE_FIELDS` in
 * `scripts/assets.js` and `src/model/resolve-view.ts` name the same three.
 */
export const CONTENT_FIELDS = ["content", "contentLight", "contentDark"];

/** The JSON template Structurizr deflates around the source. */
const TEMPLATE_START = '{ "code":"';
const TEMPLATE_END = '", "mermaid":{"theme":"default"}}';

/** The text in `bytes`, or `null` when they aren't text. */
function text(bytes) {
    const decoded = bytes.toString("utf8");
    return decoded.trim() && !decoded.includes("�") ? decoded : null;
}

/**
 * The source in Structurizr's template: it escapes only newlines and double
 * quotes, so the template isn't always valid JSON.
 */
function fromTemplate(json) {
    if (json.startsWith(TEMPLATE_START) && json.endsWith(TEMPLATE_END)) {
        return json
            .slice(TEMPLATE_START.length, -TEMPLATE_END.length)
            .replace(/\\(n|")/g, (__, c) => (c === "n" ? "\n" : '"'));
    }
    try {
        const { code } = JSON.parse(json);
        return typeof code === "string" && code.trim() ? code : null;
    } catch {
        return null;
    }
}

/**
 * What the content field `value` holds under `mermaidUrl`: the Mermaid
 * source; `null` for a Mermaid URL that carries none readable; or
 * `undefined` when it isn't a Mermaid URL at all (a picture).
 */
export function decodeMermaid(value, mermaidUrl) {
    if (typeof value !== "string" || typeof mermaidUrl !== "string")
        return undefined;
    const base = mermaidUrl.trim().replace(/\/+$/, "");
    if (!base) return undefined;
    const prefix = [`${base}/svg/`, `${base}/img/`].find((p) =>
        value.startsWith(p),
    );
    if (!prefix) return undefined;
    const encoded = value.slice(prefix.length).split(/[?#]/)[0];
    if (!encoded) return null;
    if (!encoded.startsWith("pako:")) {
        return text(Buffer.from(encoded, "base64url"));
    }
    try {
        const json = text(
            inflateSync(
                Buffer.from(encoded.slice("pako:".length), "base64url"),
            ),
        );
        return json === null ? null : fromTemplate(json);
    } catch {
        return null;
    }
}
