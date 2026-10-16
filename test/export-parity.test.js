/**
 * Label parity (ADR 21): the island lays out element labels with CSS and
 * the export's serializer lays them out again for `<text>`. This test draws
 * `test/__fixtures__/export.json` in headless Chrome, exports each view as
 * SVG through the report build's hook, and checks that both break every
 * element's name, metadata and description at the same places.
 *
 * Skips without Chrome, as `test/e2e.test.js` does.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildForAcceptance, viewUrl } from "./support/acceptance.js";
import { findChrome, openBrowser } from "./support/browser.js";

const CHROME = findChrome();
const SKIP = CHROME
    ? false
    : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-export-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

/** The views of the fixture to compare, between them every icon position. */
const VIEWS = ["AutoFrame", "Containers", "Request"];

/**
 * In the page: each element's label lines, as the island draws them and as
 * the export writes them, by element id and label part. The island's lines
 * come from where each character lands; collapsed white space has no box.
 */
const COMPARE = `(async () => {
    await document.fonts.ready;
    const blob = await window.renderizrExportView("svg");
    const svg = new DOMParser().parseFromString(await blob.text(), "image/svg+xml");
    const exported = {};
    for (const element of svg.querySelectorAll("[data-element-id]")) {
        const parts = {};
        for (const part of element.querySelectorAll("[data-label]"))
            parts[part.getAttribute("data-label")] = [...part.querySelectorAll("text")]
                .map((text) => text.textContent);
        exported[element.getAttribute("data-element-id")] = parts;
    }

    const linesOf = (block) => {
        const lines = [];
        const range = document.createRange();
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let top = null;
        let line = "";
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            for (let at = 0; at < node.length; at++) {
                range.setStart(node, at);
                range.setEnd(node, at + 1);
                const [box] = range.getClientRects();
                if (!box || node.data[at] === "\\n") continue;
                if (top !== null && Math.abs(box.top - top) > 0.5) {
                    lines.push(line);
                    line = "";
                }
                top = box.top;
                line += node.data[at];
            }
        }
        lines.push(line);
        return lines.map((text) => text.replace(/\\s+/g, " ").trim()).filter(Boolean);
    };
    const drawn = {};
    const canvas = document.querySelector('[data-ready="true"]');
    for (const element of canvas.querySelectorAll("[data-element-id]")) {
        const label = element.querySelector("[data-element-label]");
        if (!label) continue;
        const shown = (selector) =>
            [...label.querySelectorAll(selector)].find(
                (block) => !block.closest('[aria-hidden="true"]'),
            );
        const parts = {};
        for (const [part, selector] of [
            ["name", "[data-element-name]"],
            ["metadata", "[data-element-metadata]"],
            ["description", "[data-element-description]"],
        ]) {
            const block = shown(selector);
            if (!block) continue;
            // A clamped description keeps the lines it hides in the layout.
            const clamp = Number(block.style.webkitLineClamp) || undefined;
            parts[part] = linesOf(block).slice(0, clamp);
        }
        drawn[element.getAttribute("data-element-id")] = parts;
    }
    const root = svg.documentElement;
    const size = { width: root.getAttribute("width"), height: root.getAttribute("height") };
    return { exported, drawn, size };
})()`;

/** The canvas width each view's export takes: dimensions, then paper size. */
const WIDTHS = { Containers: "2400", Request: "2480" };

test(
    "the island and the export break element labels at the same places",
    { skip: SKIP },
    async () => {
        const workspace = JSON.parse(
            await readFile(
                new URL("./__fixtures__/export.json", import.meta.url),
                "utf8",
            ),
        );
        const site = await buildForAcceptance(workspace, SCRATCH, {
            report: true,
        });
        const browser = await openBrowser(CHROME);
        try {
            for (const view of VIEWS) {
                const page = await browser.open(viewUrl(site, view));
                await page.waitFor(
                    `document.querySelector('[data-ready="true"][data-view-key="${view}"]') && typeof window.renderizrExportView === "function"`,
                );
                await page.settle();
                const { exported, drawn, size } = await page.evaluate(COMPARE);
                if (WIDTHS[view])
                    assert.equal(size.width, WIDTHS[view], `${view}: width`);
                assert.deepEqual(
                    Object.keys(exported).sort(),
                    Object.keys(drawn).sort(),
                    `${view}: the same elements are drawn and exported`,
                );
                for (const [id, parts] of Object.entries(drawn)) {
                    const lines = exported[id];
                    assert.deepEqual(
                        Object.keys(lines).sort(),
                        Object.keys(parts).sort(),
                        `${view}, element ${id}: the same label parts`,
                    );
                    for (const [part, island] of Object.entries(parts)) {
                        const svg = lines[part];
                        if (part !== "description") {
                            assert.deepEqual(
                                svg,
                                island,
                                `${view}, element ${id}: the ${part} breaks alike`,
                            );
                            continue;
                        }
                        // The island draws the ellipsis over the last line
                        // it keeps, so that line only has to start alike.
                        assert.deepEqual(
                            svg.slice(0, -1),
                            island.slice(0, -1),
                            `${view}, element ${id}: the description breaks alike`,
                        );
                        assert.equal(
                            svg.length,
                            island.length,
                            `${view}, element ${id}: the description keeps as many lines`,
                        );
                        const last = svg.at(-1).replace(/…$/, "");
                        assert.ok(
                            island.at(-1)?.startsWith(last),
                            `${view}, element ${id}: the last description line "${svg.at(-1)}" starts "${island.at(-1)}"`,
                        );
                    }
                }
            }
        } finally {
            await browser.close();
        }
    },
);
