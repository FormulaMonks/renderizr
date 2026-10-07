import assert from "node:assert/strict";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fixture, withTempDir } from "./__fixtures__/helpers.js";
import {
    applyLayout,
    printWorkspace,
    readWorkspace,
    renderWorkspace,
    setInOrder,
    StaleVersionError,
    stampWorkspace,
    versionOf,
    WorkspaceWriter,
} from "./workspace-writer.js";

/**
 * The writer of edit mode (spec 7, ADR 17): `workspace.json` the way
 * Structurizr reads and writes it.
 */

/** Files Structurizr's own writer printed, kept byte for byte. */
const STRUCTURIZR_FILES = [
    "structurizr/acceptance-export.json",
    "structurizr/acceptance-merge.json",
    "structurizr/acceptance-merge-renamed.json",
    "structurizr/acceptance-merge-script.json",
    "structurizr/large-landscape-export.json",
];

/** A small workspace with one stored-layout view, as Structurizr prints it. */
const SMALL = {
    id: 7,
    name: "Small",
    model: {
        people: [{ id: "1", name: "User", tags: "Element,Person" }],
        softwareSystems: [
            {
                id: "2",
                name: "System",
                tags: "Element,Software System",
                relationships: [
                    {
                        id: "3",
                        sourceId: "2",
                        destinationId: "1",
                        description: "Notifies",
                        tags: "Relationship",
                    },
                ],
            },
        ],
    },
    views: {
        systemLandscapeViews: [
            {
                key: "Landscape",
                elements: [
                    { id: "1", x: 100, y: 200 },
                    { id: "2", x: 600, y: 200 },
                ],
                relationships: [
                    {
                        id: "3",
                        jump: true,
                        position: 40,
                        routing: "Curved",
                        vertices: [{ x: 400, y: 100 }],
                    },
                ],
            },
        ],
        configuration: { styles: {} },
    },
};

const small = () => structuredClone(SMALL);
const NOW = new Date("2026-10-07T12:34:56.789Z");
const AGENT = "renderizr/1.2.3";

/* ----------------------------------------------------------------- printer */

for (const name of STRUCTURIZR_FILES) {
    test(`the writer prints ${name} byte for byte as Structurizr did`, async () => {
        const text = await readFile(fixture(name), "utf8");
        assert.equal(
            printWorkspace(JSON.parse(text)),
            text,
            "printing the parsed file changed its bytes",
        );
        const { workspace, newline } = readWorkspace(text);
        assert.equal(
            printWorkspace(workspace, { newline }),
            text,
            "a Structurizr read dropped or changed something Structurizr wrote",
        );
    });
}

test("the printer follows Jackson: two spaces, spaced colons, inline arrays, no final newline", () => {
    assert.equal(
        printWorkspace({
            a: 1,
            b: "two",
            c: [{ d: true }, { e: null }],
            f: {},
            g: [],
            h: [1, 2],
        }),
        [
            "{",
            '  "a" : 1,',
            '  "b" : "two",',
            '  "c" : [ {',
            '    "d" : true',
            "  }, {",
            '    "e" : null',
            "  } ],",
            '  "f" : { },',
            '  "g" : [ ],',
            '  "h" : [ 1, 2 ]',
            "}",
        ].join("\n"),
    );
});

test("the printer escapes as Jackson does and leaves other characters alone", () => {
    assert.equal(
        printWorkspace({ s: 'q"b\\n\nr\rt\tu\u0001é/ü' }),
        '{\n  "s" : "q\\"b\\\\n\\nr\\rt\\tu\\u0001é/ü"\n}',
    );
});

test("the printer writes the line ending it is given", () => {
    assert.equal(
        printWorkspace({ a: { b: 1 } }, { newline: "\r\n" }),
        '{\r\n  "a" : {\r\n    "b" : 1\r\n  }\r\n}',
    );
});

/* --------------------------------------------------------- Structurizr read */

