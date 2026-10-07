import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadWorkspace } from "./assets.js";
import {
    RESOLVED_WORKSPACE_MODULE,
    WORKSPACE_MODULE,
    workspaceModuleSource,
} from "./plugins.js";
import {
    StaleVersionError,
    versionOf,
    WorkspaceWriter,
} from "./workspace-writer.js";

/**
 * Edit mode's Vite plugin (spec 4.4, ADR 15): the server half of
 * `renderizr edit`.
 *
 * It serves the workspace as the page's workspace module, read from disk on
 * each load with the build's transforms applied (themes merged into styles,
 * icons and images inlined, the font named), in place of the workspace a
 * build compiles in, together with the version of the file it read. The page
 * never sees the file itself: the transforms change it, so the page's copy is
 * never one to save.
 *
 * It also takes the page's saves (spec 7, ADR 17) and writes them through
 * `scripts/workspace-writer.js`.
 *
 * The module is watched: a change to the file on disk drops the module and
 * reloads the page, which imports the file again. The plugin's own writes
 * drop the module and reload nothing.
 */

/** Where the page posts its saves. `src/components/edit-session.ts` names it too. */
export const SAVE_PATH = "/__renderizr/save";

/** The header that carries the session token, as Node spells it. */
const TOKEN_HEADER = "x-renderizr-token";

/** The largest save body the endpoint reads. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

/**
 * Why the save endpoint refuses `request`, as `{ status, error }`, or `null`
 * when it may go ahead (spec 4.5). `port` is the server's own; only a page it
 * served, holding the session `token`, may save.
 */
export function refusal(request, { token, port }) {
    if (request.method !== "POST")
        return { status: 405, error: "Saves are POST requests." };
    const host = request.headers.host;
    // DNS rebinding reaches the server under a name of the attacker's.
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`)
        return { status: 403, error: `Host ${host} isn't edit mode's own.` };
    // A page from another site may post here; it can't send our Origin.
    if (request.headers.origin !== `http://${host}`)
        return {
            status: 403,
            error: "The save didn't come from edit mode's own page.",
        };
    if (!token || request.headers[TOKEN_HEADER] !== token)
        return {
            status: 403,
            error: "The save carries no session token. Open the URL the terminal printed.",
        };
    const type = request.headers["content-type"] ?? "";
    if (!/^application\/json\s*(;|$)/i.test(type))
        return { status: 415, error: "A save is application/json." };
    return null;
}

/** The request's body as text, or a rejection past `MAX_BODY_BYTES`. */
const readBody = (request) =>
    new Promise((done, fail) => {
        const chunks = [];
        let size = 0;
        request.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                fail(new Error("The save is too large."));
                request.destroy();
                return;
            }
            chunks.push(chunk);
        });
        request.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
        request.on("error", fail);
    });

/** `body` parsed as a save, or `null` when it isn't one. */
function parseSave(body) {
    let save;
    try {
        save = JSON.parse(body);
    } catch {
        return null;
    }
    if (
        typeof save !== "object" ||
        save === null ||
        typeof save.version !== "string" ||
        typeof save.views !== "object" ||
        save.views === null ||
        (save.view !== null &&
            save.view !== undefined &&
            typeof save.view !== "string")
    )
        return null;
    return save;
}

const answer = (response, status, body) => {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(body));
};

export function editMode({ workspace, font = null, token = null, agent }) {
    const file = resolve(workspace);
    const writer = new WorkspaceWriter(file, { agent });

    const dropModule = (server) => {
        const module = server.moduleGraph.getModuleById(
            RESOLVED_WORKSPACE_MODULE,
        );
        if (module) server.moduleGraph.invalidateModule(module);
    };

    const save = async (request, response, server) => {
        const { port } = server.httpServer.address();
        const refused = refusal(request, { token, port });
        if (refused) {
            request.resume();
            return answer(response, refused.status, { error: refused.error });
        }
        const edit = parseSave(await readBody(request));
        if (!edit)
            return answer(response, 400, {
                error: "The save isn't a JSON object with a version and views.",
            });
        try {
            const saved = await writer.save(edit);
            // The next load of the page must carry the version just written.
            if (saved.written) dropModule(server);
            return answer(response, 200, { version: saved.version });
        } catch (error) {
            if (error instanceof StaleVersionError)
                return answer(response, 409, { error: error.message });
            return answer(response, 500, {
                error: `The save couldn't be written: ${error.message}`,
            });
        }
    };

    return {
        name: "renderizr:edit-mode",
        resolveId: (id) =>
            id === WORKSPACE_MODULE ? RESOLVED_WORKSPACE_MODULE : null,
        async load(id) {
            if (id !== RESOLVED_WORKSPACE_MODULE) return null;
            const version = versionOf(await readFile(file, "utf8"));
            const transformed = await loadWorkspace(file, { font });
            return workspaceModuleSource(transformed, version);
        },
        configureServer(server) {
            // The file usually sits outside Vite's root, the package, so
            // Vite's watcher would never look at it on its own.
            server.watcher.add(file);
            server.middlewares.use(SAVE_PATH, (request, response) => {
                save(request, response, server).catch((error) =>
                    answer(response, 500, { error: error.message }),
                );
            });
        },
        async handleHotUpdate({ file: changed, server }) {
            if (resolve(changed) !== file) return;
            dropModule(server);
            // A save of the page's own comes back here as a change on disk;
            // reloading would throw away the page it came from (spec 4.4).
            const text = await readFile(file, "utf8").catch(() => null);
            if (text === null || !writer.wrote(text))
                server.ws.send({ type: "full-reload" });
            return [];
        },
    };
}
