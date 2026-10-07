import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import { loadWorkspace } from "./assets.js";
import { createConfig, version } from "./config.js";
import { DslPipeline } from "./dsl-pipeline.js";
import { editMode } from "./edit-plugin.js";
import {
    checkTools as runVersion,
    TOOLS_README,
    toolsCommand,
    toolsMessage,
} from "./structurizr-tools.js";
import { WorkspaceWriter } from "./workspace-writer.js";

/**
 * `renderizr edit` (spec 4, ADR 15): which workspace a path opens, what the
 * terminal says about it, and the local Vite server that serves the site in
 * edit mode. `scripts/cli.js` parses the arguments and `scripts/build.js`
 * dispatches to it; `scripts/edit-plugin.js` is the server's own plugin.
 */

/** The port edit mode listens on unless `--port` names another (spec 4.5). */
export const DEFAULT_PORT = 5173;

/** The only names edit mode looks for in a folder (spec 4.2). */
const DSL_NAME = "workspace.dsl";
const JSON_NAME = "workspace.json";

const isFile = (path) => statSync(path, { throwIfNoEntry: false })?.isFile();

/**
 * Why edit mode stops before its server starts: a DSL whose tools don't
 * answer and no `workspace.json` to fall back to (spec 5.1). The message
 * stands on its own, with no usage after it.
 */
export class ToolsError extends Error {
    constructor(dsl, command) {
        super(toolsMessage(dsl, command));
        this.name = "ToolsError";
    }
}

/**
 * The session for `dsl` (spec 4.2): a DSL session when the tools answer the
 * version check, otherwise a JSON session on the `workspace.json` beside it,
 * flagged as a fallback, or a `ToolsError` when there is none.
 */
function dslSession(dsl, { env, checkTools }) {
    const folder = dirname(dsl);
    const json = join(folder, JSON_NAME);
    const command = toolsCommand(env);
    if (checkTools(command, { cwd: folder }).ok)
        return { kind: "dsl", dsl, json, command };
    if (!isFile(json)) throw new ToolsError(dsl, command);
    return { kind: "json", json, dsl, fallback: true, command };
}

/**
 * The session `path` opens (spec 4.2), one of
 *
 * - `{ kind: "dsl", dsl, json, command }`: Structurizr's tools, run with
 *   `command`, turn `dsl` into `json` beside it, which edit mode serves and
 *   saves.
 * - `{ kind: "json", json, dsl }`: edit mode serves and saves `json`; `dsl`
 *   is the `workspace.dsl` beside it, or `null`. A DSL whose tools didn't
 *   answer opens this way too, with `fallback: true` and the `command` that
 *   didn't answer.
 *
 * `path` is a `workspace.json` of any name, a `workspace.dsl` of any name or
 * a folder, the current folder when left out. In a folder, edit mode looks
 * for the exact names `workspace.dsl` and `workspace.json` and never in
 * subfolders. Only a DSL reads `STRUCTURIZR_CLI` from `env` and runs
 * `checkTools`.
 *
 * Throws an error naming the path when it opens nothing, and a `ToolsError`
 * for a DSL without tools or a `workspace.json`.
 */
export function resolveSession(
    path = ".",
    { cwd = process.cwd(), env = process.env, checkTools = runVersion } = {},
) {
    const target = resolve(cwd, path);
    const stat = statSync(target, { throwIfNoEntry: false });
    if (!stat) throw new Error(`${path} doesn't exist.`);

    if (stat.isDirectory()) {
        const json = join(target, JSON_NAME);
        const dsl = join(target, DSL_NAME);
        if (isFile(dsl)) return dslSession(dsl, { env, checkTools });
        if (isFile(json)) return { kind: "json", json, dsl: null };
        throw new Error(
            `${target} holds neither ${DSL_NAME} nor ${JSON_NAME}.`,
        );
    }

    if (target.endsWith(".dsl")) return dslSession(target, { env, checkTools });

    const dsl = join(dirname(target), DSL_NAME);
    return { kind: "json", json: target, dsl: isFile(dsl) ? dsl : null };
}

