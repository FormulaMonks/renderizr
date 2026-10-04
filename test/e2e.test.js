/**
 * End to end, in a browser: does the thing this project builds actually open?
 *
 * Every other test in the suite stops short of that. `scripts/build.test.js`
 * proves the workspace was embedded and the document is self-contained;
 * `test/*.test.js` proves each controller does its job in a DOM of our own.
 * Both can be green while the shipped artifact opens to a blank screen — a
 * failure in the Structurizr engine, in the bundling, or in the order the
 * chunks initialize would show up nowhere else.
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
import { fixture, REPO_ROOT, runCli } from "../scripts/__fixtures__/helpers.js";
import { findChrome, renderPage, serveDirectory } from "./support/browser.js";
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
            renderPage(CHROME, url).then(({ html }) => parseDocument(html)),
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
        "the shapes should be labeled from the workspace model",
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

/* ---------------------------------------------- the React Flow engine (#41) */

const reactFlowSingle = once(() =>
    build("react-flow-single", ["--single-file", "--engine", "react-flow"]),
);
const reactFlowMulti = once(async () => {
    const out = await build("react-flow-multi", ["--engine", "react-flow"]);
    const server = await serveDirectory(out);
    servers.push(server);
    return { out, origin: server.origin };
});

const CONTEXT_VIEW = "#/?page=diagrams&view=FixtureContext";

/** The assertions every React Flow output has to pass, whatever it was built as. */
const assertDrawnView = (document) => {
    const canvas = document.querySelector("#structurizr-diagram-target");
    assert.ok(canvas, "the diagram canvas should be on the page");

    const root = canvas.querySelector("[data-view-key]");
    assert.ok(root, "the canvas root should name its view");
    assert.equal(root.getAttribute("data-view-key"), "FixtureContext");
    assert.equal(root.getAttribute("data-ready"), "true");

    const elements = canvas.querySelectorAll("[data-element-id]");
    assert.deepEqual(
        elements.map((element) => [
            element.getAttribute("data-element-id"),
            element.getAttribute("data-shape"),
        ]),
        [
            ["1", "Person"],
            ["2", "Box"],
        ],
    );
    assert.match(elements[1].textContent, /Fixture\sSystem/);
    assert.ok(
        canvas
            .querySelector('[data-relationship-id="10"]')
            ?.querySelector("path"),
        "the relationship should be drawn as an edge",
    );

    // One engine per output (ADR 12): the Structurizr renderer drew nothing.
    // Whether it drew anything, not how much: the count went with #42.
    assert.equal(
        canvas.querySelector("g.joint-element"),
        null,
        "the Structurizr renderer drew into a React Flow build",
    );
    // None of React Flow's own chrome.
    assert.equal(canvas.querySelector(".react-flow__attribution"), null);
    assert.equal(canvas.querySelector(".react-flow__controls"), null);
    // The geometry report is for the acceptance harness's builds only
    // (`test/acceptance.test.js`); a reader's page never carries it.
    assert.equal(
        document.querySelector("#engine-report"),
        null,
        "a reader's build carries the engine report",
    );
};

test(
    "--engine react-flow: the single file draws a stored-layout view",
    { skip: SKIP },
    async () => {
        const out = await reactFlowSingle();
        const document = await render(
            `${fileUrl(join(out, "index.html"))}${CONTEXT_VIEW}`,
        );

        assertDrawnView(document);
        assert.match(
            document.querySelector("#structurizr-current-view h2").textContent,
            /System Context View: Fixture System/,
            "the toolbar names the view the engine drew",
        );
        assert.equal(
            document
                .querySelector(
                    '#structurizr-diagram-navigation [aria-current="true"]',
                )
                .closest("li")
                .getAttribute("data-viewkey"),
            "FixtureContext",
        );
        assert.ok(
            document.documentElement.hasAttribute("data-diagram-shell"),
            "the diagrams page is the full-viewport shell",
        );
        assert.match(
            document.querySelector("#disclaimer").textContent,
            /React Flow/,
        );
    },
);

test(
    "--engine react-flow: the multi-file site draws the view when served",
    { skip: SKIP },
    async () => {
        const { origin } = await reactFlowMulti();
        assertDrawnView(await render(`${origin}/index.html${CONTEXT_VIEW}`));
    },
);

