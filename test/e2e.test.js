/**
 * End to end, in a browser: does the thing this project builds actually open?
 *
 * Every other test in the suite stops short of that. `scripts/build.test.js`
 * proves the workspace was embedded and the document is self-contained;
 * `test/*.test.js` proves each controller does its job in a DOM of our own.
 * Both can be green while the shipped artifact opens to a blank screen — a
 * failure in the Structurizr engine, in the bundling, or in the order the
 * chunks initialise would show up nowhere else.
 *
 * So: build the committed fixture workspace with the real CLI, load the result
 * in headless Chrome, and read the rendered document back. The assertions are
 * on things only a running application produces — an `<h1>` that came from the
 * workspace JSON, `<svg>` nodes drawn by the diagram engine, and the
 * documentation and decision pages the router reaches.
 *
 * Chrome is not a dependency of this project. Where it is missing (a bare
 * container, say) these tests skip with a reason rather than failing, and the
 * rest of the suite still covers everything it covered before.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { fixture, runCli } from "../scripts/__fixtures__/helpers.js";
import { dumpDOM, findChrome, serveDirectory } from "./support/browser.js";
import { parseDocument } from "./support/dom.js";

const CHROME = findChrome();
const SKIP = CHROME
    ? false
    : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

const WORKSPACE_NAME = "Fixture Workspace";

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-browser-"));
const servers = [];

after(async () => {
    for (const server of servers) await server.close();
    await rm(SCRATCH, { recursive: true, force: true });
});

/**
 * Poison `fetch` inside the build so these runs prove they need no network
 * rather than merely not happening to use one. Matches `build.test.js`.
 */
const OFFLINE = {
    NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import ${pathToFileURL(fixture("no-network.js")).href}`,
    ]
        .filter(Boolean)
        .join(" "),
};

const once = (body) => {
    let promise;
    return () => {
        promise ??= body();
        return promise;
    };
};

const build = async (name, args) => {
    const out = join(SCRATCH, name);
    const result = await runCli(
        [fixture("workspace.json"), "--out", out, ...args],
        {
            env: OFFLINE,
        },
    );
    assert.equal(
        result.code,
        0,
        `build failed:\n${result.stdout}\n${result.stderr}`,
    );
    return out;
};

const singleFile = once(() => build("single", ["--single-file"]));
const multiFile = once(async () => {
    const out = await build("multi", []);
    const server = await serveDirectory(out);
    servers.push(server);
    return { out, origin: server.origin };
});

/**
 * Load a URL in Chrome and parse the document it ends up with.
 *
 * Memoised by URL: a browser launch is two and a half seconds, and several
 * tests below read different parts of the same rendered page. Nothing here
 * mutates the document it is given.
 */
const dumps = new Map();
const render = (url) => {
    if (!dumps.has(url)) {
        dumps.set(
            url,
            dumpDOM(CHROME, url).then((html) => parseDocument(html)),
        );
    }
    return dumps.get(url);
};

const fileUrl = (path) => pathToFileURL(path).href;

/* ------------------------------------------------------------- the control */

test(
    "before any script runs the document is empty",
    { skip: SKIP },
    async () => {
        // The control for everything below. If the built HTML already contained an
        // <h1> with the workspace name, the assertions that follow would pass
        // without the application ever having run.
        const out = await singleFile();
        const document = parseDocument(
            await readFile(join(out, "index.html"), "utf-8"),
        );

        assert.equal(document.querySelector("h1"), null);
        assert.equal(document.querySelector("#app").textContent.trim(), "");
        assert.equal(document.querySelectorAll("nav").length, 0);
    },
);

/* ------------------------------------------------- the single-file artifact */

test(
    "the single-file document renders the workspace",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const document = await render(fileUrl(join(out, "index.html")));

        assert.equal(document.querySelector("h1").textContent, WORKSPACE_NAME);
        assert.match(document.title, new RegExp(WORKSPACE_NAME));
        assert.match(
            document.querySelector("#workspace-navigation").textContent,
            /A tiny workspace/,
        );
    },
);

test("the single-file document draws a diagram", { skip: SKIP }, async () => {
    // Not "an svg exists somewhere" — the toolbar icons are svg too. This
    // is the diagram canvas, with shapes the engine laid out inside it.
    const out = await singleFile();
    const document = await render(fileUrl(join(out, "index.html")));

    const canvas = document.querySelector("#structurizr-diagram-target");

    assert.ok(canvas, "the diagram canvas should be on the page");
    assert.ok(
        canvas.querySelectorAll("svg").length > 0,
        "the engine should have drawn an svg into the canvas",
    );
    assert.ok(
        canvas.querySelectorAll("g.joint-element").length > 0,
        "the svg should hold laid-out shapes, not just an empty root",
    );
    // `\s` rather than a space: the renderer lays labels out with
    // non-breaking spaces so a name never wraps inside a box.
    assert.match(
        canvas.textContent,
        /Fixture\sSystem/,
        "the shapes should be labelled from the workspace model",
    );
});

test(
    "artifact.html — the file uploaded as a Claude artifact — renders too",
    { skip: SKIP },
    async () => {
        // A fragment rather than a whole document, and the one output whose
        // whole purpose is to run somewhere with no network at all.
        const out = await singleFile();
        const document = await render(fileUrl(join(out, "artifact.html")));

        assert.equal(document.querySelector("h1").textContent, WORKSPACE_NAME);
        assert.ok(
            document.querySelectorAll("#structurizr-diagram-target svg")
                .length > 0,
        );
    },
);

test(
    "every tab in the header is reachable from the rendered page",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const document = await render(fileUrl(join(out, "index.html")));

        assert.deepEqual(
            document
                .querySelectorAll("#workspace-navigation ul > li > a")
                .map((link) => link.textContent),
            ["Diagrams", "Documentation", "Decisions"],
        );
    },
);

test(
    "the view drawer lists the workspace's views",
    { skip: SKIP },
    async () => {
        // `src/components/diagram-navigation.ts`, which nothing else can
        // exercise: it is built from the engine's view list, not from the
        // workspace JSON.
        const out = await singleFile();
        const document = await render(fileUrl(join(out, "index.html")));

        const entries = document.querySelectorAll(
            "#structurizr-diagram-navigation li[data-viewkey]",
        );

        assert.ok(entries.length > 0, "no views in the drawer");
        assert.equal(
            document.querySelectorAll(
                '#structurizr-diagram-navigation [aria-current="true"]',
            ).length,
            1,
            "exactly one entry should be marked as the view on screen",
        );
        assert.match(entries[0].textContent, /Fixture\sSystem/);
    },
);

test(
    "the current view names itself and offers its controls",
    { skip: SKIP },
    async () => {
        // `src/components/current-view.ts`: the title, the description from
        // the workspace, and the zoom controls the toolbar is made of.
        const out = await singleFile();
        const document = await render(fileUrl(join(out, "index.html")));
        const panel = document.querySelector("#structurizr-current-view");

        assert.match(
            panel.querySelector("h2").textContent,
            /System Context View: Fixture System/,
        );
        assert.equal(
            panel.querySelector("p").textContent,
            "Inside the fixture system",
        );

        for (const control of [".zoom-in", ".zoom-out"]) {
            assert.ok(panel.querySelector(control), `missing ${control}`);
        }
    },
);

/* ------------------------------------------------------------------ routing */

test(
    "a link to the documentation page opens the documentation",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const document = await render(
            `${fileUrl(join(out, "index.html"))}#/?page=docs`,
        );

        assert.ok(document.querySelector("#docs-menu"), "the sidebar is there");
        assert.deepEqual(
            document
                .querySelectorAll("#docs-menu a[data-item-id]")
                .map((link) => link.textContent),
            ["Overview", "Deployment"],
        );
        assert.match(
            document.querySelector("#docs-content").textContent,
            /without reaching the network/,
        );
    },
);

