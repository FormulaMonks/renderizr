import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, utimes, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import { basename, join } from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
import {
    resolveSession,
    sessionNotices,
    startEditServer,
    ToolsError,
} from "./edit.js";
import {
    ERROR_EVENT,
    FLUSH_EVENT,
    FLUSHED_EVENT,
    flushPages,
    WORKSPACE_EVENT,
} from "./edit-plugin.js";
import { versionOf } from "./workspace-writer.js";
import { shellCommand } from "./structurizr-tools.js";
import { fixture, withTempDir } from "./__fixtures__/helpers.js";

/**
 * `renderizr edit` (spec 4.1 to 4.5, ADR 15): which file a path opens, what
 * the terminal says about it, and the server it starts.
 */

const VIEW_TYPES = new URL(
    "../test/__fixtures__/view-types.json",
    import.meta.url,
);

/** Write `files` (name to content) into `dir`. */
const writeFiles = (dir, files) =>
    Promise.all(
        Object.entries(files).map(([name, content]) =>
            writeFile(join(dir, name), content),
        ),
    );

/* ------------------------------------------------------- session resolution */

test("a folder holding workspace.json opens it in a JSON session", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.json": "{}" });
        assert.deepEqual(resolveSession(dir), {
            kind: "json",
            json: join(dir, "workspace.json"),
            dsl: null,
        });
    });
});

test("no path opens the current folder", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.json": "{}" });
        assert.equal(
            resolveSession(undefined, { cwd: dir }).json,
            join(dir, "workspace.json"),
        );
        assert.equal(
            resolveSession(".", { cwd: dir }).json,
            join(dir, "workspace.json"),
        );
    });
});

test("a direct path opens a JSON file of any name", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "big-bank.json": "{}" });
        assert.deepEqual(resolveSession("big-bank.json", { cwd: dir }), {
            kind: "json",
            json: join(dir, "big-bank.json"),
            dsl: null,
        });
    });
});

test("a folder holding neither workspace.dsl nor workspace.json is an error naming both", async () => {
    await withTempDir(async (dir) => {
        // Only the exact names count, and never in a subfolder.
        await mkdir(join(dir, "nested"));
        await writeFiles(dir, { "other.json": "{}" });
        await writeFiles(join(dir, "nested"), { "workspace.json": "{}" });
        assert.throws(
            () => resolveSession(dir),
            (error) =>
                error.message.includes("workspace.dsl") &&
                error.message.includes("workspace.json") &&
                error.message.includes(dir),
        );
    });
});

test("a path that isn't there is an error naming it", async () => {
    await withTempDir(async (dir) => {
        assert.throws(
            () => resolveSession("missing.json", { cwd: dir }),
            /missing\.json/,
        );
    });
});

test("a workspace.dsl beside the workspace.json opened by name rides along for the hint", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, {
            "workspace.json": "{}",
            "workspace.dsl": "workspace {}",
        });
        const session = resolveSession(join(dir, "workspace.json"));
        assert.equal(session.kind, "json");
        assert.equal(session.dsl, join(dir, "workspace.dsl"));

        const notices = sessionNotices(session).join("\n");
        assert.match(notices, /workspace\.dsl/);
        assert.match(notices, /merge/, "it says the layout carries over");
    });
});

test("a JSON session with no workspace.dsl beside it prints no hint", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.json": "{}" });
        assert.deepEqual(sessionNotices(resolveSession(dir)), []);
    });
});

/** Tools that answer the version check, or don't, recording each check. */
const tools = (ok) => {
    const checks = [];
    const check = (command, options) => {
        checks.push({ command, ...options });
        return { ok, output: ok ? "structurizr: stub" : "not found" };
    };
    return { checks, check };
};

/** An environment that fails the test when anything reads it. */
const untouchable = new Proxy(
    {},
    {
        get: (_, key) => assert.fail(`the session read ${String(key)}`),
        has: (_, key) => assert.fail(`the session read ${String(key)}`),
    },
);

