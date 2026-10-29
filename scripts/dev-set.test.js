import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { devArgs, devSet, SET_ERROR_EVENT } from "./dev-set.js";
import { NO_BRANDING_FLAGS } from "./branding.js";
import { RESOLVED_WORKSPACE_MODULE } from "./plugins.js";
import { fixture, withTempDir } from "./__fixtures__/helpers.js";

/* ----------------------------------------------------------------- helpers */

/** The fake Structurizr tools, as a whole command (see the stub's docblock). */
const STUB = `"${process.execPath}" "${fixture("structurizr-stub.js")}"`;

/** A stream that keeps what it is given, so the test output stays quiet. */
const sink = () => {
    const chunks = [];
    return {
        chunks,
        isTTY: false,
        write: (chunk) => {
            chunks.push(String(chunk));
            return true;
        },
    };
};

/** A landscape scoped workspace mapping the software systems `names`. */
const landscape = (names, extra = {}) => ({
    name: "Landscape",
    configuration: { scope: "Landscape" },
    model: {
        softwareSystems: names.map((name, at) => ({
            id: String(at + 1),
            name,
            ...extra[name],
        })),
    },
    views: { systemLandscapeViews: [{ key: "Landscape" }] },
});

/** A workspace scoped to the software system `name`. */
const scoped = (name, extra = {}) => ({
    name: `${name} workspace`,
    configuration: { scope: "SoftwareSystem" },
    model: {
        softwareSystems: [
            { id: "1", name, containers: [{ id: "2", name: "API" }] },
        ],
    },
    views: { containerViews: [{ key: "Containers", softwareSystemId: "1" }] },
    ...extra,
});

/** Write each `[path, workspace]` under `dir`, JSON unless it is a string. */
async function write(dir, files) {
    for (const [path, content] of Object.entries(files)) {
        const at = join(dir, path);
        await mkdir(dirname(at), { recursive: true });
        await writeFile(
            at,
            typeof content === "string" ? content : JSON.stringify(content),
        );
    }
}

/**
 * A stand-in for Vite's dev server: a watcher to emit changes on, the
 * websocket messages it sent, the paths it watches and its restarts.
 */
function fakeServer() {
    const watcher = new EventEmitter();
    const watched = new Set();
    watcher.add = (paths) => {
        for (const path of [paths].flat()) watched.add(path);
    };
    const sent = [];
    const waiting = [];
    const server = {
        watcher,
        watched,
        sent,
        invalidated: [],
        restarts: 0,
        config: { base: "/" },
        middlewares: { use: () => {} },
        moduleGraph: {
            getModuleById: (id) => ({ id }),
            invalidateModule: (module) => server.invalidated.push(module.id),
        },
        ws: {
            send: (...message) => {
                sent.push(message);
                waiting.shift()?.(message);
            },
        },
        restart: async () => {
            server.restarts += 1;
            waiting.shift()?.(["restart"]);
        },
        /** The next message the server sends, or its next restart. */
        next: () => new Promise((done) => waiting.push(done)),
        /** Report a change to `path`, as Vite's watcher does. */
        change: (path) => watcher.emit("all", "change", path),
    };
    return server;
}

/** Start `devSet` on `positionals` from `cwd` with the stub tools. */
async function start(positionals, cwd, { flags = NO_BRANDING_FLAGS } = {}) {
    const output = sink();
    const dev = await devSet({
        positionals,
        flags,
        cwd,
        env: { STRUCTURIZR_CLI: STUB },
        output,
        debounce: 5,
    });
    const server = fakeServer();
    for (const plugin of dev.plugins) plugin.configureServer?.(server);
    return { dev, server, output };
}

/** The source of the module `id` as the dev set's plugins serve it. */
async function moduleSource(dev, id) {
    for (const plugin of dev.plugins) {
        const resolved = plugin.resolveId?.(id);
        if (!resolved) continue;
        return plugin.load(resolved);
    }
    throw new Error(`No plugin serves ${id}`);
}

/** The workspace module's default export and its `error`. */
async function served(dev) {
    const source = await moduleSource(dev, "virtual:renderizr/workspace");
    const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    return import(url);
}

/** The `export` runs the stub logged beside the DSL `dsl` under `dir`. */
const exportsOf = async (dir, dsl) =>
    (
        await readFile(join(dir, dirname(dsl), ".stub-calls"), "utf8").catch(
            () => "",
        )
    )
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((call) => call.command === "export" && call.done).length;

/* --------------------------------------------------------------- arguments */

