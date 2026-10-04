/**
 * Regenerate `workspace.json` from `workspace.dsl` beside it, with the
 * Structurizr CLI (`structurizr-cli` on the PATH, or `STRUCTURIZR_CLI`):
 *
 *     node test/__fixtures__/acceptance/export.js && pnpm format
 *
 * structurizr-java 5 dropped the enterprise and element locations, which
 * the enterprise boundary of older workspaces still relies on (spec 8). The
 * DSL tags the enterprise's elements "Internal"; this script gives each of
 * them `location: Internal` and names the enterprise, as an export from an
 * older Structurizr would.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
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
    for (const element of [
        ...(workspace.model.people ?? []),
        ...(workspace.model.softwareSystems ?? []),
    ]) {
        const tags = element.tags.split(",").map((tag) => tag.trim());
        element.location = tags.includes("Internal") ? "Internal" : "External";
    }

    writeFileSync(
        join(HERE, "workspace.json"),
        `${JSON.stringify(workspace, null, 4)}\n`,
    );
} finally {
    rmSync(out, { recursive: true, force: true });
}
