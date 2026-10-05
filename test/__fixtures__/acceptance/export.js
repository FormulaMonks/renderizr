/**
 * Regenerate `workspace.json` from `workspace.dsl` beside it, with the
 * Structurizr CLI (`structurizr-cli` on the PATH, or `STRUCTURIZR_CLI`),
 * then format it with Biome:
 *
 *     pnpm fixtures:acceptance
 *
 * structurizr-java 5 dropped the enterprise and element locations, which
 * the enterprise boundary of older workspaces still relies on (spec 8). The
 * DSL tags the enterprise's elements "Internal"; this script gives each of
 * them `location: Internal` and names the enterprise, as an export from an
 * older Structurizr would.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    peopleAndSoftwareSystems,
    writeFixture,
} from "../../support/fixtures.js";

/** The folder of `workspace.dsl` and the `workspace.json` it exports to. */
const HERE = dirname(fileURLToPath(import.meta.url));
/** The enterprise the DSL's "Internal" elements belong to (spec 8). */
const ENTERPRISE = "Shop Ltd";

const out = mkdtempSync(join(tmpdir(), "renderizr-acceptance-export-"));
try {
    execFileSync(
        process.env.STRUCTURIZR_CLI ?? "structurizr-cli",
        ["export", "-w", join(HERE, "workspace.dsl"), "-f", "json", "-o", out],
        { stdio: "inherit" },
    );
    const workspace = JSON.parse(
        readFileSync(join(out, "workspace.json"), "utf-8"),
    );

    workspace.model.enterprise = { name: ENTERPRISE };
    for (const element of peopleAndSoftwareSystems(workspace)) {
        const tags = element.tags.split(",").map((tag) => tag.trim());
        element.location = tags.includes("Internal") ? "Internal" : "External";
    }

    writeFixture(join(HERE, "workspace.json"), workspace);
} finally {
    rmSync(out, { recursive: true, force: true });
}
