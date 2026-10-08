/**
 * Edit mode end to end, in a browser (spec 19.2): start `renderizr edit` on
 * a temporary copy of a fixture with the real CLI, open the editing route in
 * headless Chrome and read the document back.
 *
 * Skips without Chrome, as `test/e2e.test.js` does.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        [BUILD_JS, "edit", dir, "--port", String(await freePort())],
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
            await page.settle();
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

/** The Warehouse view of the `workspace.json` at `json`. */
const warehouseView = async (json) =>
    JSON.parse(await readFile(json, "utf8")).views.customViews.find(
        (view) => view.key === "Warehouse",
    );

test(
    "Calculate layout saves a calculated layout, and undoing it saves the layout back",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const stored = await warehouseView(json);
        const browser = await openBrowser(CHROME);
        let calculated;
        try {
            const page = await browser.open(
                `${url}#?page=diagrams&view=Warehouse&mode=edit`,
            );
            await page.waitFor(
                `!!document.querySelector('[data-ready="true"] [data-canvas-frame]')`,
            );
            await page.settle();
            await page.evaluate(
                `document.querySelector(".calculate-layout").click()`,
            );
            await page.waitFor(
                `!!document.querySelector("[data-calculate-layout-dialog] .calculate")`,
            );
            await page.evaluate(
                `document.querySelector("[data-calculate-layout-dialog] .calculate").click()`,
            );
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Unsaved changes"`,
            );
            await page.press("s", "KeyS", 2);
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Saved"`,
            );
            calculated = await warehouseView(json);

            // Ctrl+Z undoes the whole run as one step (spec 15, 16).
            await page.press("z", "KeyZ", 2);
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

        assert.notDeepEqual(
            calculated.elements,
            stored.elements,
            "Calculate layout moved nothing",
        );
        assert.ok(calculated.dimensions, "the run saved no dimensions");
        assert.equal(
            calculated.automaticLayout,
            undefined,
            "the run wrote automaticLayout",
        );
        const undone = await warehouseView(json);
        assert.deepEqual(undone.elements, stored.elements);
        assert.deepEqual(undone.dimensions, { height: 2000, width: 2000 });
        assert.equal(undone.automaticLayout, undefined);
    },
);

