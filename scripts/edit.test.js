import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { resolveSession, sessionNotices, startEditServer } from "./edit.js";
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