test("a read drops keys Structurizr doesn't define, at every depth", () => {
    const workspace = small();
    workspace.renderizr = { extra: true };
    workspace.model.people[0].nickname = "Bob";
    workspace.views.systemLandscapeViews[0].elements[0].width = 300;
    workspace.views.systemLandscapeViews[0].zoom = 2;
    const read = readWorkspace(JSON.stringify(workspace)).workspace;
    assert.equal(read.renderizr, undefined);
    assert.equal(read.model.people[0].nickname, undefined);
    assert.deepEqual(read.views.systemLandscapeViews[0].elements[0], {
        id: "1",
        x: 100,
        y: 200,
    });
    assert.equal(read.views.systemLandscapeViews[0].zoom, undefined);
    assert.equal(read.model.people[0].name, "User");
});

test("a read keeps only scope in the workspace configuration", () => {
    const workspace = small();
    workspace.configuration = {
        scope: "Landscape",
        visibility: "Public",
        users: [{ username: "a", role: "ReadWrite" }],
    };
    const read = readWorkspace(JSON.stringify(workspace)).workspace;
    assert.deepEqual(read.configuration, { scope: "Landscape" });
});

test("a read truncates fractions in whole-number fields and clamps position", () => {
    const workspace = small();
    const view = workspace.views.systemLandscapeViews[0];
    view.elements[0].x = 100.9;
    view.elements[0].y = -20.7;
    view.relationships[0].vertices = [{ x: 10.5, y: 20.99 }];
    view.relationships[0].position = 140;
    const read = readWorkspace(JSON.stringify(workspace)).workspace;
    const drawn = read.views.systemLandscapeViews[0];
    assert.deepEqual(drawn.elements[0], { id: "1", x: 100, y: -20 });
    assert.deepEqual(drawn.relationships[0].vertices, [{ x: 10, y: 20 }]);
    assert.equal(drawn.relationships[0].position, 100);

    view.relationships[0].position = -5;
    const below = readWorkspace(JSON.stringify(workspace)).workspace;
    assert.equal(
        below.views.systemLandscapeViews[0].relationships[0].position,
        0,
    );
});

test("a read drops routing modes and paper sizes Structurizr doesn't know", () => {
    const workspace = small();
    const view = workspace.views.systemLandscapeViews[0];
    view.relationships[0].routing = "Wiggly";
    view.paperSize = "A11_Landscape";
    const read = readWorkspace(JSON.stringify(workspace)).workspace;
    const drawn = read.views.systemLandscapeViews[0];
    assert.equal(drawn.relationships[0].routing, undefined);
    assert.equal(drawn.paperSize, undefined);

    view.relationships[0].routing = "Orthogonal";
    view.paperSize = "A4_Landscape";
    const known = readWorkspace(JSON.stringify(workspace)).workspace;
    assert.equal(
        known.views.systemLandscapeViews[0].relationships[0].routing,
        "Orthogonal",
    );
    assert.equal(known.views.systemLandscapeViews[0].paperSize, "A4_Landscape");
});

test("a read leaves out nulls, empty strings and empty lists", () => {
    const workspace = small();
    workspace.description = "";
    workspace.version = null;
    workspace.model.people[0].relationships = [];
    const read = readWorkspace(JSON.stringify(workspace)).workspace;
    assert.ok(!("description" in read));
    assert.ok(!("version" in read));
    assert.ok(!("relationships" in read.model.people[0]));
});

test("a read takes the file's line endings, and LF for a file with none", () => {
    assert.equal(readWorkspace('{\r\n  "name" : "A"\r\n}').newline, "\r\n");
    assert.equal(readWorkspace('{\n  "name" : "A"\n}').newline, "\n");
    assert.equal(readWorkspace('{"name":"A"}').newline, "\n");
});

/* ------------------------------------------------------------------ layout */

test("applying a layout sets element x and y and keeps every relationship field as found", () => {
    const workspace = small();
    applyLayout(workspace, {
        Landscape: { elements: { 1: { x: 150, y: 250 } } },
    });
    const view = workspace.views.systemLandscapeViews[0];
    assert.deepEqual(view.elements[0], { id: "1", x: 150, y: 250 });
    assert.deepEqual(view.elements[1], { id: "2", x: 600, y: 200 });
    assert.deepEqual(
        view.relationships,
        SMALL.views.systemLandscapeViews[0].relationships,
    );
});

