/**
 * A stand-in for Structurizr's tools, so the DSL pipeline's tests run without
 * Java. Tests point the pipeline at it as a whole command:
 *
 *     node scripts/__fixtures__/structurizr-stub.js
 *
 * Its "DSL" is a workspace in JSON, with an optional `stub` key that steers
 * it: `sleep` (ms to take) and `fail` (the parser error to report). `export`
 * writes the workspace into the `-output` folder; `merge` writes it to the
 * `-output` file with each element's `x` and `y` taken from the `-layout`
 * workspace, by view key and element id. Every run appends
 * `{ command, args, cwd, at, done }` lines to `.stub-calls` beside the DSL,
 * so a test can tell what ran, and when.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const [command, ...args] = process.argv.slice(2);
const option = (name) => {
    const at = args.indexOf(`-${name}`);
    return at === -1 ? undefined : args[at + 1];
};

if (command === "version") {
    process.stdout.write("structurizr: stub\n");
    process.exit(0);
}

const dsl = resolve(option("workspace"));
const calls = join(dirname(dsl), ".stub-calls");
const log = (entry) =>
    appendFileSync(
        calls,
        `${JSON.stringify({ command, args, cwd: process.cwd(), ...entry })}\n`,
    );
log({ at: Date.now() });

const { stub = {}, ...workspace } = JSON.parse(readFileSync(dsl, "utf8"));
if (stub.sleep) await new Promise((done) => setTimeout(done, stub.sleep));

process.stdout.write(`INFO -- loading workspace from ${basename(dsl)}\n`);
if (stub.fail) {
    process.stderr.write(
        `com.structurizr.dsl.StructurizrDslParserException: ${stub.fail}\n\tat com.structurizr.dsl.StructurizrDslParser.parse(StructurizrDslParser.java:1369)\n`,
    );
    log({ done: Date.now(), code: 1 });
    process.exit(1);
}

if (command === "merge") {
    const layout = JSON.parse(readFileSync(resolve(option("layout")), "utf8"));
    for (const [collection, views] of Object.entries(workspace.views ?? {})) {
        if (!Array.isArray(views)) continue;
        for (const view of views) {
            const before = layout.views?.[collection]?.find(
                (other) => other.key === view.key,
            );
            for (const element of view.elements ?? []) {
                const at = before?.elements?.find((e) => e.id === element.id);
                if (at?.x !== undefined) element.x = at.x;
                if (at?.y !== undefined) element.y = at.y;
            }
        }
    }
    writeFileSync(resolve(option("output")), JSON.stringify(workspace));
} else if (command === "export") {
    const name = `${basename(dsl).replace(/\.dsl$/, "")}.json`;
    writeFileSync(
        join(resolve(option("output")), name),
        JSON.stringify(workspace),
    );
} else {
    process.stderr.write(`The stub doesn't know ${command}.\n`);
    process.exit(2);
}
log({ done: Date.now(), code: 0 });
