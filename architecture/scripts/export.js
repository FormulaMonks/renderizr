/**
 * Write `workspace.json` again from `workspace.dsl` beside it with
 * Structurizr's tools, the way a DSL session of edit mode writes it:
 *
 *     pnpm architecture:export
 *
 * `STRUCTURIZR_CLI` names the tools as a whole command, such as
 * `java -jar structurizr.war`; without it the script runs `structurizr-cli`
 * from the PATH.
 *
 * One run of edit mode's DSL pipeline does the work (ADR 16): `merge` with
 * the committed `workspace.json` as the layout, then the writer, which
 * leaves the file byte for byte when nothing but its stamps would change.
 * So `git diff` after an export shows whether the committed workspace
 * matches its DSL, and the `structurizr` CI job fails when it doesn't.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { version } from "../../scripts/config.js";
import { DslPipeline } from "../../scripts/dsl-pipeline.js";
import { toolsCommand } from "../../scripts/structurizr-tools.js";
import { WorkspaceWriter } from "../../scripts/workspace-writer.js";

/**
 * Write `folder`'s `workspace.json` again from its `workspace.dsl` with
 * `command`, the Structurizr tools as a whole command, copying their output
 * to `output`. Rejects with the tools' error when the DSL doesn't parse,
 * and leaves `workspace.json` as it was.
 */
export async function exportWorkspace(
    folder,
    command,
    { output = process.stdout } = {},
) {
    const json = join(folder, "workspace.json");
    const pipeline = new DslPipeline({
        dsl: join(folder, "workspace.dsl"),
        json,
        command,
        // Edit mode names itself the same way, as Structurizr Local does
        // (spec 7.1).
        writer: new WorkspaceWriter(json, {
            agent: `renderizr/${version ?? "unknown"}`,
        }),
        output,
    });
    try {
        if (!(await pipeline.run())) throw new Error(pipeline.error);
    } finally {
        await pipeline.close();
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await exportWorkspace(
        dirname(dirname(fileURLToPath(import.meta.url))),
        toolsCommand(),
    );
}
