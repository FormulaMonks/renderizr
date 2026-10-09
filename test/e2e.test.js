/**
 * End to end, in a browser: does the thing this project builds actually open?
 *
 * Every other test in the suite stops short of that. `scripts/build.test.js`
 * proves the workspace was embedded and the document is self-contained;
 * `test/*.test.js` proves each controller does its job in a DOM of our own.
 * Both can be green while the shipped artifact opens to a blank screen — a
 * failure in the diagram engine, in the bundling, or in the order the
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
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
        canvas.querySelectorAll("[data-element-id]").length > 0,
        "the canvas should hold laid-out shapes, not just an empty root",
    );
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
    "a link to the decisions page opens the decisions index",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const document = await render(
            `${fileUrl(join(out, "index.html"))}#/?page=adrs`,
        );

        assert.match(
            document.querySelector("#adrs-index").textContent,
            /2 recorded, 1 in force/,
        );
        assert.deepEqual(
            document
                .querySelectorAll("#adrs-index a[data-item-id]")
                .map((link) => link.getAttribute("data-item-id")),
            ["2", "1"],
            "the index lists every decision, newest first",
        );
        assert.equal(
            document.querySelectorAll('#adrs-index [data-mark="dot"]').length,
            2,
            "beside the decision graph",
        );
        assert.deepEqual(
            document
                .querySelectorAll("#adrs-menu a[data-item-id]")
                .map((link) => link.textContent),
            [
                "0002 Inline every asset for single-file output",
                "0001 Render diagrams in the browser",
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
            "0001 Render diagrams in the browser",
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

/* ------------------------------------------------------- the engine (#41) */

const CONTEXT_VIEW = "#/?page=diagrams&view=FixtureContext";

/** The assertions every output has to pass, whatever it was built as. */
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

test("the single file draws a stored-layout view", { skip: SKIP }, async () => {
    const out = await singleFile();
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
        /^Diagrams from a Structurizr workspace, in C4 notation, drawn with React Flow\. Created with Renderizr v\d+\.\d+\.\d+\.$/,
    );
    assert.deepEqual(
        document
            .querySelectorAll("#disclaimer a")
            .map((link) => link.textContent),
        ["Structurizr", "C4 notation", "React Flow", "Renderizr"],
    );
});

test(
    "the multi-file site draws the view when served",
    { skip: SKIP },
    async () => {
        const { origin } = await multiFile();
        assertDrawnView(await render(`${origin}/index.html${CONTEXT_VIEW}`));
    },
);

test(
    "artifact.html draws the view with nothing beside it",
    { skip: SKIP },
    async () => {
        const out = await singleFile();
        const alone = await mkdtemp(join(tmpdir(), "renderizr-alone-"));
        const copy = join(alone, "artifact.html");
        await writeFile(copy, await readFile(join(out, "artifact.html")));

        assertDrawnView(await render(`${fileUrl(copy)}${CONTEXT_VIEW}`));

        await rm(alone, { recursive: true, force: true });
    },
);