test("applying a layout puts an element landing on (0,0) at (5,0)", () => {
    const workspace = small();
    applyLayout(workspace, { Landscape: { elements: { 1: { x: 0, y: 0 } } } });
    assert.deepEqual(workspace.views.systemLandscapeViews[0].elements[0], {
        id: "1",
        x: 5,
        y: 0,
    });
});

test("applying a layout truncates fractions and skips elements and views the workspace doesn't have", () => {
    const workspace = small();
    applyLayout(workspace, {
        Landscape: {
            elements: { 1: { x: 10.8, y: 20.2 }, 99: { x: 1, y: 1 } },
        },
        Gone: { elements: { 1: { x: 1, y: 1 } } },
    });
    const view = workspace.views.systemLandscapeViews[0];
    assert.deepEqual(view.elements[0], { id: "1", x: 10, y: 20 });
    assert.equal(view.elements.length, 2);
});

test("a new x or y goes where Structurizr's writer puts it, and existing keys keep their order", () => {
    const workspace = {
        views: {
            containerViews: [
                {
                    softwareSystemId: "2",
                    key: "Containers",
                    elements: [{ id: "4" }, { y: 1, id: "5", x: 1 }],
                },
            ],
        },
    };
    applyLayout(workspace, {
        Containers: { elements: { 4: { x: 30, y: 40 }, 5: { x: 7, y: 8 } } },
    });
    const [added, kept] = workspace.views.containerViews[0].elements;
    assert.deepEqual(Object.keys(added), ["id", "x", "y"]);
    assert.deepEqual(Object.keys(kept), ["y", "id", "x"]);
    assert.deepEqual(Object.keys(workspace.views.containerViews[0]), [
        "softwareSystemId",
        "key",
        "elements",
    ]);
});

test("applying a layout saves dimensions where Structurizr's writer puts them, in whole units", () => {
    const workspace = small();
    applyLayout(workspace, {
        Landscape: { dimensions: { width: 2100.7, height: 1800 } },
    });
    const view = workspace.views.systemLandscapeViews[0];
    assert.deepEqual(view.dimensions, { height: 1800, width: 2100 });
    assert.deepEqual(Object.keys(view.dimensions), ["height", "width"]);
    assert.deepEqual(Object.keys(view), [
        "dimensions",
        "key",
        "elements",
        "relationships",
    ]);
});

test("applying a layout deletes paperSize where a canvas command did, and restores one an undo brings back", () => {
    const workspace = small();
    const view = workspace.views.systemLandscapeViews[0];
    view.paperSize = "A4_Landscape";
    applyLayout(workspace, { Landscape: { paperSize: null } });
    assert.equal(Object.hasOwn(view, "paperSize"), false);
    applyLayout(workspace, { Landscape: { paperSize: "A3_Portrait" } });
    assert.equal(view.paperSize, "A3_Portrait");
    applyLayout(workspace, { Landscape: { paperSize: "Napkin" } });
    assert.equal(
        view.paperSize,
        "A3_Portrait",
        "an unknown paper size is ignored",
    );
});

test("applying a layout saves vertices in whole units, deletes them when cleared, and keeps the routing, position and jump it doesn't name", () => {
    const workspace = small();
    const [relationship] =
        workspace.views.systemLandscapeViews[0].relationships;
    applyLayout(workspace, {
        Landscape: {
            relationships: {
                3: {
                    vertices: [
                        { x: 10.6, y: 20 },
                        { x: 30, y: 40 },
                    ],
                },
            },
        },
    });
    assert.deepEqual(relationship.vertices, [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
    ]);
    applyLayout(workspace, {
        Landscape: {
            relationships: { 3: { vertices: [] }, 99: { vertices: [] } },
        },
    });
    assert.deepEqual(relationship, {
        id: "3",
        jump: true,
        position: 40,
        routing: "Curved",
    });
});