test("a DSL, or a folder with one, opens a DSL session when the tools answer, with or without workspace.json", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.dsl": "workspace {}" });
        const env = { STRUCTURIZR_CLI: "java -jar structurizr.war" };
        const expected = {
            kind: "dsl",
            dsl: join(dir, "workspace.dsl"),
            json: join(dir, "workspace.json"),
            command: "java -jar structurizr.war",
        };
        for (const path of [dir, join(dir, "workspace.dsl")]) {
            const { checks, check } = tools(true);
            assert.deepEqual(
                resolveSession(path, { env, checkTools: check }),
                expected,
            );
            assert.deepEqual(checks, [
                { command: "java -jar structurizr.war", cwd: dir },
            ]);
        }

        await writeFiles(dir, { "workspace.json": "{}" });
        assert.deepEqual(
            resolveSession(dir, { env, checkTools: tools(true).check }),
            expected,
        );
        // Without the variable, the tools are structurizr-cli on the PATH.
        assert.equal(
            resolveSession(dir, { env: {}, checkTools: tools(true).check })
                .command,
            "structurizr-cli",
        );
    });
});

test("a DSL of any name saves workspace.json beside it", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "big-bank.dsl": "workspace {}" });
        const session = resolveSession("big-bank.dsl", {
            cwd: dir,
            env: {},
            checkTools: tools(true).check,
        });
        assert.equal(session.kind, "dsl");
        assert.equal(session.json, join(dir, "workspace.json"));
    });
});

test("without the tools, a DSL with workspace.json beside it falls back to a JSON session with the notice", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, {
            "workspace.dsl": "workspace {}",
            "workspace.json": "{}",
        });
        // The DSL is older than the JSON.
        const past = new Date(Date.now() - 60_000);
        await utimes(join(dir, "workspace.dsl"), past, past);
        for (const path of [dir, join(dir, "workspace.dsl")]) {
            const session = resolveSession(path, {
                env: {},
                checkTools: tools(false).check,
            });
            assert.equal(session.kind, "json");
            assert.equal(session.json, join(dir, "workspace.json"));
            assert.equal(session.dsl, join(dir, "workspace.dsl"));
            assert.equal(session.fallback, true);

            const notices = sessionNotices(session).join("\n");
            assert.match(notices, /opened .*workspace\.json/);
            assert.match(notices, /STRUCTURIZR_CLI/);
            assert.match(notices, /structurizr-cli/);
            assert.match(notices, /github\.com\/FormulaMonks\/renderizr#/);
            assert.doesNotMatch(notices, /may be out of date/);
        }

        const future = new Date(Date.now() + 60_000);
        await utimes(join(dir, "workspace.dsl"), future, future);
        const session = resolveSession(dir, {
            env: {},
            checkTools: tools(false).check,
        });
        assert.ok(
            sessionNotices(session).includes(
                "workspace.dsl changed after workspace.json; the model shown may be out of date.",
            ),
        );
    });
});

test("without the tools, a DSL with no workspace.json stops with a message naming both ways to set them up", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.dsl": "workspace {}" });
        for (const path of [dir, join(dir, "workspace.dsl")]) {
            assert.throws(
                () =>
                    resolveSession(path, {
                        env: { STRUCTURIZR_CLI: "broken-tools" },
                        checkTools: tools(false).check,
                    }),
                (error) =>
                    error instanceof ToolsError &&
                    error.message.includes("STRUCTURIZR_CLI") &&
                    error.message.includes("structurizr-cli") &&
                    error.message.includes("broken-tools") &&
                    error.message.includes("Java 21 to 25") &&
                    error.message.includes(
                        "Groovy !script blocks fail on Java 26",
                    ) &&
                    error.message.includes(
                        "github.com/FormulaMonks/renderizr#",
                    ),
            );
        }
    });
});

test("a JSON session never checks the tools nor reads STRUCTURIZR_CLI", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, {
            "workspace.json": "{}",
            "workspace.dsl": "workspace {}",
            "only.json": "{}",
        });
        const { checks, check } = tools(true);
        const options = { env: untouchable, checkTools: check };
        // A direct path to workspace.json opens it, even beside a DSL.
        const direct = resolveSession(join(dir, "workspace.json"), options);
        assert.equal(direct.kind, "json");
        assert.equal(direct.fallback, undefined);
        assert.equal(
            resolveSession(join(dir, "only.json"), options).kind,
            "json",
        );
        assert.deepEqual(checks, []);
    });
});