test(
    "a view with nothing to draw still counts as painted",
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
        const out = join(SCRATCH, "empty");
        const result = await runCli([source, "--out", out, "--single-file"], {
            env: OFFLINE,
        });
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
    "an element's label is clamped to its box and its outline is SVG",
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
        const out = join(SCRATCH, "label");
        const result = await runCli([source, "--out", out, "--single-file"], {
            env: OFFLINE,
        });
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
    "every element draws its shape, sized as Structurizr sizes it",
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
        const out = join(SCRATCH, "shapes");
        const result = await runCli([source, "--out", out, "--single-file"], {
            env: OFFLINE,
        });
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
    "a workspace without a name or date has a clean header",
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
        const out = join(SCRATCH, "unnamed");
        const result = await runCli([source, "--out", out, "--single-file"], {
            env: OFFLINE,
        });
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
 * Build the fixture as a single file, after `edit` has changed
 * its JSON, and hand back the output directory and the CLI's result.
 */
const buildEditedWorkspace = async (name, edit) => {
    const workspace = JSON.parse(
        await readFile(fixture("workspace.json"), "utf8"),
    );
    edit(workspace);
    const source = join(SCRATCH, `${name}.json`);
    await writeFile(source, JSON.stringify(workspace));
    const out = join(SCRATCH, `${name}`);
    const result = await runCli([source, "--out", out, "--single-file"], {
        env: OFFLINE,
    });
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    return { out, result };
};

const viewUrlIn = (out, key) =>
    `${fileUrl(join(out, "index.html"))}#/?page=diagrams&view=${key}`;

test(
    "a workspace with no views says so instead of loading forever",
    { skip: SKIP },
    async () => {
        // Documentation and decisions only: a valid workspace, nothing to draw.
        const { out } = await buildEditedWorkspace("no-views", (json) => {
            json.views = {};
        });
        const document = await render(
            `${fileUrl(join(out, "index.html"))}#/?page=diagrams`,
        );
        const canvas = document.querySelector("#structurizr-diagram-target");

        assert.equal(canvas.querySelector(".loading"), null);
        assert.match(canvas.textContent, /This workspace has no views\./);
        assert.equal(canvas.querySelector("[data-view-key]"), null);
    },
);

test(
    "a filtered view draws its base minus what the filter drops",
    { skip: SKIP },
    async () => {
        const { out } = await buildEditedWorkspace("filtered", (json) => {
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
    "a filtered view whose base is filtered shows an error panel naming both views",
    { skip: SKIP },
    async () => {
        // The build refuses this workspace, so build one it accepts and
        // point the second filtered view at the first in the output.
        const { out } = await buildEditedWorkspace("filtered-twice", (json) => {
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
        });
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
    "an image view draws one image at its natural size, in the variant for the scheme",
    { skip: SKIP },
    async () => {
        const png = await readFile(fixture("logo.png"));
        const { out } = await buildEditedWorkspace("image", (json) => {
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
    "an SVG with no size of its own is drawn at its viewBox size",
    { skip: SKIP },
    async () => {
        // Mermaid's export: width 100%, no height, the size only in the viewBox.
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 400px;" viewBox="0 0 400 1200"><rect width="400" height="1200" fill="#1168bd"/></svg>';
        const { out } = await buildEditedWorkspace("image-sizeless", (json) => {
            json.views.imageViews = [
                {
                    key: "Picture",
                    content: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
                },
            ];
        });

        const document = await render(viewUrlIn(out, "Picture"));
        const canvas = document.querySelector("#structurizr-diagram-target");
        assert.equal(
            canvas.querySelector("[data-view-key]").getAttribute("data-ready"),
            "true",
        );
        const image = canvas.querySelector("img[data-image-view]");
        assert.equal(image.getAttribute("width"), "400");
        assert.equal(image.getAttribute("height"), "1200");
    },
);

test(
    "an image that was not inlined shows the placeholder and logs why",
    { skip: SKIP },
    async () => {
        const { out, result } = await buildEditedWorkspace(
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
    "a custom view draws its custom elements with no boundary",
    { skip: SKIP },
    async () => {
        const { out } = await buildEditedWorkspace("custom", (json) => {
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

/* ------------------------------- activation targets and keyboard (#48) */

const TARGETS_FIXTURE = new URL(
    "./__fixtures__/activation-targets.json",
    import.meta.url,
);

const targetsBuild = once(async () => {
    const out = join(SCRATCH, "targets");
    const result = await runCli(
        [TARGETS_FIXTURE.pathname, "--out", out, "--single-file"],
        { env: OFFLINE },
    );
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    return out;
});

const indicatorsOf = (item) =>
    item
        .querySelectorAll("[data-indicator]")
        .map((glyph) => glyph.getAttribute("data-indicator"));

test(
    "the canvas is one focusable region labeled with the view's title",
    { skip: SKIP },
    async () => {
        const document = await render(
            viewUrlIn(await targetsBuild(), "Landscape"),
        );
        const root = document.querySelector(
            "#structurizr-diagram-target [data-view-key]",
        );

        assert.equal(root.getAttribute("data-ready"), "true");
        assert.equal(root.getAttribute("role"), "group");
        assert.equal(root.getAttribute("aria-label"), "Landscape");
        assert.equal(root.getAttribute("tabindex"), "0");
    },
);

test(
    "an element with targets shows one glyph per kind and is reachable; one without is inert",
    { skip: SKIP },
    async () => {
        const document = await render(
            viewUrlIn(await targetsBuild(), "Landscape"),
        );
        const shop = document.querySelector('[data-element-id="2"]');
        const payments = document.querySelector('[data-element-id="3"]');

        assert.equal(shop.getAttribute("role"), "button");
        assert.equal(shop.getAttribute("tabindex"), "-1");
        assert.equal(shop.getAttribute("aria-haspopup"), "menu");
        assert.deepEqual(indicatorsOf(shop), ["link", "view"]);
        assert.match(
            shop.getAttribute("aria-label"),
            /^Shop\n\[Software System\]/,
        );

        assert.equal(payments.getAttribute("role"), null);
        assert.equal(payments.getAttribute("tabindex"), null);
        assert.deepEqual(indicatorsOf(payments), []);
    },
);

test(
    "a relationship with a link takes clicks on a hit stroke and its label, which holds only a glyph when it says nothing",
    { skip: SKIP },
    async () => {
        const document = await render(
            viewUrlIn(await targetsBuild(), "Landscape"),
        );
        const buys = document.querySelector('[data-relationship-label="10"]');
        const glyphOnly = document.querySelector(
            '[data-relationship-label="12"]',
        );
        const plain = document.querySelector('[data-relationship-label="11"]');

        assert.equal(
            buys.getAttribute("aria-label"),
            "Customer → Shop: Buys from",
        );
        assert.equal(buys.getAttribute("role"), "button");
        assert.ok(
            document.querySelector(
                '[data-relationship-id="10"] [data-hit-stroke]',
            ),
            "the line takes clicks",
        );
        assert.deepEqual(indicatorsOf(glyphOnly), ["link"]);
        assert.equal(glyphOnly.textContent.trim(), "");
        assert.equal(plain.getAttribute("role"), null);
        assert.equal(
            document.querySelector(
                '[data-relationship-id="11"] [data-hit-stroke]',
            ),
            null,
            "a relationship without targets takes no clicks",
        );
    },
);

test(
    "a boundary's label band carries its element's indicators",
    { skip: SKIP },
    async () => {
        const document = await render(
            viewUrlIn(await targetsBuild(), "ShopContainers"),
        );
        const band = document.querySelector(
            '[data-boundary-id="2"] [data-boundary-label]',
        );

        assert.equal(band.getAttribute("role"), "button");
        assert.deepEqual(indicatorsOf(band), ["link", "view"]);
    },
);

/* ------------------------------------------------------------- animation */

/** The committed animation fixture, built once as a single file. */
const animationBuild = once(async () => {
    const out = join(SCRATCH, "animation");
    const result = await runCli(
        [
            join(REPO_ROOT, "test/__fixtures__/animation.json"),
            "--out",
            out,
            "--single-file",
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
    "a dynamic view draws one edge per order and offers its animation",
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
    "a static view with steps offers its animation",
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
    "a view without steps hides the animation buttons",
    { skip: SKIP },
    async () => {
        const { out } = await buildEditedWorkspace("no-steps", () => {});
        const document = await render(viewUrlIn(out, "FixtureContext"));
        const { group } = animationButtons(document);
        assert.ok(group, "the toolbar keeps the group");
        assert.notEqual(group.getAttribute("hidden"), null, "hidden");
    },
);

test(
    "a dynamic-view order that isn't an integer shows an error panel for that view only",
    { skip: SKIP },
    async () => {
        // The build refuses this workspace, so build an integer order and
        // make it fractional in the output.
        const out = join(SCRATCH, "fractional");
        const workspace = JSON.parse(
            await readFile(
                join(REPO_ROOT, "test/__fixtures__/animation.json"),
                "utf8",
            ),
        );
        workspace.views.dynamicViews[0].relationships[2].order = "424242";
        const source = join(SCRATCH, "fractional.json");
        await writeFile(source, JSON.stringify(workspace));
        const result = await runCli([source, "--out", out, "--single-file"], {
            env: OFFLINE,
        });
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

/* ------------------------------------------------- animation, interactively */

/**
 * The helpers a scenario script runs with, in the page. `--dump-dom` has no
 * way to click, so a scenario drives the toolbar and the canvas from a
 * script added to the built page, and `shoot(name)` records what the canvas
 * shows into `<pre id="probe">` for the test to read back.
 *
 * Virtual time never advances the page's animation clock, so an eased
 * opacity would stay where it started: `shoot` finishes every running
 * transition first and reads the opacity the reader ends up seeing,
 * multiplied up through the element's ancestors.
 */
const PROBE_HELPERS = `
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const canvas = () =>
    document.querySelector("#structurizr-diagram-target [data-view-key]");
const until = async (check) => {
    for (let tries = 0; tries < 400; tries++) {
        if (check()) return;
        await sleep(25);
    }
    throw new Error("the canvas never became ready");
};
const click = (selector) => document.querySelector(selector).click();
const opacity = (element) => {
    let value = 1;
    for (let node = element; node; node = node.parentElement) {
        value *= Number(getComputedStyle(node).opacity);
    }
    return Math.round(value * 1000) / 1000;
};
const viewport = () =>
    canvas().querySelector(".react-flow__viewport").style.transform;
// The font swap re-derives the boundaries and refits the view, later on a
// busy machine; wait for it so the full view's viewport is the final one.
const settled = async () => {
    await document.fonts.ready;
    let last = viewport();
    for (let tries = 0; tries < 40; tries++) {
        await sleep(100);
        if (viewport() === last) return;
        last = viewport();
    }
};
const shots = [];
const shoot = (name) => {
    for (const animation of document.getAnimations()) animation.finish();
    const elements = {};
    for (const element of canvas().querySelectorAll("[data-element-id]")) {
        const node = element.closest(".react-flow__node");
        const icon = element.querySelector("img");
        elements[element.dataset.elementId] = {
            opacity: opacity(element),
            text: opacity(element.querySelector("[data-element-label] div div")),
            icon: icon ? opacity(icon) : null,
            inert: node.inert,
            transition: node.style.transition,
        };
    }
    const edges = {};
    for (const edge of canvas().querySelectorAll("[data-relationship-id]")) {
        const key = edge.dataset.relationshipId + "@" + (edge.dataset.order ?? "");
        edges[key] = { opacity: opacity(edge), transition: edge.style.transition };
    }
    const boundaries = {};
    for (const boundary of canvas().querySelectorAll("[data-boundary-id]")) {
        boundaries[boundary.dataset.boundaryId] = opacity(boundary);
    }
    shots.push({
        name,
        view: canvas().dataset.viewKey,
        elements,
        edges,
        boundaries,
        viewport: viewport(),
        play: document.querySelector(".play-animation").getAttribute("aria-label"),
        scheme: document.documentElement.dataset.diagramTheme,
        descriptions: canvas().querySelectorAll("[data-element-description]").length,
    });
};
`;

/**
 * Keeps the canvas one size for the whole scenario. The view's title and
 * description fill the header above the canvas once the view is shown,
 * shrinking the canvas after the island has measured it, and the island
 * hears that through a ResizeObserver, which virtual time feeds only on the
 * rare frame: the refit would land at a different point of each run. Out of
 * the flow, the header no longer moves the canvas.
 */
const PROBE_STYLE = `<style>
[class*="currentView"] { position: absolute; z-index: 1; }
</style>`;

/**
 * Open `view` of the animation fixture with `scenario` run once the canvas
 * is ready, and hand back what it shot, by name. `flags` go to Chrome.
 */
const probeAnimation = async (name, view, scenario, { flags = [] } = {}) => {
    const built = await animationBuild();
    const out = join(SCRATCH, `probe-${name}`);
    await mkdir(out, { recursive: true });
    const script = `<script>
(async () => {
    ${PROBE_HELPERS}
    try {
        await until(() => canvas()?.dataset.ready === "true");
        await settled();
        ${scenario}
    } catch (error) {
        shots.push({ name: "error", error: String(error) });
    }
    const probe = document.createElement("pre");
    probe.id = "probe";
    probe.textContent = JSON.stringify(shots);
    document.body.append(probe);
})();
</script>`;
    const html = await readFile(join(built, "index.html"), "utf8");
    await writeFile(
        join(out, "index.html"),
        html
            .replace("</head>", `${PROBE_STYLE}</head>`)
            .replace("</body>", `${script}</body>`),
    );
    const { html: dumped } = await renderPage(CHROME, viewUrlIn(out, view), {
        flags,
    });
    const probe = parseDocument(dumped).querySelector("#probe");
    assert.ok(probe, "the scenario should have finished");
    const shots = JSON.parse(probe.textContent);
    const error = shots.find((shot) => shot.name === "error");
    assert.equal(error, undefined, `the scenario failed: ${error?.error}`);
    return Object.fromEntries(shots.map((shot) => [shot.name, shot]));
};

/** Chrome's switch for `prefers-reduced-motion: reduce`. */
const REDUCED_MOTION = ["--force-prefers-reduced-motion"];

/** Each edge's opacity in `shot`, by `id@order`. */
const edgeOpacities = (shot) =>
    Object.fromEntries(
        Object.entries(shot.edges).map(([key, edge]) => [key, edge.opacity]),
    );

test(
    "a dynamic step shows its edges and fades everything else to a real 0.2, text and icon included",
    { skip: SKIP },
    async () => {
        const { full, second } = await probeAnimation(
            "dynamic-step",
            "Checkout",
            `shoot("full");
            click(".next-step");
            click(".next-step");
            await sleep(50);
            shoot("second");`,
        );
        assert.ok(
            Object.values(full.elements).every((e) => e.opacity === 1),
            "nothing is faded before the first step",
        );

        assert.deepEqual(
            edgeOpacities(second),
            {
                "10@1": 0.2,
                "11@2": 1,
                "12@3": 0.2,
                "13@3": 0.2,
                "11@4": 0.2,
                // No order: never part of a step, never faded.
                "14@": 1,
            },
            "step 2 is relationship 11 at order 2",
        );
        for (const [id, expected] of [
            ["1", 0.2],
            ["3", 1],
            ["4", 1],
            ["5", 0.2],
            ["6", 0.2],
        ]) {
            const element = second.elements[id];
            assert.equal(element.opacity, expected, `element ${id}`);
            assert.equal(element.text, expected, `element ${id}'s text`);
            assert.equal(element.inert, false, `element ${id} is not inert`);
            assert.equal(
                element.transition,
                "opacity 200ms",
                `element ${id} eases`,
            );
        }
        assert.equal(second.elements["1"].icon, 0.2, "the Customer's icon");
        assert.deepEqual(second.boundaries, { 2: 1 }, "boundaries never fade");
    },
);

test(
    "a static step hides what it has not revealed, at opacity 0 and inert",
    { skip: SKIP },
    async () => {
        const { first, second } = await probeAnimation(
            "static-step",
            "Containers",
            `click(".next-step");
            await sleep(50);
            shoot("first");
            click(".next-step");
            await sleep(50);
            shoot("second");`,
        );
        assert.deepEqual(
            first.boundaries,
            { 2: 0 },
            "the shop appears with its first child",
        );
        for (const [id, shown] of [
            ["1", true],
            ["3", true],
            ["4", false],
            ["5", false],
            ["6", false],
        ]) {
            const element = second.elements[id];
            assert.equal(element.opacity, shown ? 1 : 0, `element ${id}`);
            assert.equal(element.text, shown ? 1 : 0, `element ${id}'s text`);
            assert.equal(element.inert, !shown, `element ${id} inert`);
        }
        assert.deepEqual(edgeOpacities(second), {
            "10@": 1,
            "11@": 0,
            "12@": 0,
            "13@": 0,
            "14@": 0,
        });
        assert.deepEqual(second.boundaries, { 2: 1 });
    },
);

test("Escape on the canvas stops the animation", { skip: SKIP }, async () => {
    const { playing, stopped } = await probeAnimation(
        "escape",
        "CheckoutInPlace",
        `click(".play-animation");
            await sleep(50);
            shoot("playing");
            canvas().focus();
            canvas().dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await sleep(50);
            shoot("stopped");`,
    );
    assert.equal(playing.play, "Pause animation");
    assert.equal(playing.edges["11@2"].opacity, 0.2, "step 1 is showing");
    assert.equal(stopped.play, "Play animation", "play has stopped");
    assert.ok(
        Object.values(edgeOpacities(stopped)).every((o) => o === 1),
        "the full view is back",
    );
});

// Under reduced motion each viewport change is instant; an eased one runs
// on animation frames, which virtual time never produces.
test(
    "zoomOnAnimation fits each step and the whole view on stop",
    { skip: SKIP },
    async () => {
        const { full, first, second, stopped } = await probeAnimation(
            "zoom",
            "Checkout",
            `shoot("full");
            click(".next-step");
            await sleep(50);
            shoot("first");
            click(".next-step");
            await sleep(50);
            shoot("second");
            canvas().dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await sleep(50);
            shoot("stopped");`,
            { flags: REDUCED_MOTION },
        );
        assert.notEqual(first.viewport, full.viewport, "step 1 is fitted");
        assert.notEqual(second.viewport, first.viewport, "and so is step 2");
        assert.equal(stopped.viewport, full.viewport, "stop fits the view");
    },
);

test(
    "without zoomOnAnimation a step never moves the viewport",
    { skip: SKIP },
    async () => {
        const { full, first, second, stopped } = await probeAnimation(
            "no-zoom",
            "CheckoutInPlace",
            `shoot("full");
            click(".next-step");
            await sleep(50);
            shoot("first");
            click(".next-step");
            await sleep(50);
            shoot("second");
            canvas().dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
            await sleep(50);
            shoot("stopped");`,
            { flags: REDUCED_MOTION },
        );
        for (const shot of [first, second, stopped]) {
            assert.equal(shot.viewport, full.viewport, shot.name);
        }
    },
);

test(
    "switching views mid-step never refits the outgoing view",
    { skip: SKIP },
    async () => {
        // What changes once the drawer is clicked, in order: the canvas's
        // view key and its viewport. The outgoing view's refit would move
        // the viewport while the canvas still shows Checkout.
        const { full, stepped, switched } = await probeAnimation(
            "switch",
            "Checkout",
            `shoot("full");
            click(".next-step");
            await sleep(50);
            shoot("stepped");
            const seen = [];
            new MutationObserver((records) => {
                for (const record of records) {
                    const { target } = record;
                    if (record.attributeName === "data-view-key") {
                        seen.push("view " + target.dataset.viewKey);
                    } else if (target.classList.contains("react-flow__viewport")) {
                        seen.push("viewport");
                    }
                }
            }).observe(canvas(), {
                attributes: true,
                attributeFilter: ["style", "data-view-key"],
                subtree: true,
            });
            click('#structurizr-diagram-navigation [data-viewkey="Containers"] button');
            await until(
                () =>
                    canvas().dataset.viewKey === "Containers" &&
                    canvas().dataset.ready === "true",
            );
            await sleep(50);
            shoot("switched");
            shots.at(-1).seen = seen;`,
            { flags: REDUCED_MOTION },
        );
        assert.notEqual(stepped.viewport, full.viewport);
        assert.equal(switched.view, "Containers");
        assert.equal(
            switched.seen[0],
            "view Containers",
            `the outgoing view was refitted: ${switched.seen.join(", ")}`,
        );
        assert.ok(
            switched.seen.includes("viewport"),
            "and the new view was fitted",
        );
    },
);

test(
    "back on the painted view before the next one paints, its steps return",
    { skip: SKIP },
    async () => {
        // Both clicks land before Containers paints, so the canvas never
        // leaves Checkout and has nothing new to paint.
        const { back, stepped } = await probeAnimation(
            "back",
            "Checkout",
            `click('#structurizr-diagram-navigation [data-viewkey="Containers"] button');
            click('#structurizr-diagram-navigation [data-viewkey="Checkout"] button');
            await sleep(300);
            shoot("back");
            shots.at(-1).hidden = document.querySelector(".animation-buttons").hidden;
            click(".next-step");
            await sleep(50);
            shoot("stepped");`,
        );
        assert.equal(back.view, "Checkout");
        assert.equal(back.hidden, false, "the animation buttons still show");
        assert.equal(
            edgeOpacities(stepped)["11@2"],
            0.2,
            "and the next step still fades the edges outside it",
        );
    },
);

test(
    "under reduced motion a step changes at once",
    { skip: SKIP },
    async () => {
        const { full, first } = await probeAnimation(
            "reduced-motion",
            "Checkout",
            `shoot("full");
            click(".next-step");
            await sleep(0);
            shoot("first");`,
            { flags: REDUCED_MOTION },
        );
        assert.equal(first.elements["5"].opacity, 0.2);
        for (const [id, element] of Object.entries(first.elements)) {
            assert.equal(element.transition, "", `element ${id} does not ease`);
        }
        for (const [key, edge] of Object.entries(first.edges)) {
            assert.equal(edge.transition, "", `edge ${key} does not ease`);
        }
        assert.notEqual(
            first.viewport,
            full.viewport,
            "the step is fitted without waiting for a transition",
        );
    },
);

test(
    "changing the scheme or the labels keeps the step and play",
    { skip: SKIP },
    async () => {
        const { playing, scheme, labels } = await probeAnimation(
            "scheme-and-labels",
            "CheckoutInPlace",
            `click(".play-animation");
            await sleep(50);
            shoot("playing");
            click(".dark-mode");
            await sleep(50);
            shoot("scheme");
            click(".toggle-description");
            await sleep(50);
            shoot("labels");`,
        );
        assert.notEqual(scheme.scheme, playing.scheme, "the scheme changed");
        assert.equal(labels.descriptions, 0, "descriptions are hidden");
        for (const shot of [scheme, labels]) {
            assert.equal(shot.play, "Pause animation", `${shot.name}: playing`);
            assert.deepEqual(
                edgeOpacities(shot),
                edgeOpacities(playing),
                `${shot.name}: still step 1`,
            );
        }
    },
);

/* --------------------------------------------------------- decision graph */

/** The committed decision graph fixture, built once as a single file. */
const decisionGraphBuild = once(async () => {
    const out = join(SCRATCH, "decision-graph");
    const result = await runCli(
        [
            join(REPO_ROOT, "test/__fixtures__/decision-graph.json"),
            "--out",
            out,
            "--single-file",
        ],
        { env: OFFLINE },
    );
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    return out;
});

/**
 * Measures, in the page, where each dot sits and where its entry's first line
 * is, in the menu or on the index. The first line's center comes from the title's first character, apart
 * from anything the graph itself measures, so a dot that drifts to the middle
 * of a wrapped title shows up here.
 */
const dotProbe = (scope) => `<script>
(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const result = { rows: [] };
    try {
        for (let tries = 0; tries < 400; tries++) {
            if (document.querySelector('${scope} [data-mark="dot"]')) break;
            await sleep(25);
        }
        await document.fonts.ready;
        // Let the graph hear about any rewrap the font caused.
        await sleep(200);
        const center = (rect) => (rect.top + rect.bottom) / 2;
        for (const anchor of document.querySelectorAll("${scope} a[data-item-id]")) {
            const id = anchor.dataset.itemId;
            const title = anchor.lastElementChild;
            const range = document.createRange();
            range.setStart(title.firstChild, 0);
            range.setEnd(title.firstChild, 1);
            const dot = document.querySelector(
                '${scope} [data-mark="dot"][data-decision="' + id + '"]',
            );
            const lineHeight = parseFloat(getComputedStyle(title).lineHeight);
            result.rows.push({
                id,
                line: center(range.getClientRects()[0]),
                dot: dot ? center(dot.getBoundingClientRect()) : null,
                lines: Math.round(title.getBoundingClientRect().height / lineHeight),
            });
        }
        result.elbows = document.querySelectorAll('${scope} [data-mark="edge"]').length;
    } catch (error) {
        result.error = String(error);
    }
    const probe = document.createElement("pre");
    probe.id = "probe";
    probe.textContent = JSON.stringify(result);
    document.body.append(probe);
})();
</script>`;

test(
    "each dot of the decision graph lines up with its entry's first line, wrapped titles included",
    { skip: SKIP },
    async () => {
        const built = await decisionGraphBuild();
        const out = join(SCRATCH, "probe-decision-graph");
        await mkdir(out, { recursive: true });
        const html = await readFile(join(built, "index.html"), "utf8");
        await writeFile(
            join(out, "index.html"),
            html.replace("</body>", `${dotProbe("#adrs-menu")}</body>`),
        );

        const { html: dumped } = await renderPage(
            CHROME,
            `${fileUrl(join(out, "index.html"))}#/?page=adrs&adr=4`,
        );
        const probe = parseDocument(dumped).querySelector("#probe");
        assert.ok(probe, "the probe should have finished");
        const { rows, elbows, error } = JSON.parse(probe.textContent);
        assert.equal(error, undefined, `the probe failed: ${error}`);

        assert.equal(rows.length, 46, "every decision has an entry");
        assert.ok(
            rows.some((row) => row.lines > 1),
            "some titles wrap, or this checks nothing about them",
        );
        for (const row of rows) {
            assert.notEqual(row.dot, null, `decision ${row.id} has a dot`);
            assert.ok(
                Math.abs(row.dot - row.line) <= 1.5,
                `decision ${row.id}'s dot sits at ${row.dot}, its first line at ${row.line}`,
            );
        }
        // 4 supersedes 3, and 6 amends it.
        assert.equal(elbows, 2, "the open decision draws its elbows");
    },
);

test(
    "each dot of the index's decision graph lines up with its row's first line",
    { skip: SKIP },
    async () => {
        const built = await decisionGraphBuild();
        const out = join(SCRATCH, "probe-decision-index");
        await mkdir(out, { recursive: true });
        const html = await readFile(join(built, "index.html"), "utf8");
        await writeFile(
            join(out, "index.html"),
            html.replace("</body>", `${dotProbe("#adrs-index")}</body>`),
        );

        const { html: dumped } = await renderPage(
            CHROME,
            `${fileUrl(join(out, "index.html"))}#/?page=adrs`,
        );
        const probe = parseDocument(dumped).querySelector("#probe");
        assert.ok(probe, "the probe should have finished");
        const { rows, error } = JSON.parse(probe.textContent);
        assert.equal(error, undefined, `the probe failed: ${error}`);

        assert.equal(rows.length, 46, "every decision has a row");
        for (const row of rows) {
            assert.notEqual(row.dot, null, `decision ${row.id} has a dot`);
            assert.ok(
                Math.abs(row.dot - row.line) <= 1.5,
                `decision ${row.id}'s dot sits at ${row.dot}, its first line at ${row.line}`,
            );
        }
    },
);

/**
 * Expands the decision graph the way a reader does, then measures where the
 * menu text and the decision body sit, and whether the controls bar stays put
 * while the menu scrolls.
 */
const EXPAND_PROBE = `<script>
(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const result = {};
    try {
        for (let tries = 0; tries < 400; tries++) {
            if (document.querySelector('#adrs-menu [data-mark="dot"]')) break;
            await sleep(25);
        }
        await document.fonts.ready;
        await sleep(200);
        const edges = () => ({
            text: document.querySelector("#adrs-menu a[data-item-id]").getBoundingClientRect().left,
            menu: document.getElementById("adrs-menu").getBoundingClientRect().right,
            body: document.getElementById("decision").getBoundingClientRect().left,
            graph: document.querySelector("#adrs-graph svg").getBoundingClientRect().width,
        });
        result.collapsed = edges();
        const style = (selector) => {
            const mark = document.querySelector("#adrs-menu " + selector);
            if (!mark) return null;
            const computed = getComputedStyle(mark);
            return {
                dash: computed.strokeDasharray,
                width: computed.strokeWidth,
                opacity: computed.opacity,
                fillOpacity: computed.fillOpacity,
            };
        };
        result.collapsedLit = style('[data-mark="dot"][data-highlighted]');
        result.collapsedDimmed = style('[data-mark="dot"][data-dimmed]');

        document.getElementById("adrs-expand").click();
        await sleep(200);
        result.expanded = edges();
        result.state = document.getElementById("adrs-graph").dataset.state;
        result.stretches = document.querySelectorAll('#adrs-menu [data-mark="stretch"]').length;
        result.litReference = style('[data-kind="reference"][data-highlighted]');
        result.fallback = document.getElementById("adrs-graph").dataset.fallback;
        result.dimmed = style("[data-dimmed]");

        const bar = document.getElementById("adrs-controls");
        const scroll = document.getElementById("adrs-scroll");
        const before = bar.getBoundingClientRect().top;
        scroll.scrollTop = scroll.scrollHeight;
        await sleep(100);
        result.scrolled = scroll.scrollTop;
        result.bar = { before, after: bar.getBoundingClientRect().top };
    } catch (error) {
        result.error = String(error);
    }
    const probe = document.createElement("pre");
    probe.id = "probe";
    probe.textContent = JSON.stringify(result);
    document.body.append(probe);
})();
</script>`;

test(
    "expanding the decision graph pushes the menu text right without covering the decision body, under a controls bar that stays put",
    { skip: SKIP },
    async () => {
        const built = await decisionGraphBuild();
        const out = join(SCRATCH, "probe-decision-graph-expanded");
        await mkdir(out, { recursive: true });
        const html = await readFile(join(built, "index.html"), "utf8");
        await writeFile(
            join(out, "index.html"),
            html.replace("</body>", `${EXPAND_PROBE}</body>`),
        );

        const { html: dumped } = await renderPage(
            CHROME,
            `${fileUrl(join(out, "index.html"))}#/?page=adrs&adr=7`,
        );
        const probe = parseDocument(dumped).querySelector("#probe");
        assert.ok(probe, "the probe should have finished");
        const result = JSON.parse(probe.textContent);
        assert.equal(
            result.error,
            undefined,
            `the probe failed: ${result.error}`,
        );

        const { collapsed, expanded } = result;
        assert.equal(result.state, "expanded");
        assert.ok(result.stretches > 0, "the expanded graph draws its lanes");
        // Decision 46 builds on 35 others, past the menu's cap, so only
        // supersede and amend lanes draw. 7 references 6, and that reference
        // lights up on the reference column.
        const { litReference, dimmed } = result;
        assert.equal(result.fallback, "lineage");
        assert.ok(litReference, "7's reference lights up on the column");
        assert.notEqual(
            litReference.dash,
            "none",
            "a lit reference stays dotted",
        );
        assert.equal(litReference.width, "1.5px");
        assert.equal(litReference.opacity, "1");
        assert.equal(dimmed.opacity, "0.3", "everything else dims to 30%");
        const { collapsedLit, collapsedDimmed } = result;
        assert.equal(
            collapsedLit.opacity,
            "1",
            "collapsed, a linked dot shows in full",
        );
        assert.equal(collapsedLit.fillOpacity, "1", "in its full color");
        assert.equal(
            collapsedDimmed.opacity,
            "0.3",
            "collapsed, the rest dims to the same 30% as expanded",
        );
        const grown = expanded.graph - collapsed.graph;
        assert.ok(
            Math.abs(expanded.text - collapsed.text - grown) <= 1,
            `the menu text moves right by the ${grown}px the graph grew: from ${collapsed.text} to ${expanded.text}`,
        );
        assert.ok(
            expanded.menu <= expanded.body,
            `the menu ends at ${expanded.menu}, after the body starts at ${expanded.body}`,
        );
        assert.ok(
            result.scrolled > 0,
            "the menu scrolls, or this checks nothing",
        );
        assert.equal(
            result.bar.after,
            result.bar.before,
            "the controls bar stays in view while the menu scrolls",
        );
    },
);

/* ------------------------------------------ decision graph lanes that scroll */

/** The scrolling fixture, built once as a single file. */
const decisionGraphScrollBuild = once(async () => {
    const out = join(SCRATCH, "decision-graph-scroll");
    const result = await runCli(
        [
            join(REPO_ROOT, "test/__fixtures__/decision-graph-scroll.json"),
            "--out",
            out,
            "--single-file",
        ],
        { env: OFFLINE },
    );
    assert.equal(result.code, 0, `build failed:\n${result.stderr}`);
    return out;
});

/**
 * Measures the scrolling lanes in the page: where the lanes' view starts,
 * whether a scrollbar takes room, and what stays pinned while the lanes
 * scroll. In the menu it expands the decision graph first, the way a reader
 * does.
 */
const lanesProbe = (scope) => `<script>
(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const result = {};
    try {
        for (let tries = 0; tries < 400; tries++) {
            if (document.querySelector('${scope} [data-mark="dot"]')) break;
            await sleep(25);
        }
        await document.fonts.ready;
        await sleep(200);
        if ("${scope}" === "#adrs-menu") {
            document.getElementById("adrs-expand").click();
            await sleep(200);
        }
        const view = document.querySelector("${scope} [data-lanes]");
        const strip = document.querySelector("${scope} [data-pinned]");
        const left = (id) =>
            document
                .querySelector('${scope} [data-lanes] [data-mark="dot"][data-decision="' + id + '"]')
                .getBoundingClientRect().left;
        const measure = () => ({
            scrollLeft: view.scrollLeft,
            end: view.scrollWidth - view.clientWidth,
            view: view.getBoundingClientRect().toJSON(),
            strip: strip.getBoundingClientRect().toJSON(),
            dot41: left("41"),
            dot80: left("80"),
        });
        result.fallback = document.querySelector("${scope} [data-decision-graph]").dataset.fallback;
        result.scrollbar = {
            style: getComputedStyle(view).scrollbarWidth,
            height: view.offsetHeight - view.clientHeight,
        };
        result.buttons = [...document.querySelectorAll("${scope} [data-scroll-lanes]")].filter(
            (button) => button.offsetParent !== null,
        ).length;
        result.first = measure();
        // A swipe would scroll the view itself. (The buttons scroll it
        // smoothly, which virtual time never animates.)
        view.scrollLeft += 48;
        await sleep(100);
        result.right = measure();
    } catch (error) {
        result.error = String(error);
    }
    const probe = document.createElement("pre");
    probe.id = "probe";
    probe.textContent = JSON.stringify(result);
    document.body.append(probe);
})();
</script>`;

/** Load the scrolling fixture with the probe, and return what it measured. */
const probeLanes = async (scope, route) => {
    const built = await decisionGraphScrollBuild();
    const out = join(SCRATCH, `probe-lanes-${scope.slice(1)}`);
    await mkdir(out, { recursive: true });
    const html = await readFile(join(built, "index.html"), "utf8");
    await writeFile(
        join(out, "index.html"),
        html.replace("</body>", `${lanesProbe(scope)}</body>`),
    );
    const { html: dumped } = await renderPage(
        CHROME,
        `${fileUrl(join(out, "index.html"))}#/?${route}`,
    );
    const probe = parseDocument(dumped).querySelector("#probe");
    assert.ok(probe, "the probe should have finished");
    const result = JSON.parse(probe.textContent);
    assert.equal(result.error, undefined, `the probe failed: ${result.error}`);
    return result;
};

/** Whether a dot sits in the lanes' view, clear of the pinned strip. */
const inLanes = ({ view, strip }, x) => x >= view.left && x < strip.left;

test(
    "past the menu's cap, the lanes scroll under pinned columns with no scrollbar, following the open decision",
    { skip: SKIP },
    async () => {
        const result = await probeLanes("#adrs-menu", "page=adrs&adr=41");
        const { first, right } = result;

        assert.equal(result.fallback, "scroll");
        assert.equal(result.scrollbar.style, "none");
        assert.equal(result.scrollbar.height, 0, "no scrollbar takes room");
        assert.equal(result.buttons, 2, "‹ › show in the controls bar");

        // 41's lane is the last; its reference to 40 reaches the first lane,
        // too far to show both, so 41's own lane wins.
        assert.ok(first.end > 0, "the lanes overflow their view");
        assert.equal(first.scrollLeft, 0);
        assert.ok(inLanes(first, first.dot41), "41's lane is in view");
        assert.equal(
            Math.round(first.strip.right),
            Math.round(first.view.right),
            "the pinned strip covers the view's right edge",
        );

        // Four columns toward the titles, the lanes move under a pinned
        // strip that stays where it was.
        assert.equal(right.scrollLeft, 48);
        assert.equal(Math.round(first.dot41 - right.dot41), 48);
        assert.deepEqual(right.strip, first.strip, "the pinned strip stays");
    },
);

test(
    "on the index, the lanes start at the titles' edge, with ‹ › in a bar of their own",
    { skip: SKIP },
    async () => {
        const result = await probeLanes("#adrs-index", "page=adrs");
        const { first } = result;

        assert.equal(result.fallback, "scroll");
        assert.equal(result.scrollbar.height, 0, "no scrollbar takes room");
        assert.equal(result.buttons, 2);
        assert.ok(first.end > 0, "the lanes overflow their view");
        assert.equal(first.scrollLeft, first.end, "at the titles' edge");
        assert.ok(inLanes(first, first.dot80), "the first lane is in view");
        assert.ok(!inLanes(first, first.dot41), "the last lane is not");
    },
);
