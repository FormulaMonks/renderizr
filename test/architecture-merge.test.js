/**
 * `architecture/scripts/merge.js`: it writes `workspace.json` again from
 * `workspace.dsl` the way edit mode's DSL pipeline does, so a committed
 * workspace that matches its DSL stays byte for byte, and a DSL error fails
 * the merge. The DSL pipeline's stub stands in for Structurizr's tools
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
import { mergeWorkspace } from "../architecture/scripts/merge.js";
import { shellCommand } from "../scripts/structurizr-tools.js";

/** The DSL pipeline's stand-in for Structurizr's tools, as a whole command. */
const STUB = shellCommand(process.execPath, [
    fileURLToPath(
        new URL("../scripts/__fixtures__/structurizr-stub.js", import.meta.url),
    ),
]);

const scratch = mkdtempSync(join(tmpdir(), "renderizr-architecture-merge-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Options that keep the tools' output out of the test report. */
const QUIET = { output: { write() {} } };

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
    await mergeWorkspace(folder, STUB, QUIET);
    return folder;
}

const read = (folder) => readFileSync(join(folder, "workspace.json"), "utf8");

test("a merge of a workspace that matches its DSL leaves workspace.json byte for byte", async () => {
    const folder = await exported("unchanged");
    const before = read(folder);

    await mergeWorkspace(folder, STUB, QUIET);

    assert.equal(
        read(folder),
        before,
        "a merge with nothing to change rewrote workspace.json",
    );
});

test("a merge after a DSL change writes the change into workspace.json", async () => {
    const folder = await exported("changed");
    writeFileSync(join(folder, "workspace.dsl"), dsl("After"));

    await mergeWorkspace(folder, STUB, QUIET);

    assert.equal(
        JSON.parse(read(folder)).description,
        "After",
        "the DSL's change didn't reach workspace.json",
    );
});

test("a merge fails on a DSL error and leaves workspace.json as it was", async () => {
    const folder = await exported("broken");
    const before = read(folder);
    writeFileSync(
        join(folder, "workspace.dsl"),
        dsl("After", { fail: "Unexpected tokens at line 3" }),
    );

    await assert.rejects(
        mergeWorkspace(folder, STUB, QUIET),
        /Unexpected tokens at line 3/,
        "the merge didn't fail with the tools' error",
    );
    assert.equal(read(folder), before, "a failed merge changed workspace.json");
});
