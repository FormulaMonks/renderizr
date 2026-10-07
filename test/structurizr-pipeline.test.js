/**
 * The DSL pipeline against Structurizr's real tools (spec 19.3): a first
 * `export`, a layout save, a DSL change, and a `merge` that keeps the layout,
 * with `validate` run on every `workspace.json` the writer produced, so
 * Structurizr reads what edit mode writes.
 *
 * It needs Java and the tools, so it runs only with `STRUCTURIZR_CLI` set,
 * as the `structurizr` CI job sets it:
 *
 *     STRUCTURIZR_CLI="java -jar structurizr.war" pnpm test:structurizr
 *
 * `scripts/dsl-pipeline.test.js` covers the pipeline's timing with a stub.
 */

import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DslPipeline } from "../scripts/dsl-pipeline.js";
import { runTools } from "../scripts/structurizr-tools.js";
import { versionOf, WorkspaceWriter } from "../scripts/workspace-writer.js";

const COMMAND = process.env.STRUCTURIZR_CLI?.trim();
const DSL = fileURLToPath(
    new URL("./__fixtures__/acceptance/workspace.dsl", import.meta.url),
);

/** Where the moved element goes, far from anything the DSL places. */
const MOVED = { x: 4321, y: 1234 };

/** The tools' output, kept for a failure's message. */
function sink() {
    let text = "";
    const stream = new Writable({
        write(chunk, _encoding, done) {
            text += chunk;
            done();
        },
    });
    stream.text = () => text;
    return stream;
}

/** Fail unless Structurizr's `validate` reads `json`. */
async function validate(dir, json, step) {
    const output = sink();
    const { code } = await runTools(COMMAND, ["validate", "-workspace", json], {
        cwd: dir,
        output,
    });
    assert.equal(
        code,
        0,
        `validate rejected workspace.json after ${step}:\n${output.text()}`,
    );
}

/** The first stored-layout view that holds the person named `name`. */
function viewHolding(workspace, name) {
    const person = workspace.model.people.find((p) => p.name === name);
    for (const views of Object.values(workspace.views)) {
        if (!Array.isArray(views)) continue;
        for (const view of views) {
            if (view.automaticLayout) continue;
            const element = view.elements?.find((e) => e.id === person.id);
            if (element) return { view, element };
        }
    }
    assert.fail(`no stored-layout view holds ${name}`);
}

test(
    "a DSL session exports, saves, merges a DSL change and keeps the layout, with every workspace.json valid",
    { skip: !COMMAND && "STRUCTURIZR_CLI is not set", timeout: 180_000 },
    async () => {
        const dir = await mkdtemp(join(tmpdir(), "renderizr-structurizr-"));
        try {
            const dsl = join(dir, "workspace.dsl");
            const json = join(dir, "workspace.json");
            await copyFile(DSL, dsl);
            const writer = new WorkspaceWriter(json, {
                agent: "renderizr/test",
            });
            const output = sink();
            const pipeline = new DslPipeline({
                dsl,
                json,
                command: COMMAND,
                writer,
                output,
            });

            // The first run exports: there is no workspace.json yet.
            assert.equal(await pipeline.run(), true, output.text());
            await validate(dir, "workspace.json", "the first export");
            const exported = JSON.parse(await readFile(json, "utf8"));
            const { view } = viewHolding(exported, "Customer");

            // The author moves Customer, as the page saves it.
            const person = exported.model.people.find(
                (p) => p.name === "Customer",
            );
            await writer.save({
                version: versionOf(await readFile(json, "utf8")),
                view: view.key,
                views: { [view.key]: { elements: { [person.id]: MOVED } } },
            });
            await validate(dir, "workspace.json", "a layout save");

            // The DSL changes, and the next run merges.
            const text = await readFile(dsl, "utf8");
            const changed = text.replace(
                '"Buys things online"',
                '"Buys things online, now and then"',
            );
            assert.notEqual(changed, text, "the DSL change didn't apply");
            await writeFile(dsl, changed);
            assert.equal(await pipeline.run(), true, output.text());
            await validate(dir, "workspace.json", "a merge");

            const merged = JSON.parse(await readFile(json, "utf8"));
            const customer = merged.model.people.find(
                (p) => p.name === "Customer",
            );
            assert.equal(
                customer.description,
                "Buys things online, now and then",
            );
            const { element } = viewHolding(merged, "Customer");
            assert.deepEqual(
                { x: element.x, y: element.y },
                MOVED,
                "the merge lost the saved layout",
            );
            assert.match(output.text(), /merg/i, "the second run didn't merge");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    },
);
