/**
 * Builds image view content the way Structurizr's `mermaid` keyword writes
 * it, so tests and the hand-built Mermaid fixtures share one encoder:
 * Structurizr's JSON template around the source, deflated, Base64url and
 * prefixed `pako:`, on the Mermaid server's `/svg/` or `/img/` path.
 */

import { deflateSync } from "node:zlib";

/** The Mermaid server the fixtures name, as Structurizr's default does. */
export const MERMAID_URL = "https://mermaid.ink";

/** The `pako:` content field Structurizr writes for `source`. */
export function encodeMermaid(
    source,
    { url = MERMAID_URL, kind = "svg" } = {},
) {
    const escaped = source.replace(/"/g, '\\"').replace(/\n/g, "\\n");
    const json = `{ "code":"${escaped}", "mermaid":{"theme":"default"}}`;
    const encoded = deflateSync(Buffer.from(json, "utf8")).toString(
        "base64url",
    );
    return `${url}/${kind}/pako:${encoded}`;
}

/** The plain Base64 content field for `source`. */
export const encodeBase64 = (
    source,
    { url = MERMAID_URL, kind = "img" } = {},
) => `${url}/${kind}/${Buffer.from(source, "utf8").toString("base64url")}`;

/** An image view drawing `source`, with every field `fields` names filled. */
export const mermaidView = (key, source, extra = {}) => ({
    key,
    order: 1,
    content: encodeMermaid(source),
    ...extra,
});

/** A workspace of `imageViews` under `mermaid.url`, with nothing else in it. */
export const mermaidWorkspace = (imageViews, properties = {}) => ({
    name: "Mermaid",
    model: {},
    views: {
        imageViews,
        configuration: {
            properties: { "mermaid.url": MERMAID_URL, ...properties },
        },
    },
});