const modified = (path) => statSync(path, { throwIfNoEntry: false })?.mtimeMs;

/**
 * What the terminal says about `session` before the server starts (spec
 * 4.2): for a DSL whose tools didn't answer, that edit mode opened
 * `workspace.json` and why, and whether the DSL changed after it; for a
 * `workspace.json` opened by name, that a `workspace.dsl` sits beside it.
 */
export function sessionNotices(session) {
    const { kind, json, dsl } = session;
    if (kind !== "json" || !dsl) return [];
    if (session.fallback) {
        const notices = [
            `Structurizr's tools didn't answer "${session.command} version", so edit mode opened ${json}. Changes to ${basename(dsl)} won't show until the tools are set up: set STRUCTURIZR_CLI to the command that runs them, such as "java -jar ~/bin/structurizr.war", or put structurizr-cli on your PATH, with Java 21 to 25. See ${TOOLS_README}`,
        ];
        if (modified(dsl) > modified(json))
            notices.push(
                `${basename(dsl)} changed after ${basename(json)}; the model shown may be out of date.`,
            );
        return notices;
    }
    return [
        `${basename(dsl)} sits beside ${basename(json)}, and edit mode opened ${json}. To open the DSL instead, run "renderizr edit ${dsl}". The layout you save now carries over to the DSL through Structurizr's merge.`,
    ];
}

/**
 * Start edit mode's server for `session` (spec 4.4, 4.5): Vite's dev server
 * with the build's own config and edit mode's plugin, bound to 127.0.0.1
 * only, on `port` or the next free one. A random token goes into the URL it
 * prints and opens; the page keeps it for the tab.
 *
 * In a DSL session the DSL pipeline runs once before the server starts, so
 * the browser opens on what the tools made of the DSL (spec 5.2); a DSL
 * error doesn't stop it (spec 5.3). `output` takes the tools' output and
 * `debounce` the pipeline's wait after a change.
 *
 * Resolves with the Vite `server`, the `url` to open, the `token`, the DSL
 * `pipeline` or `null`, and a `close` that stops the server.
 */
export async function startEditServer({
    session,
    logo = null,
    font = null,
    port = DEFAULT_PORT,
    open = true,
    logLevel = "info",
    output = process.stdout,
    debounce,
}) {
    // Structurizr Local names itself the same way (spec 7.1).
    const agent = `renderizr/${version ?? "unknown"}`;
    const writer = new WorkspaceWriter(session.json, { agent });

    let pipeline = null;
    let workspace = null;
    if (session.kind === "dsl") {
        pipeline = new DslPipeline({
            dsl: session.dsl,
            json: session.json,
            command: session.command,
            writer,
            output,
            debounce,
        });
        await pipeline.run();
        // The page shows the error until a run succeeds.
        workspace = await loadWorkspace(session.json, { font }).catch(
            () => null,
        );
    } else {
        // Read once up front, so a workspace that won't load stops edit
        // mode before a server starts.
        workspace = await loadWorkspace(session.json, { font });
    }
    // The page's title names the workspace.
    process.env.VITE_WORKSPACE_NAME = workspace?.name ?? "Workspace";

    const token = randomBytes(24).toString("base64url");
    const entry = `/?token=${token}`;

    const server = await createServer({
        ...createConfig({
            logo,
            font,
            mode: "edit",
            editMode: editMode({
                workspace: session.json,
                font,
                token,
                agent,
                writer,
                pipeline,
            }),
        }),
        logLevel,
        // The terminal keeps the hints printed before the server started.
        clearScreen: false,
        server: {
            // Nothing but this machine reaches edit mode, and no flag
            // changes that (spec 4.5).
            host: "127.0.0.1",
            port,
            strictPort: false,
            open: open ? entry : false,
        },
    });
    await server.listen();

    const { port: listening } = server.httpServer.address();
    return {
        server,
        token,
        pipeline,
        url: `http://127.0.0.1:${listening}${entry}`,
        close: async () => {
            await pipeline?.close();
            await server.close();
        },
    };
}
