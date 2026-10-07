import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { resolveSession, sessionNotices, startEditServer } from "./edit.js";
import {
    ERROR_EVENT,
    FLUSH_EVENT,
    FLUSHED_EVENT,
    flushPages,
    WORKSPACE_EVENT,
} from "./edit-plugin.js";
import { versionOf } from "./workspace-writer.js";
import { withTempDir } from "./__fixtures__/helpers.js";

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

test("a workspace.dsl with no workspace.json is an error until DSL sessions land", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, { "workspace.dsl": "workspace {}" });
        assert.throws(() => resolveSession(dir), /workspace\.dsl/);
        assert.throws(
            () => resolveSession(join(dir, "workspace.dsl")),
            /workspace\.dsl/,
        );
    });
});

test("a folder holding both opens workspace.json, with the hint", async () => {
    await withTempDir(async (dir) => {
        await writeFiles(dir, {
            "workspace.json": "{}",
            "workspace.dsl": "workspace {}",
        });
        const session = resolveSession(dir);
        assert.equal(session.json, join(dir, "workspace.json"));
        assert.equal(session.dsl, join(dir, "workspace.dsl"));
        assert.notDeepEqual(sessionNotices(session), []);
    });
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

/** Wait until `check()` holds, for up to 5 s. */
async function eventually(check, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(message);
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

test("a save of the page's own never reaches the page, and an outside change arrives as a workspace event with its version and the build's transforms", async () => {
    const font = { family: "Fixture Sans", css: "@font-face{}" };
    await withEditServer({ font }, async ({ server, url, token, json }) => {
        const sent = recordEvents(server);
        const version = await servedVersion(new URL(url).origin);
        const { status } = await postSave(url, token, moveSave(version));
        assert.equal(status, 200);
        // Give the watcher time to report the write.
        await new Promise((resolve) => setTimeout(resolve, 600));
        assert.deepEqual(sent, [], "the save came back to the page");

        const workspace = JSON.parse(await readFile(json, "utf8"));
        workspace.description = "Changed outside edit mode";
        await writeFile(json, JSON.stringify(workspace));
        await eventually(
            () => sent.some(({ event }) => event === WORKSPACE_EVENT),
            "an outside change never reached the page",
        );
        const { data } = sent.find(({ event }) => event === WORKSPACE_EVENT);
        assert.equal(data.version, versionOf(await readFile(json, "utf8")));
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