test(
    "Fit the canvas to the diagram brings the whole canvas on screen, shaded apart from the space around it, and zooming out goes past it",
    { skip: SKIP },
    async () => {
        const { url } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await browser.open(
                `${url}#?page=diagrams&view=Warehouse&mode=edit`,
            );
            await page.waitFor(
                `!!document.querySelector('[data-ready="true"] [data-canvas-frame]')`,
            );
            await page.settle();
            for (let step = 0; step < 4; step++)
                await page.evaluate(
                    `document.querySelector(".zoom-in").click()`,
                );
            const box = `(() => {
                const frame = document.querySelector("[data-canvas-frame]");
                const canvas = frame.closest('[tabindex="0"]');
                const f = frame.getBoundingClientRect();
                const c = canvas.getBoundingClientRect();
                return f.left >= c.left - 1 && f.right <= c.right + 1 &&
                    f.top >= c.top - 1 && f.bottom <= c.bottom + 1;
            })()`;
            await page.waitFor(`!${box}`);
            await page.evaluate(
                `document.querySelector('.resize-canvas[data-command="auto"]').click()`,
            );
            await page.waitFor(box);

            // The canvas keeps the scheme's background; the space around it
            // is shaded (spec 14).
            const [canvas, outside] = await page.evaluate(`(() => {
                const frame = document.querySelector("[data-canvas-frame]");
                return [
                    getComputedStyle(frame).backgroundColor,
                    getComputedStyle(frame.closest('[tabindex="0"]')).backgroundColor,
                ];
            })()`);
            assert.notEqual(canvas, outside);

            // Zooming out goes past the whole canvas, so it shows with room
            // around it.
            for (let step = 0; step < 6; step++)
                await page.evaluate(
                    `document.querySelector(".zoom-out").click()`,
                );
            await page.waitFor(`(() => {
                const frame = document.querySelector("[data-canvas-frame]");
                const canvas = frame.closest('[tabindex="0"]');
                const f = frame.getBoundingClientRect();
                const c = canvas.getBoundingClientRect();
                return f.width < c.width * 0.85 && f.height < c.height * 0.85;
            })()`);
        } finally {
            await browser.close();
        }
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
            await page.settle();
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
            await page.waitFor(
                `document.querySelectorAll(".react-flow__node.selected").length === 2`,
            );
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

            // Drag the selection by the Mobile App, measured again now.
            await page.settle();
            const from = await page.evaluate(`(() => {
                const r = document.querySelector('.react-flow__node[data-id="18"]').getBoundingClientRect();
                return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            })()`);
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

/** DevTools' modifier bits. */
const ALT = 1;
const CTRL = 2;
const SHIFT = 8;

test(
    "Alt+A aligns the selection on its leftmost element, whichever was selected first, undo and redo step through it, and a save keeps the history",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("big-bank-plc-stored.json");
        const before = await containerElements(json);
        const browser = await openBrowser(CHROME);
        const toolbar = (name) =>
            `document.querySelector(".${name}")?.disabled`;
        try {
            const page = await browser.open(
                `${url}#?page=diagrams&view=Containers&mode=edit`,
            );
            await page.waitFor(
                `!!document.querySelector('[data-ready="true"] .react-flow__node[data-id="20"]')`,
            );
            await page.settle();
            const center = (id) =>
                page.evaluate(`(() => {
                    const r = document.querySelector('.react-flow__node[data-id="${id}"]').getBoundingClientRect();
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                })()`);
            // The Mobile App first, so it is the reference element, then
            // the API Application, which lies further left.
            await page.click(await center("18"));
            await page.click(await center("20"), SHIFT);
            await page.waitFor(
                `document.querySelectorAll(".react-flow__node.selected").length === 2`,
            );
            assert.equal(
                await page.evaluate(toolbar("align-selection")),
                false,
                "align is disabled with two elements selected",
            );
            assert.equal(
                await page.evaluate(toolbar("distribute-selection")),
                true,
                "distribute is enabled with two elements selected",
            );

            await page.press("å", "KeyA", ALT);
            await page.waitFor(`${toolbar("undo-layout")} === false`);
            await page.press("s", "KeyS", CTRL);
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Saved"`,
            );
            const aligned = await containerElements(json);
            const leftmost = Math.min(before.get("18").x, before.get("20").x);
            assert.equal(before.get("20").x, leftmost);
            assert.equal(aligned.get("18").x, leftmost);
            assert.equal(aligned.get("20").x, leftmost);
            assert.equal(aligned.get("18").y, before.get("18").y);

            // The save kept the history: undo, then redo, one step each.
            await page.press("z", "KeyZ", CTRL);
            await page.waitFor(
                `${toolbar("undo-layout")} === true && ${toolbar("redo-layout")} === false`,
            );
            await page.press("z", "KeyZ", CTRL | SHIFT);
            await page.waitFor(`${toolbar("redo-layout")} === true`);
            await page.press("z", "KeyZ", CTRL);
            await page.waitFor(`${toolbar("redo-layout")} === false`);
            await page.press("s", "KeyS", CTRL);
            await page.waitFor(
                `document.querySelector(".save-status")?.textContent === "Saved"`,
            );
        } finally {
            await browser.close();
        }

        const undone = await containerElements(json);
        assert.equal(undone.get("20").x, before.get("20").x);
        assert.equal(undone.get("18").x, before.get("18").x);
    },
);

/** Relationship `id` of the Containers view in the `workspace.json` at `json`. */
const containerRelationship = async (json, id) =>
    JSON.parse(await readFile(json, "utf8"))
        .views.containerViews.find((view) => view.key === "Containers")
        .relationships.find((relationship) => relationship.id === id);

