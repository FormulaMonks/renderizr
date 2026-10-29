/**
 * Branding on entry, from `src/components/branding.ts` (ADR 26): entering a
 * workspace of a set gives the page that workspace's primary color, through
 * the CSSOM, and fills silent Mermaid sources with it.
 */

import assert from "node:assert/strict";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { applyBranding } = await importSrc("components/branding");
const { mermaidPrimaryColor } = await importSrc("model/mermaid-styles");

const { document } = dom;

const primary = () =>
    document.documentElement.style.getPropertyValue("--color-primary");

test("a workspace's primary color holds on the page and in Mermaid until a workspace without one is entered", () => {
    dom.reset();
    applyBranding({ logo: null, font: null, primaryColor: "#e4572e" });
    assert.equal(primary(), "#e4572e");
    assert.equal(mermaidPrimaryColor("Light"), "#e4572e");
    assert.equal(mermaidPrimaryColor("Dark"), "#e4572e");

    applyBranding({ logo: null, font: null, primaryColor: null });
    assert.equal(primary(), "");
    assert.equal(mermaidPrimaryColor("Light"), "#145b9e");
});

test("branding writes no style element", () => {
    dom.reset();
    applyBranding({
        logo: null,
        font: { family: "Inter", css: "@font-face{font-family:'Inter'}" },
        primaryColor: "#000",
    });
    assert.equal(document.querySelectorAll("style").length, 0);
});
