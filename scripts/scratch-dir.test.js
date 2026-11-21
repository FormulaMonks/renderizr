import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { test } from "node:test";
import { scratchDir } from "./scratch-dir.js";

test("a scratch folder exists while the process runs and is gone once it exits", () => {
    const module = new URL("./scratch-dir.js", import.meta.url).href;
    const dir = execFileSync(
        process.execPath,
        [
            "--input-type=module",
            "-e",
            `import { existsSync } from "node:fs";
import { scratchDir } from ${JSON.stringify(module)};
const dir = scratchDir("renderizr-scratch-test-");
if (!existsSync(dir)) throw new Error("the folder was not made");
process.stdout.write(dir);`,
        ],
        { encoding: "utf8" },
    );
    assert.match(basename(dir), /^renderizr-scratch-test-/);
    assert.equal(existsSync(dir), false, `${dir} outlived its process`);
});

test("each scratch folder is a new one", () => {
    assert.notEqual(scratchDir("renderizr-a-"), scratchDir("renderizr-a-"));
});