test("applying a layout saves routing and position, position whole and within 0 to 100, and keeps jump as found", () => {
    const workspace = small();
    const [relationship] =
        workspace.views.systemLandscapeViews[0].relationships;
    Reflect.deleteProperty(relationship, "routing");
    Reflect.deleteProperty(relationship, "position");
    applyLayout(workspace, {
        Landscape: {
            relationships: { 3: { routing: "Orthogonal", position: 62.7 } },
        },
    });
    assert.deepEqual(Object.keys(relationship), [
        "id",
        "jump",
        "position",
        "routing",
        "vertices",
    ]);
    assert.equal(relationship.routing, "Orthogonal");
    assert.equal(relationship.position, 62);
    applyLayout(workspace, {
        Landscape: {
            relationships: { 3: { routing: "Sideways", position: 140 } },
        },
    });
    assert.equal(
        relationship.routing,
        "Orthogonal",
        "an unknown mode is ignored",
    );
    assert.equal(relationship.position, 100, "position stops at 100");
    applyLayout(workspace, {
        Landscape: { relationships: { 3: { position: -3 } } },
    });
    assert.equal(relationship.position, 0, "position stops at 0");
    assert.equal(relationship.jump, true, "jump stays as found");
    assert.deepEqual(relationship.vertices, [{ x: 400, y: 100 }]);
});

test("vertices of a relationship a dynamic view lists twice go to the entry its key names", () => {
    const workspace = {
        views: {
            dynamicViews: [
                {
                    key: "Dynamic",
                    elements: [],
                    relationships: [
                        { id: "3", order: "1" },
                        { id: "3", order: "2", response: true },
                    ],
                },
            ],
        },
    };
    applyLayout(workspace, {
        Dynamic: {
            relationships: {
                3: { vertices: [{ x: 1, y: 2 }] },
                "3#1": { vertices: [{ x: 3, y: 4 }] },
            },
        },
    });
    const [first, second] = workspace.views.dynamicViews[0].relationships;
    assert.deepEqual(first.vertices, [{ x: 1, y: 2 }]);
    assert.deepEqual(second.vertices, [{ x: 3, y: 4 }]);
    assert.deepEqual(Object.keys(second), [
        "id",
        "order",
        "response",
        "vertices",
    ]);
});

/* ------------------------------------------------------------------ stamps */

test("stamps set the date to the second, the agent and the last saved view", () => {
    const workspace = small();
    workspace.lastModifiedUser = "someone";
    stampWorkspace(workspace, { agent: AGENT, now: NOW, view: "Landscape" });
    assert.equal(workspace.lastModifiedDate, "2026-10-07T12:34:56Z");
    assert.equal(workspace.lastModifiedAgent, AGENT);
    assert.equal(workspace.lastModifiedUser, "someone");
    assert.equal(workspace.id, 7);
    assert.equal(workspace.views.configuration.lastSavedView, "Landscape");
});

test("stamps give a workspace without an id the id 1, and never invent a user", () => {
    const { id: _id, ...workspace } = small();
    stampWorkspace(workspace, { agent: AGENT, now: NOW, view: "Landscape" });
    assert.equal(workspace.id, 1);
    assert.ok(!("lastModifiedUser" in workspace));
});

test("new stamps take Structurizr's alphabetical places", () => {
    const workspace = small();
    stampWorkspace(workspace, { agent: AGENT, now: NOW, view: "Landscape" });
    assert.deepEqual(Object.keys(workspace), [
        "id",
        "lastModifiedAgent",
        "lastModifiedDate",
        "name",
        "model",
        "views",
    ]);
});

/* ----------------------------------------------------------------- render */

/**
 * The lines `after` lost and gained against `before`, counted as multisets
 * so a line that repeats elsewhere in the file still shows.
 */
function lineChanges(before, after) {
    const count = new Map();
    for (const line of before.split("\n"))
        count.set(line, (count.get(line) ?? 0) + 1);
    const added = [];
    for (const line of after.split("\n")) {
        if (count.get(line)) count.set(line, count.get(line) - 1);
        else added.push(line);
    }
    const removed = [...count].flatMap(([line, n]) => Array(n).fill(line));
    return { removed, added };
}

