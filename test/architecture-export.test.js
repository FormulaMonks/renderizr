/**
 * `architecture/scripts/export.js`: it writes `workspace.json` again from
 * `workspace.dsl` the way edit mode's DSL pipeline does, so a committed
 * workspace that matches its DSL stays byte for byte, and a DSL error fails
 * the export. The DSL pipeline's stub stands in for Structurizr's tools
 * here; the `structurizr` CI job runs the real ones on `architecture/`.
 */

import assert from "node:assert/strict";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { exportWorkspace } from "../architecture/scripts/export.js";
import { shellCommand } from "../scripts/structurizr-tools.js";

const STUB = shellCommand(process.execPath, [
    fileURLToPath(
        new URL("../scripts/__fixtures__/structurizr-stub.js", import.meta.url),
    ),
]);

const scratch = mkdtempSync(join(tmpdir(), "renderizr-architecture-export-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** The stub's "DSL": a workspace in JSON, with an optional `stub` key. */
const dsl = (description, stub) =>
    JSON.stringify({
        name: "Renderizr",
        description,
        model: { softwareSystems: [{ id: "1", name: "Renderizr" }] },
        views: {
            systemContextViews: [
                {
                    key: "Context",
                    softwareSystemId: "1",
                    elements: [{ id: "1", x: 100, y: 200 }],
                },
            ],
        },
        ...(stub ? { stub } : {}),
    });

/** A folder holding `workspace.dsl`, exported once to `workspace.json`. */
async function exported(name) {
    const folder = join(scratch, name);
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder);
    writeFileSync(join(folder, "workspace.dsl"), dsl("Before"));
    await exportWorkspace(folder, STUB, { output: { write() {} } });
    return folder;
}

const read = (folder) => readFileSync(join(folder, "workspace.json"), "utf8");

test("an export of a workspace that matches its DSL leaves workspace.json byte for byte", async () => {
    const folder = await exported("unchanged");
    const before = read(folder);

    await exportWorkspace(folder, STUB, { output: { write() {} } });

    assert.equal(read(folder), before);
});

test("an export after a DSL change writes the change into workspace.json", async () => {
    const folder = await exported("changed");
    writeFileSync(join(folder, "workspace.dsl"), dsl("After"));

    await exportWorkspace(folder, STUB, { output: { write() {} } });

    assert.equal(JSON.parse(read(folder)).description, "After");
});

test("an export fails on a DSL error and leaves workspace.json as it was", async () => {
    const folder = await exported("broken");
    const before = read(folder);
    writeFileSync(
        join(folder, "workspace.dsl"),
        dsl("After", { fail: "Unexpected tokens at line 3" }),
    );

    await assert.rejects(
        exportWorkspace(folder, STUB, { output: { write() {} } }),
        /Unexpected tokens at line 3/,
    );
    assert.equal(read(folder), before);
});