test("a folder holding only workspace.json opens it without checking the tools", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.json": "{}" });
        const { checks, check } = tools(true);
        const session = resolveSession(dir, {
            env: untouchable,
            checkTools: check,
        });
        assert.equal(session.kind, "json");
        assert.deepEqual(checks, []);
    });
});

test("a DSL session prints no notice", () => {
    assert.deepEqual(
        sessionNotices({
            kind: "dsl",
            dsl: "/w/workspace.dsl",
            json: "/w/workspace.json",
            command: "structurizr-cli",
        }),
        [],
    );
});

/* ------------------------------------------------------------------ server */

/** A port nothing listens on right now, on 127.0.0.1. */
const freePort = () =>
    new Promise((resolve, reject) => {
        const server = createNetServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });

/** Hold `port` on 127.0.0.1 until the returned function is called. */
const occupy = (port) =>
    new Promise((resolve, reject) => {
        const server = createNetServer();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () =>
            resolve(() => new Promise((done) => server.close(done))),
        );
    });

/**
 * Start edit mode on a copy of the view-types fixture in a scratch folder,
 * hand it to `body`, and close it afterwards.
 */
const withEditServer = (options, body) =>
    withTempDir(async (dir) => {
        const json = join(dir, "workspace.json");
        await copyFile(VIEW_TYPES, json);
        const edit = await startEditServer({
            session: resolveSession(dir),
            port: await freePort(),
            open: false,
            logLevel: "silent",
            ...options,
        });
        try {
            return await body({ ...edit, dir, json });
        } finally {
            await edit.close();
        }
    });

/** The workspace module as the page imports it, through Vite. */
const fetchWorkspaceModule = async (origin) => {
    const response = await fetch(
        `${origin}/@id/__x00__virtual:renderizr/workspace`,
    );
    assert.equal(response.status, 200, "the workspace module is not served");
    return response.text();
};

test("edit mode binds 127.0.0.1 only and prints a URL with the session token", async () => {
    await withEditServer({}, async ({ server, url, token }) => {
        const address = server.httpServer.address();
        assert.equal(address.address, "127.0.0.1");

        const printed = new URL(url);
        assert.equal(printed.hostname, "127.0.0.1");
        assert.equal(Number(printed.port), address.port);
        assert.equal(printed.searchParams.get("token"), token);
        assert.ok(token.length >= 32, "the token is too short to guess");
    });
});

test("each start creates a fresh token", async () => {
    const tokens = [];
    for (let run = 0; run < 2; run++) {
        await withEditServer({}, ({ token }) => tokens.push(token));
    }
    assert.notEqual(tokens[0], tokens[1]);
});

test("edit mode moves to the next free port when the one asked for is taken", async () => {
    const port = await freePort();
    const release = await occupy(port);
    try {
        await withEditServer({ port }, ({ server }) => {
            assert.ok(
                server.httpServer.address().port > port,
                "the server did not move past the taken port",
            );
        });
    } finally {
        await release();
    }
});

test("the page loads with edit mode compiled in", async () => {
    await withEditServer({}, async ({ url }) => {
        const { origin } = new URL(url);
        const html = await (await fetch(url)).text();
        assert.match(
            html,
            /View types \| Structurizr/,
            "the title names the workspace",
        );

        // Vite's dev server defines its constants as globals, here.
        const env = await (await fetch(`${origin}/@vite/env`)).text();
        assert.match(
            env,
            /"__RENDERIZR_EDIT_MODE__": ?true/,
            "edit mode's page code is compiled out",
        );
    });
});

