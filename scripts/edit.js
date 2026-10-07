import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createServer } from "vite";
import { loadWorkspace } from "./assets.js";
import { createConfig, version } from "./config.js";
import { editMode } from "./edit-plugin.js";

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
 * The refusal for a `workspace.dsl` with no `workspace.json` to fall back
 * to. DSL sessions run Structurizr's tools, which this version of edit mode
 * doesn't do yet.
 */
const dslWithoutJson = (dsl) =>
    new Error(
        `${dsl} has no ${JSON_NAME} beside it. Edit mode opens ${JSON_NAME} only: export the workspace to ${JSON_NAME} and open that.`,
    );

/**
 * The session `path` opens (spec 4.2): `{ kind: "json", json, dsl }`, where
 * `json` is the file edit mode serves and saves, and `dsl` the
 * `workspace.dsl` beside it, or `null`.
 *
 * `path` is a `workspace.json` of any name, a `workspace.dsl` or a folder,
 * the current folder when left out. In a folder, edit mode looks for the
 * exact names `workspace.dsl` and `workspace.json` and never in subfolders.
 * Throws an error naming the path when it opens nothing.
 */
export function resolveSession(path = ".", { cwd = process.cwd() } = {}) {
    const target = resolve(cwd, path);
    const stat = statSync(target, { throwIfNoEntry: false });
    if (!stat) throw new Error(`${path} doesn't exist.`);

    if (stat.isDirectory()) {
        const json = join(target, JSON_NAME);
        const dsl = join(target, DSL_NAME);
        const hasDsl = isFile(dsl);
        if (!isFile(json)) {
            if (hasDsl) throw dslWithoutJson(dsl);
            throw new Error(
                `${target} holds neither ${DSL_NAME} nor ${JSON_NAME}.`,
            );
        }
        return { kind: "json", json, dsl: hasDsl ? dsl : null };
    }

    if (target.endsWith(".dsl")) {
        const json = join(dirname(target), JSON_NAME);
        if (!isFile(json)) throw dslWithoutJson(target);
        return { kind: "json", json, dsl: target };
    }

    const dsl = join(dirname(target), DSL_NAME);
    return { kind: "json", json: target, dsl: isFile(dsl) ? dsl : null };
}

/**
 * What the terminal says about `session` before the server starts: the hint
 * that a `workspace.dsl` sits beside the `workspace.json` edit mode opened
 * (spec 4.2).
 */
export function sessionNotices({ json, dsl }) {
    if (!dsl) return [];
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
 * Resolves with the Vite `server`, the `url` to open, the `token` and a
 * `close` that stops the server.
 */
export async function startEditServer({
    session,
    logo = null,
    font = null,
    port = DEFAULT_PORT,
    open = true,
    logLevel = "info",
}) {
    // Read once up front, so a workspace that won't load stops edit mode
    // before a server starts, and so the page's title names the workspace.
    const workspace = await loadWorkspace(session.json, { font });
    process.env.VITE_WORKSPACE_NAME = workspace.name ?? "Workspace";

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
                // Structurizr Local names itself the same way (spec 7.1).
                agent: `renderizr/${version ?? "unknown"}`,
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
        url: `http://127.0.0.1:${listening}${entry}`,
        close: () => server.close(),
    };
}