test(
    "a link to the decisions page opens the decision log",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const document = await render(
            `${fileUrl(join(out, "index.html"))}#/?page=adrs`,
        );

        assert.match(
            document.querySelector("#decision-content").textContent,
            /2 recorded, 1 currently in force\./,
        );
        assert.deepEqual(
            document
                .querySelectorAll("#adrs-menu a[data-item-id]")
                .map((link) => link.textContent),
            [
                "#2 - Inline every asset for single-file output",
                "#1 - Render diagrams in the browser",
            ],
        );
    },
);

test(
    "a deep link to one decision opens that decision",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const document = await render(
            `${fileUrl(join(out, "index.html"))}#/?page=adrs&adr=1`,
        );

        assert.equal(
            document.querySelector("#decision-title h2").textContent,
            "#1 - Render diagrams in the browser",
        );
        assert.match(
            document.querySelector("#decision-content").textContent,
            /draws views client side/,
        );
    },
);

/* -------------------------------------------------------- the static site */

test(
    "the multi-file site renders when served over HTTP",
    { skip: SKIP },
    async () => {
        // The other output of this tool, and a different code path: the bundle
        // is split across `assets/`, loaded as modules, and a browser will not
        // load those from `file:`. Serving it is what a reader does with it.
        const { origin } = await multiFile();
        const document = await render(`${origin}/index.html`);

        assert.equal(document.querySelector("h1").textContent, WORKSPACE_NAME);
        assert.ok(
            document.querySelectorAll("#structurizr-diagram-target svg")
                .length > 0,
        );
    },
);

test(
    "the artifact renders with no server, no siblings and no network",
    { skip: SKIP },
    async () => {
        // The strongest offline proof available: copy the one file somewhere
        // with nothing next to it and open it from `file:`, where a relative
        // asset has nothing to resolve against and a remote one cannot be
        // fetched. Anything that had not been inlined would be missing here.
        const out = await singleFile();
        const alone = await mkdtemp(join(tmpdir(), "renderizr-alone-"));
        const copy = join(alone, "artifact.html");

        await writeFile(copy, await readFile(join(out, "artifact.html")));

        const document = await render(fileUrl(copy));

        assert.equal(document.querySelector("h1").textContent, WORKSPACE_NAME);
        assert.ok(document.querySelector("#disclaimer"), "the footer rendered");
        assert.match(
            document.querySelector("#disclaimer").textContent,
            /Created with Renderizr v\d+\.\d+\.\d+\./,
            "the footer names the version that built the page",
        );
        assert.ok(
            document.querySelectorAll("#structurizr-diagram-target svg")
                .length > 0,
            "the diagram engine ran with nothing to load",
        );

        await rm(alone, { recursive: true, force: true });
    },
);
