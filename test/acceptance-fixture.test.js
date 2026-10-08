/**
 * `test/__fixtures__/acceptance/export.js` and the fixture it writes (spec
 * 19.4): the committed `workspace.json` is the fixture's one layout source,
 * so a regeneration merges it rather than replacing it. A stub stands in for
 * Structurizr's tools here; the `structurizr` CI job runs the real ones.
 */

import assert from "node:assert/strict";
import {
    copyFileSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { ENTERPRISE, regenerate } from "./__fixtures__/acceptance/export.js";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/acceptance/", import.meta.url),
);
const DSL = readFileSync(join(FIXTURE, "workspace.dsl"), "utf-8");
const WORKSPACE = JSON.parse(
    readFileSync(join(FIXTURE, "workspace.json"), "utf-8"),
);

const scratch = mkdtempSync(join(tmpdir(), "renderizr-acceptance-fixture-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/**
 * A stand-in for Structurizr's tools: it records its arguments in
 * `calls.json` and writes a small workspace where `export` or `merge` would.
 */
const STUB = join(scratch, "structurizr-stub.js");
writeFileSync(
    STUB,
    `import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [command, ...rest] = process.argv.slice(2);
const option = (name) => rest[rest.indexOf("-" + name) + 1];
const workspace = {
    name: "Stub",
    model: {
        people: [{ id: "1", name: "Customer", tags: "Element,Person" }],
        softwareSystems: [{ id: "2", name: "Shop", tags: "Element,Software System,Internal" }],
    },
    views: {},
};
const calls = join(process.env.STUB_LOG, "calls.json");
let log = [];
try { log = JSON.parse(readFileSync(calls, "utf-8")); } catch {}
writeFileSync(calls, JSON.stringify([...log, [command, ...rest]]));
const output = option("output");
if (command === "export") {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "workspace.json"), JSON.stringify(workspace));
} else {
    writeFileSync(output, JSON.stringify(workspace));
}
`,
);

/** A folder holding a copy of the fixture's DSL, and its workspace if asked. */
function folder(name, { withWorkspace }) {
    const dir = join(scratch, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(FIXTURE, "workspace.dsl"), join(dir, "workspace.dsl"));
    if (withWorkspace) {
        copyFileSync(
            join(FIXTURE, "workspace.json"),
            join(dir, "workspace.json"),
        );
    }
    return dir;
}

/** Run `regenerate` on `dir` with the stub, and what the stub was asked. */
async function run(dir) {
    process.env.STUB_LOG = dir;
    await regenerate(dir, `${process.execPath} ${STUB}`);
    const calls = JSON.parse(readFileSync(join(dir, "calls.json"), "utf-8"));
    const workspace = JSON.parse(
        readFileSync(join(dir, "workspace.json"), "utf-8"),
    );
    return { calls, workspace };
}

test("a regeneration merges the committed workspace.json as the layout, from the fixture's folder", async () => {
    const dir = folder("merge", { withWorkspace: true });
    const { calls } = await run(dir);

    assert.equal(calls.length, 1);
    const [command, ...args] = calls[0];
    assert.equal(command, "merge");
    assert.equal(args[args.indexOf("-workspace") + 1], "workspace.dsl");
    assert.equal(args[args.indexOf("-layout") + 1], "workspace.json");
    assert.match(
        args[args.indexOf("-output") + 1],
        /^\.renderizr-[^/\\]+[/\\]workspace\.json$/,
        "merge writes to a temporary file inside the folder first",
    );
    assert.deepEqual(
        readdirSync(dir).filter((name) => name.startsWith(".renderizr-")),
        [],
        "the temporary folder stayed",
    );
});

test("a regeneration with no workspace.json exports the DSL", async () => {
    const dir = folder("export", { withWorkspace: false });
    const { calls } = await run(dir);

    assert.equal(calls.length, 1);
    const [command, ...args] = calls[0];
    assert.equal(command, "export");
    assert.equal(args[args.indexOf("-workspace") + 1], "workspace.dsl");
    assert.equal(args[args.indexOf("-format") + 1], "json");
    assert.match(args[args.indexOf("-output") + 1], /^\.renderizr-/);
});

test("a regeneration adds the enterprise and every location again", async () => {
    const { workspace } = await run(
        folder("locations", { withWorkspace: true }),
    );

    assert.deepEqual(workspace.model.enterprise, { name: ENTERPRISE });
    assert.equal(workspace.model.people[0].location, "External");
    assert.equal(workspace.model.softwareSystems[0].location, "Internal");
});

test("the DSL sets no coordinates and says where the layout lives", () => {
    assert.doesNotMatch(DSL, /setX|setY|setVertices|new com\.structurizr/);
    const header = DSL.slice(0, DSL.indexOf("*/"));
    assert.match(header, /layout lives in workspace\.json/);
    assert.match(header, /edit mode/);
    assert.match(header, /Containers/);
    assert.match(header, /Queue/);
});

test("the filtered view sits on the stored-layout landscape", () => {
    assert.match(
        DSL,
        /filtered "Landscape" exclude "External" "LandscapeInternal"/,
    );
    const filtered = WORKSPACE.views.filteredViews;
    assert.deepEqual(
        filtered.map((view) => [view.key, view.baseViewKey]),
        [["LandscapeInternal", "Landscape"]],
    );
    const context = WORKSPACE.views.systemContextViews.find(
        (view) => view.key === "Context",
    );
    assert.equal(context.automaticLayout.rankDirection, "LeftRight");
});

test("the committed workspace.json holds every stored-layout view's layout", () => {
    const views = Object.values(WORKSPACE.views)
        .filter(Array.isArray)
        .flat()
        .filter((view) => view.elements && !view.automaticLayout);
    const byKey = new Map(views.map((view) => [view.key, view]));
    const placed = (view) =>
        view.elements.filter((element) => element.x || element.y).length;

    assert.deepEqual([...byKey.keys()].sort(), [
        "Containers",
        "Deployment",
        "Landscape",
        "Shapes",
        "Styles",
    ]);
    assert.equal(placed(byKey.get("Landscape")), 6);
    assert.equal(placed(byKey.get("Shapes")), 19);
    assert.equal(placed(byKey.get("Styles")), 6);
    // Queue stays unplaced on purpose (spec 7.2).
    assert.equal(placed(byKey.get("Containers")), 6);
    assert.equal(byKey.get("Containers").elements.length, 7);
    // The web, API and database instances and the childless spare server.
    assert.equal(placed(byKey.get("Deployment")), 4);

    const landscape = byKey.get("Landscape");
    const bent = landscape.relationships.filter(
        (relationship) => relationship.vertices?.length,
    );
    assert.equal(bent.length, 3);
});

test("the committed workspace.json names the enterprise and every location", () => {
    assert.deepEqual(WORKSPACE.model.enterprise, { name: ENTERPRISE });
    for (const element of [
        ...WORKSPACE.model.people,
        ...WORKSPACE.model.softwareSystems,
    ]) {
        assert.ok(element.location, `${element.name} has no location`);
    }
});