test("the workspace module serves workspace.json from disk with the build's transforms", async () => {
    // A font already loaded, as `loadFont` hands it over, so nothing here
    // reaches the network.
    const font = { family: "Fixture Sans", css: "@font-face{}" };
    await withEditServer({ font }, async ({ url, json }) => {
        const module = await fetchWorkspaceModule(new URL(url).origin);
        assert.match(module, /"name": ?"View types"/);
        assert.match(
            module,
            /"font": ?\{ ?"name": ?"Fixture Sans" ?\}/,
            "the build's font transform did not reach the workspace",
        );
        assert.ok(
            !(await readFile(json, "utf8")).includes("Fixture Sans"),
            "the transform reached the file on disk",
        );
    });
});

test("the workspace module follows workspace.json on disk", async () => {
    await withEditServer({}, async ({ url, json }) => {
        const { origin } = new URL(url);
        await fetchWorkspaceModule(origin);

        const workspace = JSON.parse(await readFile(json, "utf8"));
        const renamed = `Renamed ${randomBytes(4).toString("hex")}`;
        workspace.name = renamed;
        await writeFile(json, JSON.stringify(workspace));

        let module = "";
        for (let attempt = 0; attempt < 50; attempt++) {
            module = await fetchWorkspaceModule(origin);
            if (module.includes(renamed)) break;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(
            module.includes(renamed),
            "the module kept the old workspace",
        );
    });
});

/* ------------------------------------------------------------- the endpoint */

/**
 * POST `body` to the save endpoint at `url`'s server with `headers` laid over
 * the ones a page of edit mode's own sends. Resolves with `{ status, body }`.
 * `node:http` rather than `fetch`, which won't send a `Host` of our choosing.
 */
function postSave(url, token, body, headers = {}) {
    const { hostname, port, host } = new URL(url);
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Promise((done, fail) => {
        const request = httpRequest(
            {
                hostname,
                port,
                // A kept-alive socket would hold the test process open.
                agent: false,
                method: "POST",
                path: "/__renderizr/save",
                headers: {
                    Host: host,
                    Origin: `http://${host}`,
                    "Content-Type": "application/json",
                    "X-Renderizr-Token": token,
                    ...headers,
                },
            },
            (response) => {
                let answer = "";
                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    answer += chunk;
                });
                response.on("end", () => {
                    // Vite answers a foreign Host itself, in plain text.
                    let body;
                    try {
                        body = JSON.parse(answer);
                    } catch {
                        body = { error: answer };
                    }
                    done({ status: response.statusCode, body });
                });
            },
        );
        request.on("error", fail);
        request.end(text);
    });
}

/** The version the workspace module carries, as the page reads it. */
const servedVersion = async (origin) =>
    /export const version = "([^"]+)"/.exec(
        await fetchWorkspaceModule(origin),
    )?.[1];

/** A save of the Warehouse view that moves element 20. */
const moveSave = (version, x = 205) => ({
    version,
    view: "Warehouse",
    views: { Warehouse: { elements: { 20: { x, y: 350 } } } },
});

/**
 * Wait until `check()` holds, for up to 30 s. A run of the DSL pipeline
 * waits out its debounce and a flush and starts a process, which takes a
 * while on a machine running the whole suite at once.
 */
async function eventually(check, message) {
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(message);
}

/**
 * Write `text` to `file` and wait until `check()` holds, as `eventually`
 * does. While the server has sent `sent` nothing new, the write goes again
 * every 2 s: a watcher still starting on a busy machine can miss it.
 */
async function writeUntil(file, text, sent, check, message) {
    const before = sent.length;
    await writeFile(file, text);
    let again = Date.now() + 2000;
    await eventually(async () => {
        if (await check()) return true;
        if (Date.now() > again && sent.length === before) {
            await writeFile(file, text);
            again = Date.now() + 2000;
        }
        return false;
    }, message);
}

