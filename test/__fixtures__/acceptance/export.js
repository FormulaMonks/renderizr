/**
 * Regenerate `workspace.json` from `workspace.dsl` beside it with
 * Structurizr's tools, then format it with Biome:
 *
 *     pnpm fixtures:acceptance
 *
 * `STRUCTURIZR_CLI` names the tools as a whole command, such as
 * `java -jar structurizr.war`; without it the script runs `structurizr-cli`
 * from the PATH.
 *
 * The committed `workspace.json` is the fixture's one layout source (spec
 * 19.4). The script runs `merge` with it as the layout, so the DSL's model
 * and views come back with the layout kept, or `export` when there is no
 * `workspace.json` yet.
 *
 * structurizr-java 5 dropped the enterprise and element locations, which
 * the enterprise boundary of older workspaces still relies on (spec 8), and
 * the merge drops what the DSL can't say. The DSL tags the enterprise's
 * elements "Internal"; the script gives each of them `location: Internal`
 * and names the enterprise again, as an export from an older Structurizr
 * would.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    peopleAndSoftwareSystems,
    writeFixture,
} from "../../support/fixtures.js";

/** The enterprise the DSL's "Internal" elements belong to (spec 8). */
export const ENTERPRISE = "Shop Ltd";

/**
 * Write `folder`'s `workspace.json` again from its `workspace.dsl` with
 * `command`, the Structurizr tools as a whole command split on spaces.
 */
export function regenerate(folder, command) {
    const [program, ...prefix] = command.trim().split(/\s+/);
    const dsl = join(folder, "workspace.dsl");
    const layout = join(folder, "workspace.json");
    const out = mkdtempSync(join(tmpdir(), "renderizr-acceptance-export-"));
    try {
        const result = join(out, "workspace.json");
        const args = existsSync(layout)
            ? ["merge", "-workspace", dsl, "-layout", layout, "-output", result]
            : ["export", "-workspace", dsl, "-format", "json", "-output", out];
        execFileSync(program, [...prefix, ...args], { stdio: "inherit" });

        const workspace = JSON.parse(readFileSync(result, "utf-8"));
        workspace.model.enterprise = { name: ENTERPRISE };
        for (const element of peopleAndSoftwareSystems(workspace)) {
            const tags = element.tags.split(",").map((tag) => tag.trim());
            element.location = tags.includes("Internal")
                ? "Internal"
                : "External";
        }

        writeFixture(layout, workspace);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    regenerate(
        dirname(fileURLToPath(import.meta.url)),
        process.env.STRUCTURIZR_CLI || "structurizr-cli",
    );
}