test(
    "--engine react-flow: artifact.html draws the view with nothing beside it",
    { skip: SKIP },
    async () => {
        const out = await reactFlowSingle();
        const alone = await mkdtemp(join(tmpdir(), "renderizr-alone-"));
        const copy = join(alone, "artifact.html");
        await writeFile(copy, await readFile(join(out, "artifact.html")));

        assertDrawnView(await render(`${fileUrl(copy)}${CONTEXT_VIEW}`));

        await rm(alone, { recursive: true, force: true });
    },
);

test(
    "--engine react-flow: a view with nothing to draw still counts as painted",
    { skip: SKIP },
    async () => {
        // A view with no elements has nothing to fit, but it is still shown,
        // so mounting has to resolve and the canvas has to say it is ready.
        const workspace = JSON.parse(
            await readFile(fixture("workspace.json"), "utf8"),
        );
        workspace.views.systemContextViews.push({
            key: "FixtureEmpty",
            order: 3,
            softwareSystemId: "2",
            elements: [],
            relationships: [],
        });
        const source = join(SCRATCH, "empty-view.json");
        await writeFile(source, JSON.stringify(workspace));
        const out = join(SCRATCH, "react-flow-empty");
        const result = await runCli(
            [source, "--out", out, "--single-file", "--engine", "react-flow"],
            { env: OFFLINE },
        );
        assert.equal(result.code, 0, `build failed:\n${result.stderr}`);

        const document = await render(
            `${fileUrl(join(out, "index.html"))}#/?page=diagrams&view=FixtureEmpty`,
        );

        const canvas = document.querySelector("#structurizr-diagram-target");
        const root = canvas.querySelector("[data-view-key]");
        assert.equal(root.getAttribute("data-view-key"), "FixtureEmpty");
        assert.equal(canvas.querySelectorAll("[data-element-id]").length, 0);
        assert.equal(root.getAttribute("data-ready"), "true");
    },
);

test(
    "--engine react-flow: an element's label is clamped to its box and its outline is SVG",
    { skip: SKIP },
    async () => {
        const workspace = JSON.parse(
            await readFile(fixture("workspace.json"), "utf8"),
        );
        const [system] = workspace.model.softwareSystems;
        system.name = "Fixture\\nSystem";
        system.description = `<b>bold</b> ${"words ".repeat(200)}`;
        workspace.views.configuration.styles.elements.push({
            tag: "Software System",
            opacity: 40,
            border: "Dashed",
        });
        const source = join(SCRATCH, "label.json");
        await writeFile(source, JSON.stringify(workspace));
        const out = join(SCRATCH, "react-flow-label");
        const result = await runCli(
            [source, "--out", out, "--single-file", "--engine", "react-flow"],
            { env: OFFLINE },
        );
        assert.equal(result.code, 0, `build failed:\n${result.stderr}`);

        const document = await render(
            `${fileUrl(join(out, "index.html"))}${CONTEXT_VIEW}`,
        );
        const element = document.querySelector('[data-element-id="2"]');
        assert.ok(element, "the system should be drawn");

        // The literal \n breaks the name; the full text is the accessible name.
        assert.match(element.getAttribute("aria-label"), /^Fixture\nSystem\n/);
        assert.match(element.getAttribute("title"), /words words\s*$/);

        // The description is clamped, and its markup stays text.
        const description = element.querySelector("[data-element-description]");
        assert.ok(description, "the description should be drawn");
        assert.match(description.getAttribute("style"), /line-clamp:\s*\d+/);
        assert.equal(description.querySelector("b"), null, "no HTML parsed");
        assert.match(description.textContent, /^<b>bold<\/b>/);

        // Opacity is on the outline group only; Dashed is 4× the stroke.
        const outline = element.querySelector('svg path[data-paint="body"]');
        assert.ok(outline, "the outline should be SVG");
        assert.equal(outline.getAttribute("stroke-dasharray"), "8 8");
        assert.equal(outline.parentNode.getAttribute("opacity"), "0.4");
        assert.doesNotMatch(
            element.querySelector("[data-element-label]").getAttribute("style"),
            /opacity/,
        );
    },
);

