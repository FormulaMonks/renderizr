/**
 * `src/model/documentation-classes.js`: the class names the build writes
 * into rendered documentation (ADR 31), one copy the build, the page's
 * runtime and the module CSS all agree on.
 */

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { CLASSES } from "../src/model/documentation-classes.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const SRC = new URL("../src/", import.meta.url);

/** The text of every file under `src/` whose name ends in `suffix`. */
async function sources(suffix) {
    const names = await readdir(SRC, { recursive: true });
    return Promise.all(
        names
            .filter((name) => name.endsWith(suffix))
            .map(async (name) => ({
                name,
                text: await readFile(new URL(name, SRC), "utf8"),
            })),
    );
}

test("the page reads the same class names the build writes", async () => {
    const page = await importSrc("model/documentation-classes");
    assert.deepEqual(page.CLASSES, CLASSES);
});

test("the page's TypeScript spells out no class name the build writes", async () => {
    const written = new Set(Object.values(CLASSES));
    for (const { name, text } of await sources(".ts")) {
        for (const [literal] of text.matchAll(/(?<=["'`])rz-[a-z-]+(?=["'`])/g))
            assert.ok(
                !written.has(literal),
                `${name} spells out "${literal}" in place of CLASSES`,
            );
    }
});

test("every documentation class the module CSS targets is one the build writes", async () => {
    const written = new Set(Object.values(CLASSES));
    for (const { name, text } of await sources(".module.css")) {
        for (const [, targeted] of text.matchAll(/\.(rz-[a-z-]+)/g))
            assert.ok(
                written.has(targeted),
                `${name} targets .${targeted}, which the build never writes`,
            );
    }
});
