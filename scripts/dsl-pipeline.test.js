import assert from "node:assert/strict";
import { readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
import { DslPipeline, errorMessage } from "./dsl-pipeline.js";
import { checkTools, shellCommand, toolsCommand } from "./structurizr-tools.js";
import { WorkspaceWriter } from "./workspace-writer.js";
import { fileState, fixture, withTempDir } from "./__fixtures__/helpers.js";

/**
 * The DSL pipeline (spec 5, ADR 16) against a stub of Structurizr's tools,
 * so these run without Java. `test/structurizr-pipeline.test.js` runs the
 * same steps against the real tools in CI.
 */

/** The stub as a whole command, the way `STRUCTURIZR_CLI` names the tools. */
const STUB = shellCommand(process.execPath, [fixture("structurizr-stub.js")]);

/** A view with one element, as the stub's "DSL" holds it. */
const dslWorkspace = (name, stub) => ({
    name,
    model: {
        softwareSystems: [{ id: "1", name: "Shop", tags: "Element" }],
    },
    views: {
        systemLandscapeViews: [
            { key: "Landscape", elements: [{ id: "1", x: 0, y: 0 }] },
        ],
    },
    ...(stub ? { stub } : {}),
});

const writeDsl = (dir, name, stub) =>
    writeFile(
        join(dir, "workspace.dsl"),
        JSON.stringify(dslWorkspace(name, stub)),
    );

/** Each run of the stub, as `.stub-calls` beside the DSL records it. */
async function calls(dir) {
    const text = await readFile(join(dir, ".stub-calls"), "utf8").catch(
        () => "",
    );
    const lines = text.trim().split("\n").filter(Boolean).map(JSON.parse);
    return lines.filter((line) => line.at !== undefined);
}

/** A stream that keeps what is written to it, for the tool's output. */
function sink() {
    const chunks = [];
    const stream = new Writable({
        write(chunk, _encoding, done) {
            chunks.push(chunk.toString());
            done();
        },
    });
    stream.text = () => chunks.join("");
    return stream;
}

/**
 * A pipeline on `dir`'s `workspace.dsl` with the stub, a writer and hooks
 * that record what reached the page, in order.
 */
function pipelineIn(dir, options = {}) {
    const json = join(dir, "workspace.json");
    const events = [];
    const output = sink();
    const pipeline = new DslPipeline({
        dsl: join(dir, "workspace.dsl"),
        json,
        command: STUB,
        writer: new WorkspaceWriter(json, { agent: "renderizr/test" }),
        output,
        debounce: 50,
        ...options,
    });
    pipeline.connect({
        flush: async () => {
            events.push({ event: "flush", runs: (await calls(dir)).length });
        },
        published: () => events.push({ event: "workspace" }),
        failed: (error) => events.push({ event: "error", error }),
    });
    return { pipeline, events, output, json };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Wait until `check()` holds, for up to 5 s. */
async function eventually(check, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await check()) return;
        await wait(50);
    }
    assert.fail(message);
}

/* ------------------------------------------------------------------ tools */

test("the tools are STRUCTURIZR_CLI as a whole command, otherwise structurizr-cli", () => {
    assert.equal(
        toolsCommand({ STRUCTURIZR_CLI: "java -jar ~/bin/structurizr.war" }),
        "java -jar ~/bin/structurizr.war",
    );
    assert.equal(toolsCommand({ STRUCTURIZR_CLI: "  " }), "structurizr-cli");
    assert.equal(toolsCommand({}), "structurizr-cli");
});

test("the version check passes with tools that answer and fails with tools that don't", () => {
    assert.equal(checkTools(STUB).ok, true);
    const missing = checkTools("renderizr-no-such-structurizr-cli");
    assert.equal(missing.ok, false);
    assert.equal(typeof missing.output, "string");
});

test("a tool's error reads without its log lines and stack frames", () => {
    const output = [
        "13:48:39.318 [main] INFO com.structurizr.command.MergeCommand -- Merging layout",
        "13:48:39.320 [main] INFO com.structurizr.command.MergeCommand --  - loading workspace from broken.dsl",
        "com.structurizr.dsl.StructurizrDslParserException: Unexpected tokens at line 294 of /work/broken.dsl: oops",
        "\tat com.structurizr.dsl.StructurizrDslParser.parse(StructurizrDslParser.java:1369)",
        "\tat java.base/java.lang.reflect.Method.invoke(Method.java:580)",
        "\t... 3 more",
    ].join("\n");
    assert.equal(
        errorMessage(output, 1),
        "Unexpected tokens at line 294 of /work/broken.dsl: oops",
    );
    assert.match(errorMessage("", 3), /exited with code 3/);
});

/* -------------------------------------------------------------------- runs */

test("the first run exports to a temporary folder and writes workspace.json through the writer", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "First");
        const { pipeline, events, output, json } = pipelineIn(dir);
        assert.equal(await pipeline.run(), true);

        const [call] = await calls(dir);
        assert.equal(call.command, "export");
        assert.equal(
            call.cwd,
            await realpath(dir),
            "the tools run in the DSL's folder",
        );
        const out = call.args[call.args.indexOf("-output") + 1];
        assert.ok(
            out.startsWith("."),
            `the export went to ${out}, not a temporary folder`,
        );

        const text = await readFile(json, "utf8");
        assert.ok(text.startsWith('{\n  "'), "not in Jackson's format");
        assert.equal(JSON.parse(text).name, "First");
        assert.match(JSON.parse(text).lastModifiedAgent, /^renderizr\//);
        assert.deepEqual(
            (await readdir(dir)).sort(),
            [".stub-calls", "workspace.dsl", "workspace.json"],
            "the run left files beside the DSL",
        );
        assert.match(output.text(), /loading workspace/, "no tool output");
        assert.deepEqual(
            events.map(({ event }) => event),
            ["flush", "workspace"],
        );
        assert.equal(pipeline.succeeded, true);
        assert.equal(pipeline.error, null);
    });
});