test(
    "--engine react-flow: every element draws its shape, sized as Structurizr sizes it",
    { skip: SKIP },
    async () => {
        // The Person stays; the system becomes a Circle styled 450×300, and
        // three more systems are a Cylinder, a WebBrowser and an unknown shape.
        const workspace = JSON.parse(
            await readFile(fixture("workspace.json"), "utf8"),
        );
        const { elements } = workspace.views.configuration.styles;
        elements.push({
            tag: "Software System",
            shape: "Circle",
            width: 450,
            height: 300,
        });
        const extra = [
            ["20", "Cylinder"],
            ["21", "WebBrowser"],
            ["22", "Blob"],
        ];
        const [context] = workspace.views.systemContextViews;
        for (const [index, [id, shape]] of extra.entries()) {
            workspace.model.softwareSystems.push({
                id,
                name: `${shape} System`,
                tags: `Element,${shape}`,
            });
            elements.push({ tag: shape, shape, width: 450, height: 300 });
            context.elements.push({ id, x: 900 + 600 * index, y: 200 });
        }
        const source = join(SCRATCH, "shapes.json");
        await writeFile(source, JSON.stringify(workspace));
        const out = join(SCRATCH, "react-flow-shapes");
        const result = await runCli(
            [source, "--out", out, "--single-file", "--engine", "react-flow"],
            { env: OFFLINE },
        );
        assert.equal(result.code, 0, `build failed:\n${result.stderr}`);

        const document = await render(
            `${fileUrl(join(out, "index.html"))}${CONTEXT_VIEW}`,
        );
        const shapeOf = (id) =>
            document
                .querySelector(`[data-element-id="${id}"]`)
                ?.getAttribute("data-shape");
        assert.deepEqual(
            ["1", "2", "20", "21", "22"].map(shapeOf),
            ["Person", "Circle", "Cylinder", "WebBrowser", "Box"],
            "data-shape names the shape drawn, and an unknown one is a Box",
        );

        // The Circle is as tall as it is wide, outline and all.
        const circle = document.querySelector('[data-element-id="2"]');
        const svg = circle.querySelector("svg");
        assert.equal(svg.getAttribute("width"), "450");
        assert.equal(svg.getAttribute("height"), "450");
        assert.equal(circle.querySelector("svg rect"), null, "no box drawn");
        assert.ok(
            circle.querySelector('svg path[data-paint="body"]'),
            "the circle is a path",
        );

        // The label fills the shape's content area, not the whole box.
        const style = (id) =>
            document
                .querySelector(`[data-element-id="${id}"] [data-element-label]`)
                .getAttribute("style");
        assert.match(style("2"), /left:\s*22\.5px/);
        assert.match(style("2"), /width:\s*405px/);
        assert.match(style("20"), /top:\s*30px/);
        assert.match(style("20"), /height:\s*270px/);

        // A WebBrowser's bezel is painted in the stroke color, its panel not.
        const browser = document.querySelector('[data-element-id="21"]');
        assert.ok(browser.querySelector('svg path[data-paint="frame"]'));
        assert.ok(browser.querySelector('svg path[data-paint="screen"]'));
    },
);

test(
    "--engine react-flow: a workspace without a name or date has a clean header",
    { skip: SKIP },
    async () => {
        // Structurizr's `Workspace` would default these; reading the JSON
        // directly has to as well, or the header shows "undefined".
        const workspace = JSON.parse(
            await readFile(fixture("workspace.json"), "utf8"),
        );
        workspace.name = undefined;
        workspace.lastModifiedDate = undefined;
        const source = join(SCRATCH, "unnamed.json");
        await writeFile(source, JSON.stringify(workspace));
        const out = join(SCRATCH, "react-flow-unnamed");
        const result = await runCli(
            [source, "--out", out, "--single-file", "--engine", "react-flow"],
            { env: OFFLINE },
        );
        assert.equal(result.code, 0, `build failed:\n${result.stderr}`);

        const document = await render(
            `${fileUrl(join(out, "index.html"))}${CONTEXT_VIEW}`,
        );

        const header = document.querySelector(
            "#workspace-navigation",
        ).textContent;
        assert.match(header, /Last modified:/);
        assert.doesNotMatch(header, /undefined/);
        assert.doesNotMatch(header, /Invalid Date/);
    },
);

/* ---------------------------------------- filtered, image and custom views */

/**
 * Build the fixture as a single React Flow file, after `edit` has changed
 * its JSON, and hand back the output directory and the CLI's result.
 */