test("rendering a save changes only the moved element's lines and the stamps", async () => {
    const text = await readFile(
        fixture("structurizr/acceptance-merge.json"),
        "utf8",
    );
    const before = JSON.parse(text);
    const view = before.views.containerViews.find(
        (v) => v.key === "Containers",
    );
    const element = view.elements.find((e) => e.x > 0);
    const { text: saved, changed } = renderWorkspace(text, {
        views: {
            Containers: {
                elements: { [element.id]: { x: element.x + 5, y: element.y } },
            },
        },
        view: "Containers",
        agent: AGENT,
        now: NOW,
    });
    assert.ok(changed);
    const { removed, added } = lineChanges(text, saved);
    assert.deepEqual(removed, [`        "x" : ${element.x},`]);
    assert.deepEqual(added, [
        `  "lastModifiedAgent" : "${AGENT}",`,
        '  "lastModifiedDate" : "2026-10-07T12:34:56Z",',
        `        "x" : ${element.x + 5},`,
    ]);
    // The merge already carried Containers as the last saved view.
    assert.match(text, /"lastSavedView" : "Containers"/);
});

test("rendering a save that changes nothing reports no change", async () => {
    const text = await readFile(
        fixture("structurizr/acceptance-merge.json"),
        "utf8",
    );
    const parsed = JSON.parse(text);
    const view = parsed.views.systemLandscapeViews[0];
    const [{ id, x, y }] = view.elements;
    const { changed } = renderWorkspace(text, {
        views: { [view.key]: { elements: { [id]: { x, y } } } },
        view: view.key,
        agent: AGENT,
        now: NOW,
    });
    assert.equal(changed, false);
});

test("rendering keeps CRLF line endings", () => {
    const text = printWorkspace(small(), { newline: "\r\n" });
    const { text: saved } = renderWorkspace(text, {
        views: { Landscape: { elements: { 1: { x: 120, y: 200 } } } },
        view: "Landscape",
        agent: AGENT,
        now: NOW,
    });
    assert.ok(saved.includes('"x" : 120'));
    assert.equal(saved.split("\r\n").length, saved.split("\n").length);
});

/* ------------------------------------------------------------------- disk */

const withWorkspace = (body) =>
    withTempDir(async (dir) => {
        const file = join(dir, "workspace.json");
        const text = printWorkspace(small());
        await writeFile(file, text);
        return body({ dir, file, text });
    });

test("a save writes through a temporary file renamed over workspace.json and returns the new version", async () => {
    await withWorkspace(async ({ dir, file, text }) => {
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        const { version, written } = await writer.save({
            version: versionOf(text),
            view: "Landscape",
            views: { Landscape: { elements: { 2: { x: 700, y: 200 } } } },
        });
        assert.equal(written, true);
        const saved = await readFile(file, "utf8");
        assert.equal(version, versionOf(saved));
        assert.match(saved, /"x" : 700/);
        assert.deepEqual(await readdir(dir), ["workspace.json"]);
        assert.ok(
            writer.wrote(saved),
            "the writer does not know its own write",
        );
        assert.ok(!writer.wrote(text));
    });
});

test("a save that changes nothing leaves the file alone", async () => {
    await withWorkspace(async ({ file, text }) => {
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        const before = await stat(file);
        const { version, written } = await writer.save({
            version: versionOf(text),
            view: "Landscape",
            views: { Landscape: { elements: { 1: { x: 100, y: 200 } } } },
        });
        assert.equal(written, false);
        assert.equal(version, versionOf(text));
        assert.equal(await readFile(file, "utf8"), text);
        assert.equal((await stat(file)).mtimeMs, before.mtimeMs);
    });
});

test("a save against a version the file no longer has is refused", async () => {
    await withWorkspace(async ({ file, text }) => {
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        await writeFile(file, text.replace('"Small"', '"Changed"'));
        await assert.rejects(
            writer.save({
                version: versionOf(text),
                view: "Landscape",
                views: { Landscape: { elements: { 1: { x: 5, y: 5 } } } },
            }),
            StaleVersionError,
        );
        assert.match(await readFile(file, "utf8"), /"Changed"/);
    });
});

