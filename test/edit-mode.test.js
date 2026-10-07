/**
 * Edit mode end to end, in a browser (spec 19.2): start `renderizr edit` on
 * a temporary copy of a fixture with the real CLI, open the editing route in
 * headless Chrome and read the document back.
 *
 * Skips without Chrome, as `test/e2e.test.js` does.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { BUILD_JS, REPO_ROOT } from "../scripts/__fixtures__/helpers.js";
import { findChrome, openBrowser, renderPage } from "./support/browser.js";
import { parseDocument } from "./support/dom.js";

const CHROME = findChrome();
const SKIP = CHROME
    ? false
    : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-edit-"));
const stops = [];

after(async () => {
    for (const stop of stops) await stop();
    await rm(SCRATCH, { recursive: true, force: true });
});

/** A port nothing listens on right now, on 127.0.0.1. */
const freePort = () =>
    new Promise((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });

/**
 * Run `renderizr edit` on a copy of `fixture` and resolve with the URL it
 * prints once the server listens and the copy's path, `json`. The server
 * stops when the suite ends.
 */
async function startEdit(fixture) {
    const dir = await mkdtemp(join(SCRATCH, "workspace-"));
    await copyFile(
        join(REPO_ROOT, "test/__fixtures__", fixture),
        join(dir, "workspace.json"),
    );
    const child = spawn(
        process.execPath,
        [
            BUILD_JS,
            "edit",
            dir,
            "--no-open",
            "--port",
            String(await freePort()),
        ],
        { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
    );
    stops.push(
        () =>
            new Promise((resolve) => {
                child.once("exit", resolve);
                child.kill();
            }),
    );

    return new Promise((resolve, reject) => {
        let out = "";
        let err = "";
        const timer = setTimeout(
            () =>
                reject(
                    new Error(
                        `renderizr edit never printed a URL\n${out}\n${err}`,
                    ),
                ),
            60_000,
        );
        child.stderr.on("data", (chunk) => {
            err += chunk;
        });
        child.stdout.on("data", (chunk) => {
            out += chunk;
            const url = /Open (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/.exec(
                out,
            )?.[1];
            if (!url) return;
            clearTimeout(timer);
            resolve({ url, json: join(dir, "workspace.json") });
        });
        child.once("exit", (code) => {
            clearTimeout(timer);
            reject(
                new Error(`renderizr edit exited with ${code}\n${out}\n${err}`),
            );
        });
    });
}

let started;
const session = () => {
    started ??= startEdit("view-types.json");
    return started;
};

/** The document Chrome ends up with at `url` plus the hash route `route`. */
const open = async (route) => {
    const { url } = await session();
    const { html } = await renderPage(CHROME, `${url}#?${route}`);
    return parseDocument(html);
};

test(
    "the editing route of a view opens in editing, with Done",
    { skip: SKIP },
    async () => {
        // Landscape is the base of the fixture's filtered views, so the view
        // drawer hides it; only its editing route reaches it.
        const document = await open("page=diagrams&view=Landscape&mode=edit");

        assert.match(
            document.querySelector("#structurizr-current-view h2").textContent,
            /The shop and everyone it deals with/,
            "the editing route did not open its view",
        );
        assert.ok(
            document.querySelector(".done-editing"),
            "editing shows no Done",
        );
        assert.equal(document.querySelector(".edit-view"), null);
        assert.ok(
            document.documentElement.hasAttribute("data-editing"),
            "the page does not mark itself as editing",
        );
        assert.ok(
            document.querySelector(".react-flow__node"),
            "the engine drew nothing",
        );
    },
);

test(
    "reading an editable view shows the pencil, and a filtered one links to its base",
    { skip: SKIP },
    async () => {
        const warehouse = await open("page=diagrams&view=Warehouse");
        const pencil = warehouse.querySelector(".edit-view");
        assert.ok(pencil, "an editable view shows no pencil");
        assert.equal(pencil.getAttribute("aria-disabled"), null);
        assert.equal(warehouse.querySelector(".done-editing"), null);

        const filtered = await open("page=diagrams&view=NoExternal");
        assert.equal(
            filtered.querySelector(".edit-view").getAttribute("aria-disabled"),
            "true",
        );
        assert.match(
            filtered.querySelector("a.edit-base-view").getAttribute("href"),
            /view=Landscape&mode=edit/,
        );
    },
);

test(
    "the editing route of a filtered view drops to reading",
    { skip: SKIP },
    async () => {
        const document = await open("page=diagrams&view=NoExternal&mode=edit");
        assert.equal(document.querySelector(".done-editing"), null);
        assert.ok(!document.documentElement.hasAttribute("data-editing"));
    },
);

/** Element 20's entry in the Warehouse view of the `workspace.json` at `json`. */
const warehouseElement = async (json) =>
    JSON.parse(await readFile(json, "utf8"))
        .views.customViews.find((view) => view.key === "Warehouse")
        .elements.find((element) => element.id === "20");

test(
    "dragging an element and saving writes its new position into workspace.json",
    { skip: SKIP },
    async () => {
        // A session of its own, since this one writes the file.
        const { url, json } = await startEdit("view-types.json");
        const before = await warehouseElement(json);
        const browser = await openBrowser(CHROME);
        try {
            const page = await browser.open(
                `${url}#?page=diagrams&view=Warehouse&mode=edit`,
            );
            await page.waitFor(
                `!!document.querySelector('[data-ready="true"] .react-flow__node[data-id="20"]')`,
            );
            const box = await page.evaluate(`(() => {
                const r = document.querySelector('.react-flow__node[data-id="20"]').getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            })()`);
            await page.drag(box, { x: box.x + 120, y: box.y + 60 });
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Unsaved changes"`,
            );
            // Ctrl+S, by physical key, saves at once (spec 7.4).
            await page.press("s", "KeyS", 2);
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Saved"`,
            );
        } finally {
            await browser.close();
        }

        const after = await warehouseElement(json);
        assert.ok(after.x > before.x, `x went from ${before.x} to ${after.x}`);
        assert.ok(after.y > before.y, `y went from ${before.y} to ${after.y}`);
        assert.equal(after.x % 5, 0, "the drop is off the 5-unit grid");
        assert.equal(after.y % 5, 0, "the drop is off the 5-unit grid");
        const text = await readFile(json, "utf8");
        assert.ok(
            text.startsWith('{\n  "') && !text.endsWith("\n"),
            "workspace.json isn't in Jackson's format",
        );
        assert.match(text, /"lastModifiedAgent" : "renderizr\//);
    },
);

/** Each element of the Containers view in the `workspace.json` at `json`, by id. */
const containerElements = async (json) =>
    new Map(
        JSON.parse(await readFile(json, "utf8"))
            .views.containerViews.find((view) => view.key === "Containers")
            .elements.map((element) => [element.id, element]),
    );

test(
    "a marquee drawn inside a boundary selects the elements in it, and a drag moves and saves them all",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("big-bank-plc-stored.json");
        const before = await containerElements(json);
        const browser = await openBrowser(CHROME);
        try {
            const page = await browser.open(
                `${url}#?page=diagrams&view=Containers&mode=edit`,
            );
            await page.waitFor(
                `!!document.querySelector('[data-ready="true"] .react-flow__node[data-id="17"]')`,
            );
            const rects = await page.evaluate(`(() => {
                const rect = (id) => {
                    const r = document.querySelector('.react-flow__node[data-id="' + id + '"]').getBoundingClientRect();
                    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
                };
                return { web: rect("19"), spa: rect("17"), mobile: rect("18"), boundary: rect("boundary:7") };
            })()`);
            // From the empty boundary between the Web Application and the
            // Single-Page Application, round the Single-Page Application and
            // the Mobile App.
            const start = {
                x: (rects.web.right + rects.spa.left) / 2,
                y: rects.spa.top - 2,
            };
            assert.ok(
                start.x > rects.boundary.left && start.y > rects.boundary.top,
                "the marquee starts outside the boundary",
            );
            await page.drag(start, {
                x: rects.mobile.right + 10,
                y: rects.mobile.bottom + 10,
            });
            const selected = await page.evaluate(
                `[...document.querySelectorAll(".react-flow__node.selected")].map((node) => node.dataset.id).sort()`,
            );
            assert.deepEqual(selected, ["17", "18"]);
            assert.equal(
                await page.evaluate(
                    `document.querySelector(".react-flow__node[data-reference]")?.dataset.id`,
                ),
                "17",
                "the element nearest the marquee's starting corner isn't the reference element",
            );

            // Drag the selection by the Mobile App.
            const from = {
                x: (rects.mobile.left + rects.mobile.right) / 2,
                y: (rects.mobile.top + rects.mobile.bottom) / 2,
            };
            await page.drag(from, { x: from.x + 90, y: from.y + 45 });
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Unsaved changes"`,
            );
            await page.press("s", "KeyS", 2);
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Saved"`,
            );
        } finally {
            await browser.close();
        }

        const after = await containerElements(json);
        const delta = (id) => ({
            x: after.get(id).x - before.get(id).x,
            y: after.get(id).y - before.get(id).y,
        });
        assert.ok(
            delta("17").x > 0 && delta("17").y > 0,
            `the Single-Page Application moved by ${JSON.stringify(delta("17"))}`,
        );
        assert.deepEqual(delta("18"), delta("17"), "the selection split up");
        for (const id of ["1", "19", "20", "27"])
            assert.deepEqual(delta(id), { x: 0, y: 0 }, `${id} moved`);
    },
);
