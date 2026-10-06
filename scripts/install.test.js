/**
 * What `npx github:FormulaMonks/renderizr` costs on a cold cache.
 *
 * npm installs a git dependency by cloning it with `--recurse-submodules`, and
 * prepares it with a full `npm install --include dev` when its package.json
 * has any of a handful of scripts. Both multiply the time a user waits before
 * the CLI prints anything, so these pin the repository to the cheap path.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { REPO_ROOT } from "./__fixtures__/helpers.js";

// The scripts that make npm (pacote) prepare a git dependency.
const PREPARE_TRIGGERS = [
    "build",
    "install",
    "postinstall",
    "preinstall",
    "prepack",
    "prepare",
];

const manifest = JSON.parse(
    readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
);

test("package.json has no script that makes npm prepare the git dependency", () => {
    const triggers = PREPARE_TRIGGERS.filter(
        (name) => name in (manifest.scripts ?? {}),
    );

    assert.deepEqual(triggers, []);
    assert.equal(manifest.workspaces, undefined);
});

test("every submodule stays out of a recursive clone", () => {
    const names = execFileSync(
        "git",
        [
            "config",
            "--file",
            ".gitmodules",
            "--get-regexp",
            String.raw`^submodule\..*\.path$`,
        ],
        { cwd: REPO_ROOT, encoding: "utf8" },
    )
        .trim()
        .split("\n")
        .map((line) =>
            line.split(" ")[0].slice("submodule.".length, -".path".length),
        );

    assert.ok(names.length > 0, ".gitmodules lists no submodule");
    for (const name of names) {
        const update = execFileSync(
            "git",
            [
                "config",
                "--file",
                ".gitmodules",
                "--default",
                "",
                "--get",
                `submodule.${name}.update`,
            ],
            { cwd: REPO_ROOT, encoding: "utf8" },
        ).trim();

        assert.equal(update, "none", `${name} is cloned by npx`);
    }
});
