/**
 * `architecture/decisions/`: ADR numbers run 1, 2, 3, … with no number taken
 * twice and none skipped, and each file's heading carries its file's number.
 * Two pull requests that each add the next ADR both pass on their own; once
 * the second merges, `main` holds two ADRs with one number and this test
 * fails on the push to `main`.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const DECISIONS = fileURLToPath(
    new URL("../architecture/decisions/", import.meta.url),
);

/** Every ADR file, with the number its name and its heading give it. */
const adrs = readdirSync(DECISIONS)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
        const heading = readFileSync(join(DECISIONS, name), "utf8").split(
            "\n",
            1,
        )[0];
        return {
            name,
            fileNumber: Number(/^(\d{4})-/.exec(name)?.[1] ?? Number.NaN),
            headingNumber: Number(
                /^# (\d+)\. /.exec(heading)?.[1] ?? Number.NaN,
            ),
        };
    });

test("every ADR file name starts with a four-digit number", () => {
    const unnumbered = adrs.filter((adr) => Number.isNaN(adr.fileNumber));
    assert.deepEqual(
        unnumbered.map((adr) => adr.name),
        [],
        "name each ADR NNNN-title.md",
    );
});

test("no two ADRs share a number", () => {
    const byNumber = Map.groupBy(adrs, (adr) => adr.fileNumber);
    const collisions = [...byNumber.values()]
        .filter((group) => group.length > 1)
        .map((group) => group.map((adr) => adr.name));
    assert.deepEqual(
        collisions,
        [],
        "renumber the ADR that merged last to the next free number",
    );
});

test("ADR numbers run from 1 with no gaps", () => {
    const numbers = [...new Set(adrs.map((adr) => adr.fileNumber))];
    assert.deepEqual(
        numbers,
        numbers.map((_, index) => index + 1),
    );
});

test("each ADR's heading carries its file's number", () => {
    const mismatched = adrs
        .filter((adr) => adr.headingNumber !== adr.fileNumber)
        .map((adr) => adr.name);
    assert.deepEqual(
        mismatched,
        [],
        "start each ADR with `# <n>. <Title>`, where <n> is the file's number",
    );
});