test(
    "editing an edge saves its routing mode, a vertex and where it is dragged, a chosen side and its label position into workspace.json",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("big-bank-plc-stored.json");
        const email = (await containerElements(json)).get("5");
        const browser = await openBrowser(CHROME);
        let added;
        let dragged;
        try {
            const page = await browser.open(
                `${url}#?page=diagrams&view=Containers&mode=edit`,
            );
            await page.waitFor(
                `!!document.querySelector('[data-ready="true"] .react-flow__edge[data-id="11"] [data-hit-stroke]')`,
            );
            await page.settle();
            // A point `fraction` along the line of "Sends e-mails to", on screen.
            const along = (fraction) =>
                page.evaluate(`(() => {
                    const path = document.querySelector('.react-flow__edge[data-id="11"] [data-hit-stroke]');
                    const point = path.getPointAtLength(path.getTotalLength() * ${fraction});
                    const m = path.getScreenCTM();
                    return { x: point.x * m.a + m.e, y: point.y * m.d + m.f };
                })()`);
            const center = (selector) =>
                page.evaluate(`(() => {
                    const r = document.querySelector('${selector}').getBoundingClientRect();
                    return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top };
                })()`);
            const save = async () => {
                await page.waitFor(
                    `document.querySelector(".save-status")?.textContent === "Unsaved changes"`,
                );
                await page.press("s", "KeyS", 2);
                await page.waitFor(
                    `document.querySelector(".save-status")?.textContent === "Saved"`,
                );
            };

            // A click on the line selects the edge (spec 12.1).
            await page.click(await along(0.5));
            await page.waitFor(
                `!!document.querySelector('[data-selected-edge="11"]') && !document.querySelector(".routing-mode").hidden`,
            );
            assert.equal(
                await page.evaluate(
                    `document.querySelector(".routing-mode").getAttribute("aria-label")`,
                ),
                "Routing mode: Direct",
            );
            // The toolbar button cycles the routing mode (spec 12.2).
            await page.evaluate(
                `document.querySelector(".routing-mode").click()`,
            );
            await page.waitFor(
                `document.querySelector(".routing-mode").getAttribute("aria-label") === "Routing mode: Orthogonal"`,
            );
            // Alt+R does the same, round the three modes and back.
            const ROUTING = `document.querySelector(".routing-mode").getAttribute("aria-label")`;
            for (const mode of ["Curved", "Direct", "Orthogonal"]) {
                await page.press("®", "KeyR", ALT);
                await page.waitFor(
                    `${ROUTING} === ${JSON.stringify(`Routing mode: ${mode}`)}`,
                );
            }
            await save();

            // A double-click on the line adds a vertex (spec 12.3).
            await page.doubleClick(await along(0.7));
            await page.waitFor(
                `!!document.querySelector('[data-vertex-handle="11:0"]')`,
            );
            await save();
            [added] = (await containerRelationship(json, "11")).vertices;

            // A drag on its handle moves the vertex (spec 12.3).
            const vertex = await center('[data-vertex-handle="11:0"]');
            await page.drag(vertex, { x: vertex.x + 40, y: vertex.y + 30 });
            await save();
            [dragged] = (await containerRelationship(json, "11")).vertices;
            assert.ok(
                dragged.x > added.x && dragged.y > added.y,
                `the vertex went from ${JSON.stringify(added)} to ${JSON.stringify(dragged)}`,
            );

            // The source end goes to the E-mail System's top (spec 12.4).
            const end = await center('[data-edge-end-handle="source"]');
            const box = await center('.react-flow__node-box[data-id="5"]');
            await page.drag(end, { x: box.x, y: box.top - 15 });
            await page.waitFor(
                `!!document.querySelector('[data-vertex-handle="11:1"]')`,
            );
            await save();

            // The label slides along the route (spec 12.7).
            const label = await center('[data-relationship-label="11"]');
            await page.drag(label, { x: label.x - 40, y: label.y });
            await save();
        } finally {
            await browser.close();
        }

        const relationship = await containerRelationship(json, "11");
        assert.equal(relationship.routing, "Orthogonal");
        assert.equal(relationship.vertices.length, 2, "a vertex went missing");
        assert.deepEqual(
            relationship.vertices[1],
            dragged,
            "the side moved the dragged vertex",
        );
        assert.equal(
            relationship.vertices[0].y,
            email.y - 20,
            "the side vertex isn't 20 units above the E-mail System",
        );
        assert.ok(
            Number.isInteger(relationship.position) &&
                relationship.position >= 0 &&
                relationship.position <= 100,
            `position is ${relationship.position}`,
        );
    },
);

/* ------------------------------------------------------------ live reload */

/**
 * Change the `workspace.json` at `json` on disk, as another tool would:
 * `change` edits the parsed workspace in place.
 */
async function changeOnDisk(json, change) {
    const workspace = JSON.parse(await readFile(json, "utf8"));
    change(workspace);
    await writeFile(json, JSON.stringify(workspace, null, 2));
}