const ARGS = [
    { argv: [], positionals: [], flags: {}, singleFile: false },
    {
        argv: ["--", "test/__fixtures__/enterprise"],
        positionals: ["test/__fixtures__/enterprise"],
        flags: {},
        singleFile: false,
    },
    {
        argv: ["--port", "5174", "--", "a.json", "--font", "Inter"],
        positionals: ["a.json"],
        flags: { font: "Inter" },
        singleFile: false,
    },
    {
        argv: ["--port", "5174"],
        positionals: [],
        flags: {},
        singleFile: false,
    },
    {
        argv: [
            "--",
            "--logo",
            "x.svg",
            "landscape.json",
            "--single-file",
            "teams",
            "--primary-color",
            "#123456",
        ],
        positionals: ["landscape.json", "teams"],
        flags: { logo: "x.svg", primaryColor: "#123456" },
        singleFile: true,
    },
];

for (const { argv, positionals, flags, singleFile } of ARGS) {
    test(`devArgs reads ${JSON.stringify(argv)}`, () => {
        const parsed = devArgs(argv);
        assert.deepEqual(parsed.positionals, positionals);
        assert.equal(parsed.singleFile, singleFile);
        for (const [key, value] of Object.entries(NO_BRANDING_FLAGS))
            assert.deepEqual(
                parsed.flags[key],
                flags[key] ?? value,
                `the flag ${key}`,
            );
    });
}

/* ----------------------------------------------------------------- loading */

test("the dev set serves the landscape scoped workspace and the rest of the set", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape(["Orders"]),
            "set/orders-workspace.json": scoped("Orders"),
        });
        const { dev } = await start(["set"], dir);
        assert.equal(dev.landscape.workspace.name, "Landscape");
        const { default: workspace, error } = await served(dev);
        assert.equal(workspace.name, "Landscape");
        assert.equal(error, null);
        assert.match(
            await moduleSource(dev, "virtual:renderizr/set"),
            /"slug":"orders","name":"Orders workspace"/,
        );
    });
});

test("the dev server watches each local file it loaded, each DSL's folder and every dependency outside it, and no URL", async () => {
    await withTempDir(async (dir) => {
        const orders = join(dir, "teams/orders-workspace.json");
        await write(dir, {
            "set/landscape-workspace.json": landscape(["Orders", "Payments"], {
                Orders: { url: pathToFileURL(orders).href },
            }),
            "teams/orders-workspace.json": scoped("Orders"),
            "payments/workspace.dsl": `!include ../shared/people.dsl\n${JSON.stringify(scoped("Payments"))}`,
            "shared/people.dsl": "",
            "elsewhere/ignored.json": "{}",
        });
        const { server } = await start(["set", "payments/workspace.dsl"], dir);
        for (const path of [
            join(dir, "set"),
            join(dir, "set/landscape-workspace.json"),
            orders,
            join(dir, "payments"),
            join(dir, "shared/people.dsl"),
        ])
            assert.ok(server.watched.has(path), `${path} is watched`);
        assert.ok(
            ![...server.watched].some((path) => path.includes("elsewhere")),
            "an unrelated folder is watched",
        );
    });
});

/* ------------------------------------------------------------------ reload */

test("a change to a loaded file reruns the set loader and fully reloads the page", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape(["Orders"]),
            "set/orders-workspace.json": scoped("Orders"),
        });
        const { dev, server } = await start(["set"], dir);
        await write(dir, {
            "set/orders-workspace.json": scoped("Orders", {
                description: "changed",
            }),
        });
        const reloaded = server.next();
        server.change(join(dir, "set/orders-workspace.json"));
        assert.deepEqual(await reloaded, [{ type: "full-reload" }]);
        assert.ok(
            server.invalidated.includes(RESOLVED_WORKSPACE_MODULE),
            "the workspace module was dropped",
        );
        assert.match(
            await moduleSource(dev, "virtual:renderizr/set"),
            /"slug":"orders"/,
        );
    });
});

test("a new workspace in a folder positional joins the set", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape(["Orders", "Payments"]),
            "set/orders-workspace.json": scoped("Orders"),
        });
        const { dev, server } = await start(["set"], dir);
        await write(dir, { "set/payments-workspace.json": scoped("Payments") });
        const reloaded = server.next();
        server.change(join(dir, "set/payments-workspace.json"));
        await reloaded;
        assert.match(
            await moduleSource(dev, "virtual:renderizr/set"),
            /"slug":"payments"/,
        );
    });
});

test("a change that touches no loaded file and no DSL reloads nothing", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape(["Orders"]),
            "set/orders-workspace.json": scoped("Orders"),
            "set/README.md": "",
            "payments/workspace.dsl": scoped("Payments"),
            "payments/notes.md": "",
        });
        const { server } = await start(["set"], dir);
        server.change(join(dir, "set/README.md"));
        server.change(join(dir, "src/main.ts"));
        await new Promise((done) => setTimeout(done, 50));
        assert.deepEqual(server.sent, []);
    });
});