test("the save endpoint writes the layout into workspace.json and answers with the new version", async () => {
    await withEditServer({}, async ({ url, token, json }) => {
        const { origin } = new URL(url);
        const version = await servedVersion(origin);
        assert.ok(version, "the workspace module carries no version");

        const { status, body } = await postSave(url, token, moveSave(version));
        assert.equal(status, 200, JSON.stringify(body));
        const text = await readFile(json, "utf8");
        const saved = JSON.parse(text);
        assert.deepEqual(saved.views.customViews[0].elements[0], {
            id: "20",
            x: 205,
            y: 350,
        });
        assert.match(saved.lastModifiedAgent, /^renderizr\//);
        assert.equal(saved.views.configuration.lastSavedView, "Warehouse");
        assert.ok(
            text.startsWith('{\n  "'),
            "the file isn't in Jackson's format",
        );
        assert.notEqual(body.version, version);
        assert.equal(await servedVersion(origin), body.version);
    });
});

test("the save endpoint refuses a save without the token, from a foreign host or origin, or that isn't JSON", async () => {
    await withEditServer({}, async ({ url, token, json }) => {
        const before = await readFile(json, "utf8");
        const version = await servedVersion(new URL(url).origin);
        const save = moveSave(version);
        const { port } = new URL(url);
        const refusals = [
            [{ "X-Renderizr-Token": "" }, save, 403],
            [{ "X-Renderizr-Token": "guess" }, save, 403],
            [{ Host: `attacker.example:${port}` }, save, 403],
            [{ Origin: "http://attacker.example" }, save, 403],
            [{ Origin: "" }, save, 403],
            [{ "Content-Type": "text/plain" }, save, 415],
            [{}, "{ not json", 400],
            [{}, { views: {} }, 400],
        ];
        for (const [headers, body, expected] of refusals) {
            const answer = await postSave(url, token, body, headers);
            assert.equal(
                answer.status,
                expected,
                `${JSON.stringify(headers)} with ${JSON.stringify(body)} answered ${answer.status}`,
            );
            assert.equal(typeof answer.body.error, "string");
        }
        assert.equal(
            await readFile(json, "utf8"),
            before,
            "a refused save wrote",
        );
    });
});

test("the save endpoint refuses a save against a version the file no longer has", async () => {
    await withEditServer({}, async ({ url, token, json }) => {
        const version = await servedVersion(new URL(url).origin);
        const workspace = JSON.parse(await readFile(json, "utf8"));
        workspace.description = "Changed outside edit mode";
        await writeFile(json, JSON.stringify(workspace));
        const { status, body } = await postSave(url, token, moveSave(version));
        assert.equal(status, 409);
        assert.match(body.error, /changed on disk/);
        assert.equal(
            body.version,
            versionOf(await readFile(json, "utf8")),
            "the refusal doesn't name the file's version",
        );
        assert.ok(!(await readFile(json, "utf8")).includes('"x" : 205'));
    });
});

/* ------------------------------------------------------------ live reload */

/** Every event `server` sends its pages from now on, as `{ event, data }`. */
function recordEvents(server) {
    const sent = [];
    const send = server.ws.send.bind(server.ws);
    server.ws.send = (event, data, ...rest) => {
        sent.push(typeof event === "string" ? { event, data } : event);
        return send(event, data, ...rest);
    };
    return sent;
}

test("a save reaches every page once, as a workspace event naming the page that saved, and an outside change arrives as one with its version and the build's transforms", async () => {
    const font = { family: "Fixture Sans", css: "@font-face{}" };
    await withEditServer({ font }, async ({ server, url, token, json }) => {
        const sent = recordEvents(server);
        const version = await servedVersion(new URL(url).origin);
        const { status, body } = await postSave(url, token, {
            ...moveSave(version),
            source: "tab-1",
        });
        assert.equal(status, 200);
        // Give the watcher time to report the write.
        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.equal(sent.length, 1, "the save reached the pages twice");
        assert.equal(sent[0].event, WORKSPACE_EVENT);
        assert.equal(sent[0].data.source, "tab-1");
        assert.equal(sent[0].data.version, body.version);
        assert.equal(
            sent[0].data.workspace.views.customViews[0].elements[0].x,
            205,
        );
        sent.length = 0;

        const workspace = JSON.parse(await readFile(json, "utf8"));
        workspace.description = "Changed outside edit mode";
        await writeFile(json, JSON.stringify(workspace));
        await eventually(
            () => sent.some(({ event }) => event === WORKSPACE_EVENT),
            "an outside change never reached the page",
        );
        const { data } = sent.find(({ event }) => event === WORKSPACE_EVENT);
        assert.equal(data.version, versionOf(await readFile(json, "utf8")));
        assert.equal(data.source, undefined);
        assert.equal(data.workspace.description, "Changed outside edit mode");
        assert.match(
            JSON.stringify(data.workspace),
            /"font":\{"name":"Fixture Sans"\}/,
            "the build's font transform did not reach the event",
        );
        assert.ok(
            !sent.some(({ type }) => type === "full-reload"),
            "the page reloaded in full",
        );
    });
});

test("two outside changes close together reach the page in order, the last one last", async () => {
    await withEditServer({}, async ({ server, json }) => {
        const sent = recordEvents(server);
        const workspace = JSON.parse(await readFile(json, "utf8"));
        workspace.description = "First change";
        await writeFile(json, JSON.stringify(workspace));
        workspace.description = "Second change";
        await writeFile(json, JSON.stringify(workspace));
        const last = versionOf(await readFile(json, "utf8"));
        await eventually(
            () => sent.some(({ data }) => data?.version === last),
            "the second change never reached the page",
        );
        // Give a slower, older publish the time to arrive after it.
        await new Promise((resolve) => setTimeout(resolve, 600));
        const events = sent.filter(({ event }) => event === WORKSPACE_EVENT);
        assert.equal(events.at(-1).data.version, last);
        assert.equal(events.at(-1).data.workspace.description, "Second change");
    });
});

test("a workspace.json that won't load reaches the page as an error event, and the next good one as a workspace", async () => {
    await withEditServer({}, async ({ server, json }) => {
        const sent = recordEvents(server);
        const text = await readFile(json, "utf8");
        await writeFile(json, "{ not json");
        await eventually(
            () => sent.some(({ event }) => event === ERROR_EVENT),
            "a broken workspace.json sent no error",
        );
        const { data } = sent.find(({ event }) => event === ERROR_EVENT);
        assert.equal(data.version, versionOf("{ not json"));
        assert.equal(typeof data.error, "string");

        await writeFile(json, text);
        await eventually(
            () => sent.some(({ event }) => event === WORKSPACE_EVENT),
            "the next good workspace.json never reached the page",
        );
    });
});

/**
 * A stand-in for Vite's websocket server with one open page per entry of
 * `delays`, each answering a flush after that many ms, or never for `null`.
 */
function fakePages(delays) {
    const listeners = new Map();
    const clients = delays.map((delay) => ({ delay }));
    const sent = [];
    const heard = (event) => listeners.get(event) ?? [];
    return {
        sent,
        listening: () => heard(FLUSHED_EVENT).length,
        ws: {
            clients: new Set(clients),
            on(event, listener) {
                listeners.set(event, [...heard(event), listener]);
            },
            off(event, listener) {
                listeners.set(
                    event,
                    heard(event).filter((each) => each !== listener),
                );
            },
            send(event, data) {
                sent.push({ event, data });
                for (const client of clients) {
                    if (client.delay === null) continue;
                    setTimeout(() => {
                        for (const listener of heard(FLUSHED_EVENT))
                            listener({ id: data.id }, client);
                    }, client.delay);
                }
            },
        },
    };
}

test("a flush asks every open page to save and resolves once each has answered", async () => {
    const pages = fakePages([10, 30]);
    const started = Date.now();
    assert.equal(await flushPages(pages.ws, { timeout: 2000 }), true);
    assert.ok(Date.now() - started < 1000, "the flush waited past the answers");
    assert.deepEqual(
        pages.sent.map(({ event }) => event),
        [FLUSH_EVENT],
    );
    assert.equal(pages.listening(), 0, "the flush kept listening");
});

test("a flush stops waiting for a page that never answers once its timeout passes", async () => {
    const pages = fakePages([10, null]);
    const started = Date.now();
    assert.equal(await flushPages(pages.ws, { timeout: 200 }), false);
    assert.ok(Date.now() - started >= 190, "the flush stopped too soon");
    assert.equal(pages.listening(), 0, "the flush kept listening");
});

test("a flush with no page open resolves at once and sends nothing", async () => {
    const pages = fakePages([]);
    assert.equal(await flushPages(pages.ws), true);
    assert.deepEqual(pages.sent, []);
});

/* ------------------------------------------------------------ DSL sessions */

/** Structurizr's tools, stubbed, as a whole command (spec 5.1). */
const STUB = shellCommand(process.execPath, [fixture("structurizr-stub.js")]);

/** A workspace in the stub's DSL: JSON, with `stub` steering the stub. */
const stubDsl = (name, stub) =>
    JSON.stringify({
        name,
        model: {
            softwareSystems: [{ id: "1", name: "Shop", tags: "Element" }],
        },
        views: {
            systemLandscapeViews: [
                { key: "Landscape", elements: [{ id: "1", x: 10, y: 10 }] },
            ],
        },
        ...(stub ? { stub } : {}),
    });

/** A stream that drops the tools' output. */
const quiet = new Writable({ write: (_chunk, _encoding, done) => done() });

/**
 * Start edit mode on a DSL session over `dsl` in a scratch folder, with the
 * stub as the tools, hand it to `body`, and close it afterwards.
 */
const withDslServer = (dsl, body) =>
    withTempDir(async (dir) => {
        const file = join(dir, "workspace.dsl");
        await writeFile(file, dsl);
        const json = join(dir, "workspace.json");
        const edit = await startEditServer({
            session: { kind: "dsl", dsl: file, json, command: STUB },
            port: await freePort(),
            open: false,
            logLevel: "silent",
            output: quiet,
            debounce: 50,
        });
        try {
            return await body({ ...edit, dir, dsl: file, json });
        } finally {
            await edit.close();
        }
    });

/** The pipeline's error the workspace module carries. */
const servedError = async (origin) =>
    JSON.parse(
        /export const error = (.*);/.exec(
            await fetchWorkspaceModule(origin),
        )[1],
    );

test("a DSL session runs the tools before the server starts and serves what they wrote", async () => {
    await withDslServer(stubDsl("From the DSL"), async ({ url, json }) => {
        const saved = JSON.parse(await readFile(json, "utf8"));
        assert.equal(saved.name, "From the DSL");
        const { origin } = new URL(url);
        assert.match(await fetchWorkspaceModule(origin), /"From the DSL"/);
        assert.equal(await servedError(origin), null);
        const html = await (await fetch(url)).text();
        assert.match(html, /From the DSL \| Structurizr/);
    });
});

test("a DSL change flushes the open pages, merges and reaches them as a workspace event", async (t) => {
    if (typeof WebSocket !== "function")
        return t.skip("this Node has no WebSocket client");
    await withDslServer(
        stubDsl("Before"),
        async ({ server, url, token, dsl, json }) => {
            const sent = recordEvents(server);
            // A page, as far as Vite's websocket goes, that saves a move when
            // asked to flush and then answers.
            const { port } = new URL(url);
            const socket = new WebSocket(
                `ws://127.0.0.1:${port}/?token=${server.config.webSocketToken}`,
                "vite-hmr",
            );
            await new Promise((done, fail) => {
                socket.addEventListener("open", done);
                socket.addEventListener("error", fail);
            });
            await eventually(
                () => server.ws.clients.size === 1,
                "the page never connected",
            );
            const flushed = [];
            socket.addEventListener("message", async ({ data }) => {
                const message = JSON.parse(data);
                if (message.event !== FLUSH_EVENT) return;
                const version = versionOf(await readFile(json, "utf8"));
                const { status } = await postSave(url, token, {
                    version,
                    view: "Landscape",
                    views: {
                        Landscape: { elements: { 1: { x: 400, y: 300 } } },
                    },
                });
                flushed.push(status);
                socket.send(
                    JSON.stringify({
                        type: "custom",
                        event: FLUSHED_EVENT,
                        data: message.data,
                    }),
                );
            });

            try {
                await writeUntil(
                    dsl,
                    stubDsl("After"),
                    sent,
                    () =>
                        sent.some(
                            ({ event, data }) =>
                                event === WORKSPACE_EVENT &&
                                data.workspace.name === "After",
                        ),
                    "the DSL change never reached the page",
                );
            } finally {
                socket.close();
            }
            assert.deepEqual(flushed, [200], "the page saved once, on flush");
            const merged = JSON.parse(await readFile(json, "utf8"));
            assert.equal(merged.name, "After");
            assert.deepEqual(
                merged.views.systemLandscapeViews[0].elements[0],
                { id: "1", x: 400, y: 300 },
                "the merge lost the layout the flush saved",
            );
            const { data } = sent.find(
                ({ event, data }) =>
                    event === WORKSPACE_EVENT &&
                    data.workspace.name === "After",
            );
            assert.equal(data.version, versionOf(await readFile(json, "utf8")));
        },
    );
});

test("a DSL error reaches the page over the last good workspace, and the next good run clears it", async () => {
    await withDslServer(stubDsl("Good"), async ({ server, url, dsl, json }) => {
        const sent = recordEvents(server);
        const good = await readFile(json, "utf8");
        await writeUntil(
            dsl,
            stubDsl("Bad", { fail: "Unexpected tokens" }),
            sent,
            () => sent.some(({ event }) => event === ERROR_EVENT),
            "the DSL error never reached the page",
        );
        const { data } = sent.find(({ event }) => event === ERROR_EVENT);
        assert.deepEqual(data, {
            version: versionOf(good),
            error: "Unexpected tokens",
        });
        assert.equal(await readFile(json, "utf8"), good);
        const { origin } = new URL(url);
        assert.deepEqual(await servedError(origin), {
            message: "Unexpected tokens",
            blank: false,
        });
        assert.match(await fetchWorkspaceModule(origin), /"Good"/);

        await writeUntil(
            dsl,
            stubDsl("Fixed"),
            sent,
            () => sent.some(({ event }) => event === WORKSPACE_EVENT),
            "the fixed DSL never reached the page",
        );
        assert.equal(await servedError(origin), null);
    });
});

test("a DSL that fails from the start still starts the server, with the error in place of a workspace", async () => {
    await withDslServer(
        stubDsl("Broken", { fail: "No model" }),
        async ({ server, url, dsl, json, dir }) => {
            await assert.rejects(readFile(json), { code: "ENOENT" });
            const { origin } = new URL(url);
            assert.deepEqual(await servedError(origin), {
                message: "No model",
                blank: true,
            });
            assert.match(
                await fetchWorkspaceModule(origin),
                new RegExp(`"name":"${basename(dir)}"`),
            );

            const sent = recordEvents(server);
            await writeFile(dsl, stubDsl("Exported"));
            await eventually(
                () => sent.some(({ event }) => event === WORKSPACE_EVENT),
                "the first good run never reached the page",
            );
            assert.equal(
                JSON.parse(await readFile(json, "utf8")).name,
                "Exported",
            );
        },
    );
});

test("the pipeline ignores workspace.json, dot folders and node_modules", async () => {
    await withDslServer(stubDsl("Watched"), async ({ dir, json, pipeline }) => {
        const runs = async () =>
            (await readFile(join(dir, ".stub-calls"), "utf8"))
                .trim()
                .split("\n")
                .filter((line) => JSON.parse(line).at).length;
        assert.equal(await runs(), 1);
        await mkdir(join(dir, ".git"));
        await mkdir(join(dir, "node_modules"));
        await writeFiles(dir, { ".git/HEAD": "ref", "node_modules/x.js": "" });
        const workspace = JSON.parse(await readFile(json, "utf8"));
        workspace.description = "Changed by hand";
        await writeFile(json, JSON.stringify(workspace));
        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.equal(await runs(), 1, "an ignored change ran the pipeline");

        await writeFiles(dir, { "model.dsl": "!include" });
        await eventually(
            async () => (await runs()) === 2,
            "a change under the DSL's folder never ran the pipeline",
        );
        assert.equal(pipeline.succeeded, true);
    });
});
