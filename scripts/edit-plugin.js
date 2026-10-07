import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { loadWorkspace } from "./assets.js";
import { triggersRun } from "./dsl-pipeline.js";
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
 * The module is watched (spec 6.1): a change to the file on disk drops the
 * module, so the next page load imports the file again, and reaches every
 * open page as a custom event over Vite's websocket, `{ version, workspace }`
 * with the build's transforms applied, or `{ version, error }` when it won't
 * load. The plugin's own writes drop the module and send nothing.
 *
 * In a DSL session it also drives the DSL pipeline (spec 5, ADR 16): a
 * change under the DSL's folder runs it, each good run reaches the pages as
 * a workspace event and each failed one as an error event, and the module
 * carries the error while the last run failed.
 *
 * Pages read the events with `import.meta.hot.on`. `flushPages` asks them to
 * save what waits before something else writes the file, and waits for
 * their answers.
 */

/** Where the page posts its saves. `src/components/edit-session.ts` names it too. */
export const SAVE_PATH = "/__renderizr/save";

/** The header that carries the session token, as Node spells it. */
const TOKEN_HEADER = "x-renderizr-token";

/**
 * The custom events between the server and its pages (spec 6.1).
 * `src/pages/diagrams-edit.ts` names them too.
 */
export const WORKSPACE_EVENT = "renderizr:workspace";
export const ERROR_EVENT = "renderizr:error";
export const FLUSH_EVENT = "renderizr:flush";
/** A page's answer to a flush, once its save is done. */
export const FLUSHED_EVENT = "renderizr:flushed";

/** How long a flush waits for the pages' saves (spec 5.2). */
export const FLUSH_TIMEOUT_MS = 1000;

let flushes = 0;

/**
 * Ask every page open on Vite's websocket server `ws` to save what waits
 * (spec 5.2), and resolve once each has answered, with `true`, or once
 * `timeout` ms pass, with `false`. With no page open it resolves at once.
 */
export function flushPages(ws, { timeout = FLUSH_TIMEOUT_MS } = {}) {
    const waiting = new Set(ws.clients);
    if (waiting.size === 0) return Promise.resolve(true);
    const id = ++flushes;
    return new Promise((done) => {
        const finish = (answered) => {
            clearTimeout(timer);
            ws.off(FLUSHED_EVENT, onFlushed);
            done(answered);
        };
        const onFlushed = (data, client) => {
            if (data?.id !== id) return;
            waiting.delete(client);
            if (waiting.size === 0) finish(true);
        };
        const timer = setTimeout(() => finish(false), timeout);
        ws.on(FLUSHED_EVENT, onFlushed);
        ws.send(FLUSH_EVENT, { id });
    });
}

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

/**
 * What the page draws while no run of the DSL pipeline has succeeded and
 * there is no `workspace.json`: nothing, named after the DSL's folder.
 */
const emptyWorkspace = (folder) => ({
    name: basename(folder),
    model: {},
    views: {},
    documentation: {},
});

/**
 * The plugin for edit mode on `workspace`, the `workspace.json` it serves and
 * saves. In a DSL session, `pipeline` is the session's `DslPipeline`: the
 * plugin runs it on changes under the DSL's folder, gives it the pages to
 * flush and tells them what each run made, and serves its error with the
 * workspace module (spec 5.3). `writer` writes the file, one made here when
 * left out.
 */
export function editMode({
    workspace,
    font = null,
    token = null,
    agent,
    writer = new WorkspaceWriter(resolve(workspace), { agent }),
    pipeline = null,
}) {
    const file = resolve(workspace);

    /**
     * The pipeline's error as the page takes it with the workspace module:
     * its message, and whether no run has succeeded yet, so the page has no
     * workspace to draw. `null` when the last run succeeded.
     */
    const pipelineError = () =>
        pipeline?.error
            ? { message: pipeline.error, blank: !pipeline.succeeded }
            : null;

    /** The workspace module's workspace in a DSL session that has none. */
    const loadOrEmpty = async () => {
        try {
            return await loadWorkspace(file, { font });
        } catch (error) {
            if (pipeline && !pipeline.succeeded)
                return emptyWorkspace(pipeline.folder);
            throw error;
        }
    };

    const dropModule = (server) => {
        const module = server.moduleGraph.getModuleById(
            RESOLVED_WORKSPACE_MODULE,
        );
        if (module) server.moduleGraph.invalidateModule(module);
    };

    /**
     * Send the workspace on disk to every open page (spec 6.1), with the
     * build's transforms applied, or the reason it won't load.
     */
    const publish = async (server) => {
        const text = await readFile(file, "utf8").catch(() => null);
        // Gone for a moment, as some editors save; its return publishes.
        if (text === null) return;
        const version = versionOf(text);
        try {
            const workspace = await loadWorkspace(file, { font });
            server.ws.send(WORKSPACE_EVENT, { version, workspace });
        } catch (error) {
            server.config.logger.error(`${file} won't load: ${error.message}`);
            server.ws.send(ERROR_EVENT, { version, error: error.message });
        }
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
            const text = await readFile(file, "utf8").catch((error) => {
                // A DSL whose first run failed has no workspace.json yet.
                if (pipeline && !pipeline.succeeded) return null;
                throw error;
            });
            return workspaceModuleSource(
                text === null
                    ? emptyWorkspace(pipeline.folder)
                    : await loadOrEmpty(),
                text === null ? null : versionOf(text),
                pipelineError(),
            );
        },
        configureServer(server) {
            // The file usually sits outside Vite's root, the package, so
            // Vite's watcher would never look at it on its own.
            server.watcher.add(file);
            if (pipeline) {
                const { folder } = pipeline;
                server.watcher.add(folder);
                server.watcher.on("all", (_event, path) => {
                    if (triggersRun(resolve(path), { folder, json: file }))
                        pipeline.changed();
                });
                pipeline.connect({
                    flush: () => flushPages(server.ws),
                    // The writer's writes never reach `handleHotUpdate` as
                    // news, so each run tells the pages itself.
                    published: () => {
                        dropModule(server);
                        return publish(server);
                    },
                    failed: async (error) => {
                        dropModule(server);
                        const text = await readFile(file, "utf8").catch(
                            () => null,
                        );
                        server.ws.send(ERROR_EVENT, {
                            version: text === null ? null : versionOf(text),
                            error,
                        });
                    },
                });
            }
            server.middlewares.use(SAVE_PATH, (request, response) => {
                save(request, response, server).catch((error) =>
                    answer(response, 500, { error: error.message }),
                );
            });
        },
        async handleHotUpdate({ file: changed, server }) {
            // The DSL's folder belongs to the pipeline, never to Vite's own
            // reloads.
            if (
                pipeline &&
                triggersRun(resolve(changed), {
                    folder: pipeline.folder,
                    json: file,
                })
            )
                return [];
            if (resolve(changed) !== file) return;
            dropModule(server);
            // A save of the page's own comes back here as a change on disk,
            // and the page already has it (spec 4.4).
            const text = await readFile(file, "utf8").catch(() => null);
            if (text !== null && !writer.wrote(text)) await publish(server);
            return [];
        },
    };
}