/** The Warehouse view of a parsed `workspace`. */
const warehouseOf = (workspace) =>
    workspace.views.customViews.find((view) => view.key === "Warehouse");

/** Where element `id` of the Warehouse view sits in a parsed `workspace`. */
const placementOf = (workspace, id) =>
    warehouseOf(workspace).elements.find((element) => element.id === id);

/** The page's expressions the live-reload tests read. */
const NODE = (id) =>
    `document.querySelector('.react-flow__node[data-id="${id}"]')`;
const VIEWPORT = `document.querySelector(".react-flow__viewport").style.transform`;
const NODE_TRANSFORM = (id) => `${NODE(id)}?.style.transform`;
const SAVE_STATUS = `document.querySelector(".save-status")?.textContent`;
const HELD_BAR = `document.querySelector("[data-held-bar]")`;

/** Open the Warehouse view in editing at `url`, once it is painted. */
async function openWarehouse(browser, url) {
    const page = await browser.open(
        `${url}#?page=diagrams&view=Warehouse&mode=edit`,
    );
    await page.waitFor(
        `!!document.querySelector('[data-ready="true"] .react-flow__node[data-id="20"]')`,
    );
    await page.settle();
    return page;
}

/** The middle of element `id` on screen. */
const centerOf = (page, id) =>
    page.evaluate(`(() => {
        const r = ${NODE(id)}.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);

test(
    "a change on disk swaps the workspace in place, keeping the view, the viewport, the selection and an untouched view's history",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await openWarehouse(browser, url);
            // An edit, saved, gives the view a step to undo.
            const from = await centerOf(page, "20");
            await page.drag(from, { x: from.x + 60, y: from.y + 30 });
            await page.press("s", "KeyS", CTRL);
            await page.waitFor(`${SAVE_STATUS} === "Saved"`);
            await page.click(await centerOf(page, "21"));
            await page.waitFor(`${NODE("21")}.classList.contains("selected")`);
            const viewport = await page.evaluate(VIEWPORT);

            // Other views change: the Warehouse keeps its history. The view
            // drawer names the renamed view once the change has landed, so
            // the next write never races this one in the file watcher.
            await changeOnDisk(json, (workspace) => {
                workspace.views.systemLandscapeViews[0].elements[0].x += 100;
                workspace.views.imageViews.find(
                    (view) => view.key === "NoPicture",
                ).title = "Image: changed on disk";
            });
            await page.waitFor(
                `!!document.querySelector('[aria-label*="Image: changed on disk"]')`,
            );
            await page.waitFor(
                `document.querySelector(".undo-layout")?.disabled === false && ${NODE("21")}.classList.contains("selected")`,
            );

            // The Warehouse changes: element 21 moves, the history goes.
            const before = await page.evaluate(NODE_TRANSFORM("21"));
            await changeOnDisk(json, (workspace) => {
                placementOf(workspace, "21").x += 200;
            });
            await page.waitFor(
                `${NODE_TRANSFORM("21")} !== ${JSON.stringify(before)}`,
            );
            await page.waitFor(
                `document.querySelector(".undo-layout")?.disabled === true`,
            );
            assert.equal(
                await page.evaluate(VIEWPORT),
                viewport,
                "the viewport moved",
            );
            assert.ok(
                await page.evaluate(
                    `${NODE("21")}.classList.contains("selected")`,
                ),
                "the selection lost element 21",
            );
            assert.equal(await page.evaluate(SAVE_STATUS), "Saved");
            assert.equal(await page.evaluate(HELD_BAR), null);
            assert.ok(
                await page.evaluate(
                    `new URLSearchParams(location.hash.slice(2)).get("view") === "Warehouse" && document.documentElement.hasAttribute("data-editing")`,
                ),
                "the page left the Warehouse's editing route",
            );
        } finally {
            await browser.close();
        }
    },
);

test(
    "edits waiting when workspace.json changes lie over it behind a bar, and Keep saves them against the file",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await openWarehouse(browser, url);
            const from = await centerOf(page, "20");
            await page.drag(from, { x: from.x + 60, y: from.y + 30 });
            await page.waitFor(`${SAVE_STATUS} === "Unsaved changes"`);
            const dragged = await page.evaluate(NODE_TRANSFORM("20"));
            const before21 = await page.evaluate(NODE_TRANSFORM("21"));

            await changeOnDisk(json, (workspace) => {
                placementOf(workspace, "21").x += 200;
            });
            await page.waitFor(`!!${HELD_BAR}`);
            assert.match(
                await page.evaluate(`${HELD_BAR}.textContent`),
                /workspace\.json changed on disk while .+ had unsaved changes/,
            );
            assert.equal(await page.evaluate(NODE_TRANSFORM("20")), dragged);
            assert.notEqual(
                await page.evaluate(NODE_TRANSFORM("21")),
                before21,
            );
            assert.equal(await page.evaluate(SAVE_STATUS), "Unsaved changes");

            await page.evaluate(
                `${HELD_BAR}.querySelector(".keep-changes").click()`,
            );
            await page.waitFor(`${SAVE_STATUS} === "Saved" && !${HELD_BAR}`);
        } finally {
            await browser.close();
        }

        const saved = JSON.parse(await readFile(json, "utf8"));
        const fixture = JSON.parse(
            await readFile(
                join(REPO_ROOT, "test/__fixtures__/view-types.json"),
                "utf8",
            ),
        );
        assert.ok(
            placementOf(saved, "20").x > placementOf(fixture, "20").x,
            "Keep lost the drag",
        );
        assert.equal(
            placementOf(saved, "21").x,
            placementOf(fixture, "21").x + 200,
            "Keep lost the change on disk",
        );
    },
);

test(
    "Discard takes the file's layout over edits that couldn't be saved",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await openWarehouse(browser, url);
            const resting = await page.evaluate(NODE_TRANSFORM("20"));
            const from = await centerOf(page, "20");
            await page.drag(from, { x: from.x + 60, y: from.y + 30 });
            await page.waitFor(`${SAVE_STATUS} === "Unsaved changes"`);

            await changeOnDisk(json, (workspace) => {
                workspace.description = "Changed on disk";
            });
            await page.waitFor(`!!${HELD_BAR}`);
            await page.evaluate(
                `${HELD_BAR}.querySelector(".discard-changes").click()`,
            );
            await page.waitFor(`${SAVE_STATUS} === "Saved" && !${HELD_BAR}`);
            assert.equal(await page.evaluate(NODE_TRANSFORM("20")), resting);
            assert.equal(
                await page.evaluate(
                    `document.querySelector(".undo-layout")?.disabled`,
                ),
                true,
                "Discard kept the view's history",
            );
        } finally {
            await browser.close();
        }
        assert.equal(
            JSON.parse(await readFile(json, "utf8")).description,
            "Changed on disk",
        );
    },
);

test(
    "a view gone from workspace.json gives way to the first view, with a notice",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await openWarehouse(browser, url);
            await changeOnDisk(json, (workspace) => {
                warehouseOf(workspace).key = "Storehouse";
            });
            await page.waitFor(
                `!!document.querySelector("[data-reload-notice]")`,
            );
            assert.match(
                await page.evaluate(
                    `document.querySelector("[data-reload-notice]").textContent`,
                ),
                /workspace\.json no longer has .+, so the page shows /,
            );
            await page.waitFor(
                `new URLSearchParams(location.hash.slice(2)).get("view") !== "Warehouse"`,
            );
        } finally {
            await browser.close();
        }
    },
);

test(
    "a view workspace.json makes read-only drops to reading, with a notice",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await openWarehouse(browser, url);
            await changeOnDisk(json, (workspace) => {
                warehouseOf(workspace).automaticLayout = {
                    rankDirection: "TopBottom",
                };
            });
            await page.waitFor(
                `!!document.querySelector("[data-reload-notice]") && !document.documentElement.hasAttribute("data-editing")`,
            );
            assert.match(
                await page.evaluate(
                    `document.querySelector("[data-reload-notice]").textContent`,
                ),
                /can no longer be edited, so the page shows it for reading/,
            );
            assert.equal(
                await page.evaluate(
                    `new URLSearchParams(location.hash.slice(2)).get("view")`,
                ),
                "Warehouse",
            );
        } finally {
            await browser.close();
        }
    },
);

/* ------------------------------------------------- two pages, one file */

/** Drag element `id` of the page's view by (`dx`, `dy`) on screen. */
async function dragElement(page, id, dx, dy) {
    await page.settle();
    const from = await centerOf(page, id);
    await page.drag(from, { x: from.x + dx, y: from.y + dy });
}

test(
    "another page's save reaches a page with unsaved changes as a change on disk, and Keep saves against it",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const first = await openWarehouse(browser, url);
            const second = await openWarehouse(browser, url);
            await dragElement(second, "21", 60, 30);
            await second.waitFor(`${SAVE_STATUS} === "Unsaved changes"`);
            const moved20 = await second.evaluate(NODE_TRANSFORM("20"));

            await dragElement(first, "20", 60, 30);
            await first.press("s", "KeyS", CTRL);
            await first.waitFor(`${SAVE_STATUS} === "Saved"`);

            // The second page hears of the first one's save (spec 6.2).
            await second.waitFor(`!!${HELD_BAR}`);
            await second.waitFor(
                `${NODE_TRANSFORM("20")} !== ${JSON.stringify(moved20)}`,
            );
            const before21 = await first.evaluate(NODE_TRANSFORM("21"));
            await second.evaluate(
                `${HELD_BAR}.querySelector(".keep-changes").click()`,
            );
            await second.waitFor(`${SAVE_STATUS} === "Saved" && !${HELD_BAR}`);

            // And the first page hears of the second one's.
            await first.waitFor(
                `${NODE_TRANSFORM("21")} !== ${JSON.stringify(before21)}`,
            );
            assert.equal(await first.evaluate(HELD_BAR), null);
        } finally {
            await browser.close();
        }

        const saved = JSON.parse(await readFile(json, "utf8"));
        const fixture = JSON.parse(
            await readFile(
                join(REPO_ROOT, "test/__fixtures__/view-types.json"),
                "utf8",
            ),
        );
        for (const id of ["20", "21"])
            assert.ok(
                placementOf(saved, id).x > placementOf(fixture, id).x,
                `element ${id} lost its move`,
            );
    },
);

test(
    "of two pages saving at once, the one the server refuses as stale shows the bar, and Keep saves against the version on disk",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const pages = [
                await openWarehouse(browser, url),
                await openWarehouse(browser, url),
            ];
            await dragElement(pages[0], "20", 60, 30);
            await dragElement(pages[1], "21", 60, 30);
            for (const page of pages)
                await page.waitFor(`${SAVE_STATUS} === "Unsaved changes"`);

            // Both save from the version they loaded: one wins and the
            // other's save comes back refused as stale (spec 7.4).
            await Promise.all(
                pages.map((page) => page.press("s", "KeyS", CTRL)),
            );
            const stale = await Promise.race(
                pages.map((page) =>
                    page.waitFor(`!!${HELD_BAR}`).then(() => page),
                ),
            );
            assert.match(await stale.evaluate(SAVE_STATUS), /Save failed/);
            await stale.evaluate(
                `${HELD_BAR}.querySelector(".keep-changes").click()`,
            );
            await stale.waitFor(`${SAVE_STATUS} === "Saved" && !${HELD_BAR}`);
        } finally {
            await browser.close();
        }

        const saved = JSON.parse(await readFile(json, "utf8"));
        const fixture = JSON.parse(
            await readFile(
                join(REPO_ROOT, "test/__fixtures__/view-types.json"),
                "utf8",
            ),
        );
        for (const id of ["20", "21"])
            assert.ok(
                placementOf(saved, id).x > placementOf(fixture, id).x,
                `element ${id} lost its move`,
            );
    },
);

/* ------------------------------------------------------ unsaved changes */

/** The key of a view the drawer lists other than `key`. */
const otherView = (page, key) =>
    page.evaluate(
        `[...document.querySelectorAll("li[data-viewkey]")].map((item) => item.dataset.viewkey).find((each) => each !== ${JSON.stringify(key)})`,
    );

test(
    "a view switch in editing warns that changes will be lost: Stay keeps them, and Discard and continue reverts them and opens the next view for reading",
    { skip: SKIP },
    async () => {
        const { url, json } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        const DIALOG = `document.querySelector("[data-unsaved-dialog]")`;
        const VIEW = `new URLSearchParams(location.hash.slice(2)).get("view")`;
        const EDITING = `document.documentElement.hasAttribute("data-editing")`;
        try {
            const page = await openWarehouse(browser, url);
            const other = await otherView(page, "Warehouse");
            // A click on a view in the drawer, as a person makes it.
            const choose = async (key) => {
                await page.settle();
                await page.click(
                    await page.evaluate(`(() => {
                        const r = document.querySelector('li[data-viewkey="${key}"] button').getBoundingClientRect();
                        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                    })()`),
                );
            };

            // With nothing changed, the switch asks nothing and reads.
            await choose(other);
            await page.waitFor(`${VIEW} === ${JSON.stringify(other)}`);
            assert.equal(await page.evaluate(DIALOG), null);
            assert.equal(await page.evaluate(EDITING), false);

            // A drag, saved, then a switch.
            await choose("Warehouse");
            await page.waitFor(
                `${VIEW} === "Warehouse" && !!document.querySelector('.edit-view:not([aria-disabled])')`,
            );
            await page.evaluate(`document.querySelector(".edit-view").click()`);
            await page.waitFor(
                `${EDITING} && !!document.querySelector('[data-ready="true"]')`,
            );
            await dragElement(page, "20", 60, 30);
            await page.press("s", "KeyS", CTRL);
            await page.waitFor(`${SAVE_STATUS} === "Saved"`);
            const dragged = placementOf(
                JSON.parse(await readFile(json, "utf8")),
                "20",
            ).x;

            await choose(other);
            await page.waitFor(`!!${DIALOG}`);
            assert.match(
                await page.evaluate(`${DIALOG}.textContent`),
                /will be lost/,
            );
            await page.evaluate(`${DIALOG}.querySelector(".stay").click()`);
            await page.waitFor(`!${DIALOG}`);
            assert.equal(await page.evaluate(VIEW), "Warehouse");
            assert.equal(await page.evaluate(EDITING), true);

            await choose(other);
            await page.waitFor(`!!${DIALOG}`);
            await page.evaluate(
                `${DIALOG}.querySelector(".discard-and-continue").click()`,
            );
            await page.waitFor(`${VIEW} === ${JSON.stringify(other)}`);
            assert.equal(await page.evaluate(EDITING), false);
            assert.equal(
                new URLSearchParams(
                    (await page.evaluate("location.hash")).slice(2),
                ).get("mode"),
                null,
            );
            assert.notEqual(
                placementOf(JSON.parse(await readFile(json, "utf8")), "20").x,
                dragged,
                "Discard and continue kept the drag in the file",
            );
        } finally {
            await browser.close();
        }

        const fixture = JSON.parse(
            await readFile(
                join(REPO_ROOT, "test/__fixtures__/view-types.json"),
                "utf8",
            ),
        );
        assert.equal(
            placementOf(JSON.parse(await readFile(json, "utf8")), "20").x,
            placementOf(fixture, "20").x,
            "Discard and continue didn't put element 20 back",
        );
    },
);

test(
    "a Shift-drag on a selected element moves the whole selection, and a Shift-click takes it out",
    { skip: SKIP },
    async () => {
        const { url } = await startEdit("view-types.json");
        const browser = await openBrowser(CHROME);
        try {
            const page = await openWarehouse(browser, url);
            await page.settle();
            await page.click(await centerOf(page, "20"));
            await page.click(await centerOf(page, "21"), SHIFT);
            await page.waitFor(
                `document.querySelectorAll(".react-flow__node.selected").length === 2`,
            );
            const before = await page.evaluate(NODE_TRANSFORM("21"));

            // A drag with Shift held on a selected element (spec 10.2).
            const from = await centerOf(page, "20");
            await page.drag(
                from,
                { x: from.x + 60, y: from.y + 30 },
                10,
                SHIFT,
            );
            await page.waitFor(`${SAVE_STATUS} === "Unsaved changes"`);
            assert.equal(
                await page.evaluate(
                    `document.querySelectorAll(".react-flow__node.selected").length`,
                ),
                2,
                "the Shift-drag took the element out of the selection",
            );
            assert.notEqual(
                await page.evaluate(NODE_TRANSFORM("21")),
                before,
                "the rest of the selection stayed behind",
            );

            await page.click(await centerOf(page, "20"), SHIFT);
            await page.waitFor(
                `document.querySelectorAll(".react-flow__node.selected").length === 1 && ${NODE("21")}.classList.contains("selected")`,
            );
        } finally {
            await browser.close();
        }
    },
);
