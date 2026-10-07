/**
 * Edit mode end to end, in a browser (spec 19.2): start `renderizr edit` on
 * a temporary copy of a fixture with the real CLI, open the editing route in
 * headless Chrome and read the document back.
 *
 * Skips without Chrome, as `test/e2e.test.js` does.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { BUILD_JS, REPO_ROOT } from "../scripts/__fixtures__/helpers.js";
import { findChrome, renderPage } from "./support/browser.js";
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
 * prints once the server listens. The server stops when the suite ends.
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
            resolve(url);
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
    const url = await session();
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
