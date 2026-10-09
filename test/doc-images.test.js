/**
 * `src/components/doc-images.ts`: how an image a documentation file shows
 * becomes the copy Structurizr embedded in the workspace.
 *
 * Structurizr's `!docs` and `!adrs` importers read every image a file
 * references into `documentation.images`, named by its path relative to the
 * folder and holding its bytes as base64. The page has no folder to load the
 * file from, so it draws the embedded copy.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { createImageResolver } = await importSrc("components/doc-images");

const resolve = createImageResolver([
    { name: "edit-mode.png", type: "image/png", content: "iVBORw0KGgo=" },
    { name: "images/site light.jpg", type: "image/jpeg", content: "/9j/4AAQ" },
    {
        name: "legacy.svg",
        type: "image/svg+xml",
        content: "data:image/svg+xml;base64,PHN2Zz4=",
    },
]);

test("an embedded image resolves to a data URI of its type", () => {
    assert.equal(
        resolve("edit-mode.png"),
        "data:image/png;base64,iVBORw0KGgo=",
    );
});

test("a ./ prefix and percent-encoding name the same image", () => {
    assert.equal(
        resolve("./images/site%20light.jpg"),
        "data:image/jpeg;base64,/9j/4AAQ",
    );
});

test("content that is already a data URI is used as it is", () => {
    assert.equal(resolve("legacy.svg"), "data:image/svg+xml;base64,PHN2Zz4=");
});

test("an image the workspace lacks, a URL or an anchor is left alone", () => {
    for (const src of [
        "missing.png",
        "https://example.com/edit-mode.png",
        "data:image/png;base64,AAAA",
        "/edit-mode.png",
        "",
    ]) {
        assert.equal(resolve(src), undefined, src);
    }
});

test("a workspace with no images resolves nothing", () => {
    assert.equal(createImageResolver(undefined)("edit-mode.png"), undefined);
});