test("saves run one at a time, each against the file the last one wrote", async () => {
    await withWorkspace(async ({ file, text }) => {
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        const first = writer.save({
            version: versionOf(text),
            view: "Landscape",
            views: { Landscape: { elements: { 1: { x: 110, y: 200 } } } },
        });
        const second = first.then(({ version }) =>
            writer.save({
                version,
                view: "Landscape",
                views: { Landscape: { elements: { 2: { x: 610, y: 200 } } } },
            }),
        );
        // A third save from the page's first version, sent while the others
        // run, waits its turn and then finds the file changed.
        const stale = writer.save({
            version: versionOf(text),
            view: "Landscape",
            views: { Landscape: { elements: { 1: { x: 1, y: 1 } } } },
        });
        await second;
        await assert.rejects(stale, StaleVersionError);
        const saved = await readFile(file, "utf8");
        assert.match(saved, /"x" : 110/);
        assert.match(saved, /"x" : 610/);
    });
});

test("the writer knows every recent write of its own, so a late watcher event for an earlier one is no outside change", async () => {
    await withWorkspace(async ({ file, text }) => {
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        const first = await writer.save({
            version: versionOf(text),
            view: "Landscape",
            views: { Landscape: { elements: { 1: { x: 110, y: 200 } } } },
        });
        const firstText = await readFile(file, "utf8");
        await writer.save({
            version: first.version,
            view: "Landscape",
            views: { Landscape: { elements: { 2: { x: 610, y: 200 } } } },
        });
        const secondText = await readFile(file, "utf8");
        assert.ok(writer.wrote(firstText), "the writer forgot its first write");
        assert.ok(writer.wrote(secondText));
        assert.ok(
            !writer.wrote(text),
            "the file it started from isn't its own",
        );
    });
});

/* ------------------------------------------------ a run of the DSL pipeline */

test("a run's workspace replaces the file, read the way Structurizr reads it and stamped", async () => {
    await withWorkspace(async ({ dir, file }) => {
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        const merged = { ...small(), name: "Merged", unknown: true };
        const { written, version } = await writer.replace(
            JSON.stringify(merged),
        );
        assert.equal(written, true);
        const text = await readFile(file, "utf8");
        assert.equal(version, versionOf(text));
        assert.ok(writer.wrote(text), "the writer forgot its own write");
        const saved = JSON.parse(text);
        assert.equal(saved.name, "Merged");
        assert.equal(saved.unknown, undefined, "an unknown key survived");
        assert.equal(saved.lastModifiedAgent, AGENT);
        assert.equal(saved.lastModifiedDate, "2026-10-07T12:34:56Z");
        assert.deepEqual(
            (await readdir(dir)).filter((name) => name.endsWith(".tmp")),
            [],
        );
    });
});

test("a run's workspace that matches the file but for its stamps writes nothing", async () => {
    await withWorkspace(async ({ file }) => {
        // The file as an earlier save left it: stamped, with a last saved view.
        const saved = stampWorkspace(small(), {
            agent: AGENT,
            now: new Date("2026-01-01T00:00:00Z"),
            view: "Landscape",
        });
        setInOrder(saved, "lastModifiedUser", "author");
        const text = printWorkspace(saved);
        await writeFile(file, text);
        const { mtimeMs } = await stat(file);

        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        // Structurizr's merge writes none of these stamps.
        const result = await writer.replace(JSON.stringify(small()));
        assert.deepEqual(result, { version: versionOf(text), written: false });
        assert.equal(await readFile(file, "utf8"), text);
        assert.equal((await stat(file)).mtimeMs, mtimeMs);
    });
});

test("a run's workspace creates workspace.json when there is none", async () => {
    await withTempDir(async (dir) => {
        const file = join(dir, "workspace.json");
        const writer = new WorkspaceWriter(file, {
            agent: AGENT,
            now: () => NOW,
        });
        const { written } = await writer.replace(JSON.stringify(small()));
        assert.equal(written, true);
        const text = await readFile(file, "utf8");
        assert.ok(text.startsWith('{\n  "'));
        assert.ok(!text.includes("\r\n"), "a new file takes LF");
    });
});