test("a change re-exports only the DSL whose dependencies hold it, and keeps the other exports", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape/workspace.dsl": landscape(["Orders", "Payments"]),
            "orders/workspace.dsl": scoped("Orders"),
            "payments/workspace.dsl": scoped("Payments"),
        });
        const { server } = await start(
            [
                "landscape/workspace.dsl",
                "orders/workspace.dsl",
                "payments/workspace.dsl",
            ],
            dir,
        );
        for (const team of ["landscape", "orders", "payments"])
            assert.equal(await exportsOf(dir, `${team}/workspace.dsl`), 1);

        await write(dir, {
            "orders/workspace.dsl": scoped("Orders", { description: "new" }),
        });
        const reloaded = server.next();
        server.change(join(dir, "orders/workspace.dsl"));
        assert.deepEqual(await reloaded, [{ type: "full-reload" }]);
        assert.equal(await exportsOf(dir, "orders/workspace.dsl"), 2);
        assert.equal(await exportsOf(dir, "landscape/workspace.dsl"), 1);
        assert.equal(await exportsOf(dir, "payments/workspace.dsl"), 1);
    });
});

/* ------------------------------------------------------------------ errors */

test("a broken DSL sends its error to the page and keeps the last set", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape-workspace.json": landscape(["Orders"]),
            "orders/workspace.dsl": scoped("Orders"),
        });
        const { dev, server, output } = await start(
            ["landscape-workspace.json", "orders/workspace.dsl"],
            dir,
        );
        await write(dir, {
            "orders/workspace.dsl": {
                ...scoped("Orders"),
                stub: { fail: "Unexpected tokens at line 3" },
            },
        });
        const failed = server.next();
        server.change(join(dir, "orders/workspace.dsl"));
        assert.deepEqual(await failed, [
            SET_ERROR_EVENT,
            {
                message: "Unexpected tokens at line 3",
                source: "orders/workspace.dsl",
                blank: false,
            },
        ]);
        const { default: workspace, error } = await served(dev);
        assert.equal(workspace.name, "Landscape", "the last set stays");
        assert.equal(error.source, "orders/workspace.dsl");
        assert.match(
            await moduleSource(dev, "virtual:renderizr/set"),
            /"slug":"orders"/,
        );
        assert.match(output.chunks.join(""), /Unexpected tokens at line 3/);

        // Fixed, it re-exports again, and the page reloads with no error.
        await write(dir, { "orders/workspace.dsl": scoped("Orders") });
        const fixed = server.next();
        server.change(join(dir, "orders/workspace.dsl"));
        assert.deepEqual(await fixed, [{ type: "full-reload" }]);
        assert.equal((await served(dev)).error, null);
    });
});

test("a set error names no DSL", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape(["Orders"]),
            "set/orders-workspace.json": scoped("Orders"),
        });
        const { server } = await start(["set"], dir);
        await write(dir, { "set/stray-workspace.json": scoped("Stray") });
        const failed = server.next();
        server.change(join(dir, "set/stray-workspace.json"));
        const [event, error] = await failed;
        assert.equal(event, SET_ERROR_EVENT);
        assert.equal(error.source, null);
        assert.match(error.message, /Stray, which .* doesn't name/);
    });
});

test("with no set loaded yet, the page gets an empty workspace and the error, and the first set to load restarts the server", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl": { ...scoped("Orders"), stub: { fail: "Nope" } },
        });
        const { dev, server } = await start(["workspace.dsl"], dir);
        const { default: workspace, error } = await served(dev);
        assert.deepEqual(workspace.views, {});
        assert.deepEqual(error, {
            message: "Nope",
            source: "workspace.dsl",
            blank: true,
        });

        await write(dir, { "workspace.dsl": scoped("Orders") });
        const restarted = server.next();
        server.change(join(dir, "workspace.dsl"));
        assert.deepEqual(
            await restarted,
            ["restart"],
            "the page's compiled-in name and branding change",
        );
    });
});

test("a set error with no set loaded yet is in place of the canvas too", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "broken.json": "{ nope" });
        const { dev } = await start(["broken.json"], dir);
        const { error } = await served(dev);
        assert.equal(error.blank, true);
        assert.equal(error.source, null);
        assert.match(error.message, /broken\.json is not valid JSON/);
    });
});

test("a change to the landscape's name restarts the server, which compiles it into the page", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "landscape.json": landscape(["Orders"]) });
        const { server } = await start(["landscape.json"], dir);
        await write(dir, {
            "landscape.json": { ...landscape(["Orders"]), name: "Renamed" },
        });
        const restarted = server.next();
        server.change(join(dir, "landscape.json"));
        assert.deepEqual(await restarted, ["restart"]);
    });
});
