/**
 * Collapsed sections: GitHub's `<details>` and AsciiDoc's `[%collapsible]`
 * block. The build (`scripts/documentation/collapsed-sections.js`) gives
 * both syntaxes the same classes, and the page
 * (`src/components/collapsed-sections.ts`) opens the ones around a link's
 * target and prints every one open.
 */

import assert from "node:assert/strict";
import { beforeEach } from "node:test";
import { renderSection } from "../scripts/documentation/index.js";
import { DOMEvent } from "./support/dom.js";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { openAround } = await importSrc("components/collapsed-sections");

const markdown = (content) =>
    renderSection({ filename: "01-a.md", format: "Markdown", content });

const asciidoc = (content) =>
    renderSection({ filename: "01-a.adoc", format: "AsciiDoc", content });

/* ----------------------------------------------------------------- the build */

test("a Markdown collapsed section takes the collapsed section's classes", async () => {
    assert.equal(
        await markdown(
            "<details>\n<summary>More</summary>\n\nSome **bold** text.\n\n</details>\n",
        ),
        '<details class="rz-collapsed">\n<summary class="rz-collapsed-summary">More</summary>\n<p>Some <strong>bold</strong> text.</p>\n</details>\n',
    );
});

test("an author's own class and the open attribute stay beside the collapsed section's", async () => {
    assert.equal(
        await markdown(
            '<details class="faq" open>\n<summary class="q">More</summary>\n\nShown.\n\n</details>\n',
        ),
        '<details class="rz-collapsed faq" open>\n<summary class="rz-collapsed-summary q">More</summary>\n<p>Shown.</p>\n</details>\n',
    );
});

test("a collapsed section in a table cell takes the classes too", async () => {
    const html = await markdown(
        "| a |\n|---|\n| <details><summary>Why</summary>Because.</details> |\n",
    );
    assert.match(
        html,
        /<td><details class="rz-collapsed"><summary class="rz-collapsed-summary">Why<\/summary>Because\.<\/details><\/td>/,
    );
});

test("a heading as the summary shifts one level, like the Markdown heading it stands for", async () => {
    assert.match(
        await markdown(
            "<details>\n<summary><h3>Fold</h3></summary>\n\nUnder it.\n\n</details>\n",
        ),
        /<summary class="rz-collapsed-summary"><h4>Fold<\/h4><\/summary>/,
    );
});

test("with no blank line after its summary, the text that follows stays as written", async () => {
    assert.equal(
        await markdown(
            "<details><summary>Tight</summary>\n**Not bold** here.\n</details>\n",
        ),
        '<details class="rz-collapsed"><summary class="rz-collapsed-summary">Tight</summary>\n**Not bold** here.\n</details>\n',
    );
});

test("text that only mentions details in a code span is left alone", async () => {
    assert.equal(
        await markdown("Write `<details>` around it.\n"),
        "<p>Write <code>&lt;details&gt;</code> around it.</p>\n",
    );
});

test("an AsciiDoc collapsible block takes the same classes, its title as the summary", async () => {
    assert.equal(
        await asciidoc(".More\n[%collapsible]\n====\nHidden.\n====\n"),
        '<details class="rz-collapsed">\n<summary class="rz-collapsed-summary">More</summary>\n<div class="content">\n<p>Hidden.</p>\n</div>\n</details>\n',
    );
});

test("an AsciiDoc collapsible block with no title reads Details, and %open starts it open", async () => {
    assert.equal(
        await asciidoc("[#faq.wide%collapsible%open]\n====\nShown.\n====\n"),
        '<details id="faq" class="rz-collapsed wide" open>\n<summary class="rz-collapsed-summary">Details</summary>\n<div class="content">\n<p>Shown.</p>\n</div>\n</details>\n',
    );
});

test("an AsciiDoc example block that is not collapsible stays as asciidoctor.js writes it", async () => {
    assert.equal(
        await asciidoc("====\nShown.\n====\n"),
        '<div class="exampleblock">\n<div class="content">\n<p>Shown.</p>\n</div>\n</div>\n',
    );
});

test("a discrete heading inside an AsciiDoc collapsible block shifts like a section heading", async () => {
    assert.match(
        await asciidoc(
            ".More\n[%collapsible]\n====\n[discrete]\n=== Inside\n\nText.\n====\n",
        ),
        /<h4 id="inside" class="discrete" tabindex="-1">Inside<\/h4>/,
    );
});

/* ------------------------------------------------------------------ the page */

beforeEach(() => dom.reset());

/** Three collapsed sections, one inside the other, a heading in the last. */
const nested = () => {
    const host = dom.mount("content");
    host.innerHTML = [
        '<details class="rz-collapsed" id="one"><summary class="rz-collapsed-summary">One</summary>',
        '<details class="rz-collapsed" id="two"><summary class="rz-collapsed-summary">Two</summary>',
        '<details class="rz-collapsed" id="three" open><summary class="rz-collapsed-summary">Three</summary>',
        '<h2 id="deep">Deep</h2>',
        "</details></details></details>",
        '<details class="rz-collapsed" id="other"><summary class="rz-collapsed-summary">Other</summary><p>Elsewhere.</p></details>',
    ].join("");
    return host;
};

const openIds = (host) =>
    host
        .querySelectorAll("details")
        .filter((details) => details.hasAttribute("open"))
        .map((details) => details.id);

test("opening around a heading opens every collapsed section that holds it, and no other", () => {
    const host = nested();

    openAround(host.querySelector("#deep"));

    assert.deepEqual(openIds(host), ["one", "two", "three"]);
});

test("opening around nothing, or a heading in no collapsed section, does nothing", () => {
    const host = nested();

    assert.doesNotThrow(() => openAround(null));
    openAround(host);

    assert.deepEqual(openIds(host), ["three"]);
});

test("printing opens every collapsed section, then returns each to the state the reader left it in", () => {
    const host = nested();
    host.querySelector("#other").setAttribute("open", "");

    dom.window.dispatchEvent(new DOMEvent("beforeprint"));
    assert.deepEqual(openIds(host), ["one", "two", "three", "other"]);

    dom.window.dispatchEvent(new DOMEvent("afterprint"));
    assert.deepEqual(openIds(host), ["three", "other"]);
});
