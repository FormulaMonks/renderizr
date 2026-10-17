import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import {
    MERMAID_URL,
    encodeBase64,
    encodeMermaid,
} from "../__fixtures__/mermaid.js";
import { decodeMermaid } from "./decode.js";

const SOURCE = 'flowchart LR\n  A["Say \\"hi\\""] --> B\n';

/* ----------------------------------------------------------- decodeMermaid */

test("decodeMermaid reads the source a content field carries", () => {
    const cases = [
        ["pako: on /svg/", encodeMermaid(SOURCE)],
        ["pako: on /img/", encodeMermaid(SOURCE, { kind: "img" })],
        ["plain Base64", encodeBase64(SOURCE)],
        ["a trailing query", `${encodeMermaid(SOURCE)}?type=png&bgColor=fff`],
        [
            "a mermaid.url with a trailing slash",
            encodeMermaid(SOURCE),
            `${MERMAID_URL}/`,
        ],
    ];
    for (const [name, value, url = MERMAID_URL] of cases) {
        assert.equal(decodeMermaid(value, url), SOURCE, name);
    }
});

test("decodeMermaid undoes Structurizr's escaped newlines and quotes", () => {
    const source = 'graph TD\n  A["a \\"quoted\\" word"]\n';
    assert.equal(decodeMermaid(encodeMermaid(source), MERMAID_URL), source);
});

test("decodeMermaid reads a pako: template that is valid JSON too", () => {
    const json = JSON.stringify({ code: "graph TD\n  A-->B", mermaid: {} });
    const value = `${MERMAID_URL}/svg/pako:${deflateSync(json).toString("base64url")}`;
    assert.equal(decodeMermaid(value, MERMAID_URL), "graph TD\n  A-->B");
});

test("decodeMermaid leaves anything that isn't a Mermaid URL alone", () => {
    const cases = [
        ["another host", encodeMermaid(SOURCE, { url: "https://kroki.io" })],
        ["a data URI", "data:image/png;base64,iVBORw0KGgo="],
        ["a picture URL", "https://example.test/diagram.png"],
        ["another path on the server", `${MERMAID_URL}/pdf/abc`],
        ["no value", undefined],
    ];
    for (const [name, value] of cases) {
        assert.equal(decodeMermaid(value, MERMAID_URL), undefined, name);
    }
    assert.equal(
        decodeMermaid(encodeMermaid(SOURCE), undefined),
        undefined,
        "no mermaid.url",
    );
});

test("decodeMermaid gives null for a Mermaid URL that carries no readable source", () => {
    const cases = [
        ["nothing after the path", `${MERMAID_URL}/svg/`],
        ["pako: that doesn't inflate", `${MERMAID_URL}/svg/pako:not-deflate`],
        [
            "Base64 that isn't text",
            `${MERMAID_URL}/img/${Buffer.from([0xff, 0xfe, 0x00, 0x80]).toString("base64url")}`,
        ],
        [
            "pako: around something other than the template",
            `${MERMAID_URL}/svg/pako:${deflateSync("{}").toString("base64url")}`,
        ],
    ];
    for (const [name, value] of cases) {
        assert.equal(decodeMermaid(value, MERMAID_URL), null, name);
    }
});