const buildReactFlowWorkspace = async (name, edit) => {
    const workspace = JSON.parse(
        await readFile(fixture("workspace.json"), "utf8"),
    );
    edit(workspace);
    const source = join(SCRATCH, `${name}.json`);
    await writeFile(source, JSON.stringify(workspace));
    const out = join(SCRATCH, `react-flow-${name}`);
    const result = await runCli(
        [source, "--out", out, "--single-file", "--engine", "react-flow"],
        { env: OFFLINE },
    );
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    return { out, result };
};

const viewUrlIn = (out, key) =>
    `${fileUrl(join(out, "index.html"))}#/?page=diagrams&view=${key}`;

test(
    "--engine react-flow: a filtered view draws its base minus what the filter drops",
    { skip: SKIP },
    async () => {
        const { out } = await buildReactFlowWorkspace("filtered", (json) => {
            json.views.filteredViews = [
                {
                    key: "NoPeople",
                    baseViewKey: "FixtureContext",
                    mode: "Exclude",
                    tags: ["Person"],
                    title: "Without the reader",
                },
            ];
        });

        const document = await render(viewUrlIn(out, "NoPeople"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        const root = canvas.querySelector("[data-view-key]");
        assert.equal(root.getAttribute("data-view-key"), "NoPeople");
        assert.equal(root.getAttribute("data-ready"), "true");
        assert.deepEqual(
            canvas
                .querySelectorAll("[data-element-id]")
                .map((element) => element.getAttribute("data-element-id")),
            ["2"],
            "the Person is filtered out",
        );
        assert.equal(
            canvas.querySelector("[data-relationship-id]"),
            null,
            "the relationship from the Person goes with it",
        );
    },
);

test(
    "--engine react-flow: a filtered view whose base is filtered shows an error panel naming both views",
    { skip: SKIP },
    async () => {
        // The build refuses this workspace, so build one it accepts and
        // point the second filtered view at the first in the output.
        const { out } = await buildReactFlowWorkspace(
            "filtered-twice",
            (json) => {
                json.views.filteredViews = [
                    {
                        key: "NoPeople",
                        baseViewKey: "FixtureContext",
                        mode: "Exclude",
                        tags: ["Person"],
                    },
                    {
                        key: "NoPeopleTwice",
                        baseViewKey: "SwapForNoPeople",
                        mode: "Exclude",
                        tags: ["Person"],
                    },
                ];
            },
        );
        const index = join(out, "index.html");
        const html = await readFile(index, "utf8");
        assert.match(html, /SwapForNoPeople/);
        await writeFile(index, html.replaceAll("SwapForNoPeople", "NoPeople"));

        const document = await render(viewUrlIn(out, "NoPeopleTwice"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        const root = canvas.querySelector("[data-view-key]");
        assert.equal(root.getAttribute("data-view-key"), "NoPeopleTwice");
        assert.equal(root.getAttribute("data-ready"), "true");
        const panel = canvas.querySelector("[data-view-error]");
        assert.ok(panel, "the error panel should replace the canvas");
        assert.match(panel.textContent, /"NoPeopleTwice".*"NoPeople"/);
        assert.equal(canvas.querySelector("[data-element-id]"), null);
        // The rest of the page keeps working.
        assert.ok(document.querySelector("#workspace-navigation"));
    },
);

test(
    "--engine react-flow: an image view draws one image at its natural size, in the variant for the scheme",
    { skip: SKIP },
    async () => {
        const png = await readFile(fixture("logo.png"));
        const { out } = await buildReactFlowWorkspace("image", (json) => {
            json.views.imageViews = [
                {
                    key: "Picture",
                    title: "A picture",
                    contentLight: `data:image/png;base64,${png.toString("base64")}`,
                    contentDark:
                        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                },
            ];
        });

        const document = await render(viewUrlIn(out, "Picture"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        const root = canvas.querySelector("[data-view-key]");
        assert.equal(root.getAttribute("data-view-key"), "Picture");
        assert.equal(root.getAttribute("data-ready"), "true");

        const images = canvas.querySelectorAll("img[data-image-view]");
        assert.equal(images.length, 1, "one image and nothing else");
        const [image] = images;
        assert.equal(image.getAttribute("alt"), "A picture");
        // Headless Chrome follows the machine's scheme, which the page
        // mirrors onto <html> for the diagram (spec 9.6).
        const scheme = document
            .querySelector("html")
            .getAttribute("data-diagram-theme");
        if (scheme === "dark") {
            assert.match(image.getAttribute("src"), /^data:image\/gif;/);
            assert.equal(image.getAttribute("width"), "1");
            assert.equal(image.getAttribute("height"), "1");
        } else {
            assert.match(image.getAttribute("src"), /^data:image\/png;/);
            assert.equal(image.getAttribute("width"), "120");
            assert.equal(image.getAttribute("height"), "40");
        }
        // Fitted to a canvas far larger than the picture, yet not upscaled.
        const transform = canvas
            .querySelector(".react-flow__viewport")
            .getAttribute("style");
        const scale = Number(/scale\(([^)]+)\)/.exec(transform)?.[1]);
        assert.ok(scale <= 1, `the image should not be upscaled: ${transform}`);
        assert.equal(canvas.querySelector("[data-element-id]"), null);
    },
);

test(
    "--engine react-flow: an image that was not inlined shows the placeholder and logs why",
    { skip: SKIP },
    async () => {
        const { out, result } = await buildReactFlowWorkspace(
            "image-missing",
            (json) => {
                json.views.imageViews = [
                    {
                        key: "Picture",
                        content: "https://example.test/picture.png",
                    },
                ];
            },
        );
        assert.match(
            result.stderr,
            /could not inline https:\/\/example\.test\/picture\.png/,
        );

        const { html, console: logs } = await renderPage(
            CHROME,
            viewUrlIn(out, "Picture"),
        );
        const canvas = parseDocument(html).querySelector(
            "#structurizr-diagram-target",
        );
        assert.equal(
            canvas.querySelector("[data-view-key]").getAttribute("data-ready"),
            "true",
        );
        const placeholder = canvas.querySelector("[data-image-unavailable]");
        assert.ok(placeholder, "the placeholder should be drawn");
        assert.match(placeholder.textContent, /Image not available/);
        assert.equal(canvas.querySelector("img[data-image-view]"), null);
        assert.ok(
            logs.some((line) =>
                /Image view "Picture": .*example\.test\/picture\.png/.test(
                    line,
                ),
            ),
            `the reason should be logged, got:\n${logs.join("\n")}`,
        );
    },
);

test(
    "--engine react-flow: a custom view draws its custom elements with no boundary",
    { skip: SKIP },
    async () => {
        const { out } = await buildReactFlowWorkspace("custom", (json) => {
            json.model.customElements = [
                { id: "30", name: "Sensor", metadata: "Hardware" },
            ];
            json.views.customViews = [
                {
                    key: "Plant",
                    title: "Plant floor",
                    elements: [
                        { id: "30", x: 100, y: 100 },
                        { id: "2", x: 700, y: 100 },
                    ],
                },
            ];
        });

        const document = await render(viewUrlIn(out, "Plant"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        assert.equal(
            canvas.querySelector("[data-view-key]").getAttribute("data-ready"),
            "true",
        );
        const sensor = canvas.querySelector('[data-element-id="30"]');
        assert.ok(sensor, "the custom element should be drawn");
        assert.match(sensor.textContent, /Sensor/);
        assert.match(sensor.textContent, /\[Hardware\]/);
        assert.equal(canvas.querySelector("[data-boundary-id]"), null);
    },
);

/* ------------------------------------------------------------- animation */

/** The committed animation fixture, built once as a single React Flow file. */
const animationBuild = once(async () => {
    const out = join(SCRATCH, "react-flow-animation");
    const result = await runCli(
        [
            join(REPO_ROOT, "test/__fixtures__/animation.json"),
            "--out",
            out,
            "--single-file",
            "--engine",
            "react-flow",
        ],
        { env: OFFLINE },
    );
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    return out;
});

/** The toolbar's animation buttons in `document`, by name. */
const animationButtons = (document) => {
    const group = document.querySelector(".animation-buttons");
    const button = (name) => group?.querySelector(`.${name}`);
    return { group, button };
};

test(
    "--engine react-flow: a dynamic view draws one edge per order and offers its animation",
    { skip: SKIP },
    async () => {
        const out = await animationBuild();
        const document = await render(viewUrlIn(out, "Checkout"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        const root = canvas.querySelector("[data-view-key]");
        assert.equal(root.getAttribute("data-ready"), "true");
        assert.equal(root.getAttribute("role"), "group");
        assert.equal(root.getAttribute("aria-label"), "Checking out");
        assert.deepEqual(
            canvas
                .querySelectorAll("[data-relationship-id]")
                .map((edge) => [
                    edge.getAttribute("data-relationship-id"),
                    edge.getAttribute("data-order"),
                ]),
            [
                ["10", "1"],
                ["11", "2"],
                ["12", "3"],
                ["13", "3"],
                ["11", "4"],
                ["14", null],
            ],
            "relationship 11 twice, at two orders; 14 without an order",
        );

        // The toolbar renders from the engine's AnimationState.
        const { group, button } = animationButtons(document);
        assert.ok(group, "the toolbar has its animation buttons");
        assert.equal(group.getAttribute("hidden"), null, "and shows them");
        assert.equal(button("prev-step").getAttribute("disabled"), null);
        assert.equal(button("next-step").getAttribute("disabled"), null);
        assert.equal(
            button("play-animation").getAttribute("aria-label"),
            "Play animation",
        );

        // Before any step, the full view: nothing faded, nothing inert.
        assert.equal(canvas.querySelector("[inert]"), null);
        for (const node of canvas.querySelectorAll(".react-flow__node")) {
            assert.doesNotMatch(
                node.getAttribute("style") ?? "",
                /opacity:\s*0[.;]/,
                "no node is faded before the animation starts",
            );
        }
    },
);

test(
    "--engine react-flow: a static view with steps offers its animation",
    { skip: SKIP },
    async () => {
        const out = await animationBuild();
        const document = await render(viewUrlIn(out, "Containers"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        assert.equal(
            canvas.querySelector("[data-view-key]").getAttribute("data-ready"),
            "true",
        );
        assert.equal(
            canvas.querySelectorAll("[data-element-id]").length,
            5,
            "every element shows before the first step",
        );
        const { group } = animationButtons(document);
        assert.equal(group.getAttribute("hidden"), null);
    },
);

test(
    "--engine react-flow: a view without steps hides the animation buttons",
    { skip: SKIP },
    async () => {
        const { out } = await buildReactFlowWorkspace("no-steps", () => {});
        const document = await render(viewUrlIn(out, "FixtureContext"));
        const { group } = animationButtons(document);
        assert.ok(group, "the toolbar keeps the group");
        assert.notEqual(group.getAttribute("hidden"), null, "hidden");
    },
);

test(
    "--engine react-flow: a dynamic-view order that isn't an integer shows an error panel for that view only",
    { skip: SKIP },
    async () => {
        // The build refuses this workspace, so build an integer order and
        // make it fractional in the output.
        const out = join(SCRATCH, "react-flow-fractional");
        const workspace = JSON.parse(
            await readFile(
                join(REPO_ROOT, "test/__fixtures__/animation.json"),
                "utf8",
            ),
        );
        workspace.views.dynamicViews[0].relationships[2].order = "424242";
        const source = join(SCRATCH, "fractional.json");
        await writeFile(source, JSON.stringify(workspace));
        const result = await runCli(
            [source, "--out", out, "--single-file", "--engine", "react-flow"],
            { env: OFFLINE },
        );
        assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
        const index = join(out, "index.html");
        const html = await readFile(index, "utf8");
        assert.match(html, /424242/);
        await writeFile(index, html.replaceAll("424242", "1.1"));

        const document = await render(viewUrlIn(out, "Checkout"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        const root = canvas.querySelector("[data-view-key]");
        assert.equal(root.getAttribute("data-ready"), "true");
        const panel = canvas.querySelector("[data-view-error]");
        assert.ok(panel, "the error panel should replace the canvas");
        assert.equal(
            panel.textContent,
            'Dynamic view "Checkout": relationship "API → Database" has order "1.1"; orders must be integers.',
        );
        assert.equal(canvas.querySelector("[data-element-id]"), null);
        // The rest of the page keeps working.
        assert.ok(document.querySelector("#workspace-navigation"));
        assert.ok(
            document.querySelector(
                '#structurizr-diagram-navigation [data-viewkey="Containers"]',
            ),
            "the drawer still lists the other views",
        );
    },
);