test("a run with workspace.json merges with it as the layout and writes only on a change", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "Merged");
        const { pipeline, events, json } = pipelineIn(dir);
        await pipeline.run();

        // The author moves Shop, as a save would.
        const writer = new WorkspaceWriter(json, { agent: "renderizr/test" });
        const { versionOf } = await import("./workspace-writer.js");
        await writer.save({
            version: versionOf(await readFile(json, "utf8")),
            view: "Landscape",
            views: { Landscape: { elements: { 1: { x: 300, y: 200 } } } },
        });
        const saved = await fileState(json);

        await wait(20);
        assert.equal(await pipeline.run(), true);
        const merge = (await calls(dir))[1];
        assert.equal(merge.command, "merge");
        assert.equal(
            merge.args[merge.args.indexOf("-layout") + 1],
            "workspace.json",
        );
        assert.ok(
            merge.args[merge.args.indexOf("-output") + 1].startsWith("."),
        );
        assert.deepEqual(
            await fileState(json),
            saved,
            "a merge that changed nothing rewrote workspace.json",
        );
        assert.equal(
            events.filter(({ event }) => event === "workspace").length,
            2,
            "every good run reaches the page",
        );

        // A DSL change merges, keeping the layout.
        await writeDsl(dir, "Renamed");
        await pipeline.run();
        const merged = JSON.parse(await readFile(json, "utf8"));
        assert.equal(merged.name, "Renamed");
        assert.deepEqual(merged.views.systemLandscapeViews[0].elements[0], {
            id: "1",
            x: 300,
            y: 200,
        });
    });
});

test("changes run the pipeline once, about the debounce after the last one", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "Debounced");
        const { pipeline } = pipelineIn(dir, { debounce: 150 });
        for (let change = 0; change < 5; change++) {
            pipeline.changed();
            await wait(30);
        }
        assert.equal((await calls(dir)).length, 0, "ran before the debounce");
        await eventually(
            async () => (await calls(dir)).length === 1,
            "the changes never ran the pipeline",
        );
        await wait(400);
        assert.equal((await calls(dir)).length, 1, "ran more than once");
        await pipeline.close();
    });
});

test("runs go one at a time, and changes during a run get one more run after it", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "Slow", { sleep: 400 });
        const { pipeline, events } = pipelineIn(dir, { debounce: 20 });
        const first = pipeline.run();
        await eventually(
            async () => (await calls(dir)).length === 1,
            "the run never started",
        );
        // Three changes while the tools run, each past the debounce.
        for (let change = 0; change < 3; change++) {
            pipeline.changed();
            await wait(60);
        }
        await first;
        await eventually(
            async () =>
                events.filter(({ event }) => event === "workspace").length ===
                2,
            "no run followed the changes",
        );
        await wait(300);

        const runs = await readFile(join(dir, ".stub-calls"), "utf8").then(
            (text) => text.trim().split("\n").map(JSON.parse),
        );
        assert.equal(runs.filter((line) => line.at).length, 2);
        // Started, done, started, done: never two at once.
        assert.deepEqual(
            runs.map((line) => (line.at ? "start" : "done")),
            ["start", "done", "start", "done"],
        );
        await pipeline.close();
    });
});

test("each run flushes the pages before it runs the tools", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "Flushed");
        const { pipeline, events } = pipelineIn(dir);
        await pipeline.run();
        pipeline.changed();
        await eventually(
            () => events.filter(({ event }) => event === "flush").length === 2,
            "the second run never flushed",
        );
        await pipeline.close();
        const flushes = events.filter(({ event }) => event === "flush");
        assert.deepEqual(
            flushes.map(({ runs }) => runs),
            [0, 1],
            "a flush came after its run",
        );
    });
});

test("an error reaches the page, keeps workspace.json and clears on the next good run", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "Good");
        const { pipeline, events, output, json } = pipelineIn(dir);
        await pipeline.run();
        const good = await readFile(json, "utf8");

        await writeDsl(dir, "Broken", { fail: "Unexpected tokens at line 3" });
        assert.equal(await pipeline.run(), false);
        assert.equal(await readFile(json, "utf8"), good);
        assert.deepEqual(events.at(-1), {
            event: "error",
            error: "Unexpected tokens at line 3",
        });
        assert.equal(pipeline.error, "Unexpected tokens at line 3");
        assert.equal(pipeline.succeeded, true, "an earlier run succeeded");
        assert.match(output.text(), /StructurizrDslParserException/);
        assert.deepEqual(
            (await readdir(dir)).filter((name) =>
                name.startsWith(".renderizr"),
            ),
            [],
            "a failed run left its temporary folder",
        );

        await writeDsl(dir, "Fixed");
        assert.equal(await pipeline.run(), true);
        assert.equal(pipeline.error, null);
        assert.equal(events.at(-1).event, "workspace");
        assert.equal(JSON.parse(await readFile(json, "utf8")).name, "Fixed");
    });
});

test("a first run that fails writes nothing and leaves the pipeline without a success", async () => {
    await withTempDir(async (dir) => {
        await writeDsl(dir, "Broken", { fail: "No workspace" });
        const { pipeline, json } = pipelineIn(dir);
        assert.equal(await pipeline.run(), false);
        assert.equal(pipeline.succeeded, false);
        assert.equal(pipeline.error, "No workspace");
        await assert.rejects(stat(json), { code: "ENOENT" });
    });
});
