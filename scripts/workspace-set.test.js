import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { loadWorkspace } from "./assets.js";
import { DslError, loadSet, slugOf } from "./workspace-set.js";
import { fixture, REPO_ROOT, withTempDir } from "./__fixtures__/helpers.js";

/* ----------------------------------------------------------------- helpers */

/** The fake Structurizr tools, as a whole command (see the stub's docblock). */
const STUB = `"${process.execPath}" "${fixture("structurizr-stub.js")}"`;

/** A stream that keeps what the tools print, so the test output stays quiet. */
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

/** `loadSet` with the stub tools and a quiet output, from `cwd`. */
const load = (positionals, { cwd, env = { STRUCTURIZR_CLI: STUB } } = {}) =>
    loadSet(positionals, { cwd, env, output: sink() });

/** A software system, with `extra` fields such as `url` or `containers`. */
const system = (id, name, extra = {}) => ({
    id,
    name,
    tags: "Element,Software System",
    ...extra,
});

/** A landscape scoped workspace mapping `systems`. */
const landscape = (systems, { name = "Landscape", id = 0 } = {}) => ({
    id,
    name,
    configuration: { scope: "Landscape" },
    model: { softwareSystems: systems },
    views: { systemLandscapeViews: [{ key: "Landscape" }] },
});

/**
 * A workspace scoped to the software system `name`, the one with
 * containers, beside the `others` it shows.
 */
const scoped = (
    name,
    {
        id = 0,
        others = [],
        views,
        documentation,
        scope = "SoftwareSystem",
    } = {},
) => ({
    id,
    name: `${name} workspace`,
    configuration: scope ? { scope } : {},
    model: {
        softwareSystems: [
            system("1", name, { containers: [{ id: "2", name: "API" }] }),
            ...others,
        ],
    },
    views: views ?? {
        containerViews: [{ key: "Containers", softwareSystemId: "1" }],
    },
    ...(documentation ? { documentation } : {}),
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
 * Serve `files` (`path -> workspace or text`) from a local HTTP server for
 * the duration of `body`, which gets the server's origin and the paths it
 * served, in order.
 */
async function withServer(files, body) {
    const served = [];
    const server = createServer((request, response) => {
        const path = new URL(request.url, "http://x").pathname.slice(1);
        served.push(path);
        if (!(path in files)) {
            response.writeHead(404, "Not Found").end();
            return;
        }
        const content = files[path];
        response
            .writeHead(200)
            .end(
                typeof content === "string" ? content : JSON.stringify(content),
            );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
        return await body(origin, served);
    } finally {
        await new Promise((done) => server.close(done));
    }
}

/** The slugs of the software system scoped workspaces of `set`, sorted. */
const slugs = (set) => set.workspaces.map((member) => member.slug).sort();

/** The crossings of the landscape, as `element -> slug via` strings. */
const crossings = (member) =>
    member.crossings.map(
        ({ element, slug, via }) => `${element} -> ${slug} ${via}`,
    );

/* -------------------------------------------------------- lone workspace */

test("a lone workspace loads exactly as loadWorkspace loads it", async () => {
    const set = await load(["scripts/__fixtures__/workspace.json"], {
        cwd: REPO_ROOT,
    });
    assert.deepEqual(
        set.landscape.workspace,
        await loadWorkspace(fixture("workspace.json")),
    );
    assert.equal(set.landscape.source, "scripts/__fixtures__/workspace.json");
    assert.equal(set.landscape.slug, null);
    assert.deepEqual(set.landscape.crossings, []);
    assert.deepEqual(set.workspaces, []);
    assert.deepEqual(set.warnings, []);
    assert.deepEqual(set.notices, []);
});

test("a lone landscape scoped workspace whose links lead nowhere loads with no warning", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape-workspace.json": landscape([
                system("1", "Orders", { url: "{workspace:0}/diagrams" }),
                system("2", "Shop", { url: "https://shop.example.com" }),
            ]),
        });
        const set = await load(["landscape-workspace.json"], { cwd: dir });
        assert.equal(set.landscape.workspace.name, "Landscape");
        assert.deepEqual(set.workspaces, []);
        assert.deepEqual(set.warnings, []);
    });
});

test("a lone workspace keeps today's message for a file that isn't JSON", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "broken.json": "{ nope" });
        await assert.rejects(load(["broken.json"], { cwd: dir }), {
            message: /^broken\.json is not valid JSON/,
        });
    });
});

/* ------------------------------------------------------------- positionals */

test("a folder expands to its *workspace.json and *workspace.dsl files without recursing", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape([
                system("1", "Orders"),
                system("2", "Payments"),
            ]),
            "set/orders.workspace.json": scoped("Orders"),
            "set/workspace.dsl": scoped("Payments"),
            "set/notes.json": scoped("Notes"),
            "set/nested/workspace.json": scoped("Nested"),
        });
        const set = await load(["set"], { cwd: dir });
        assert.equal(
            set.landscape.source,
            join("set", "landscape-workspace.json"),
        );
        assert.deepEqual(slugs(set), ["orders", "payments"]);
        assert.deepEqual(set.warnings, []);
    });
});

test("files, folders and URLs mix in any order", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "team/orders-workspace.json": scoped("Orders"),
            "landscape.json": landscape([
                system("1", "Orders"),
                system("2", "Payments"),
                system("3", "Shipping"),
            ]),
            "shipping.json": scoped("Shipping"),
        });
        await withServer(
            { "payments/workspace.json": scoped("Payments") },
            async (origin) => {
                const set = await load(
                    [
                        `${origin}/payments/workspace.json`,
                        "team",
                        pathToFileURL(join(dir, "landscape.json")).href,
                        "shipping.json",
                    ],
                    { cwd: dir },
                );
                assert.equal(set.landscape.source, join(dir, "landscape.json"));
                assert.deepEqual(slugs(set), [
                    "orders",
                    "payments",
                    "shipping",
                ]);
                const payments = set.workspaces.find(
                    (member) => member.slug === "payments",
                );
                assert.equal(
                    payments.source,
                    `${origin}/payments/workspace.json`,
                );
            },
        );
    });
});

test("a folder with no workspace in it fails naming the folder", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "empty/readme.md": "nothing" });
        await assert.rejects(load(["empty"], { cwd: dir }), {
            message:
                /empty holds no \*workspace\.json or \*workspace\.dsl file/,
        });
    });
});

/* ---------------------------------------------------------------- the DSL */

test("a workspace.dsl goes through the tools' export, from an empty temporary folder", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "workspace.dsl": scoped("Orders") });
        const set = await load(["workspace.dsl"], { cwd: dir });
        assert.equal(set.landscape.workspace.name, "Orders workspace");

        const [call] = (await readFile(join(dir, ".stub-calls"), "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        assert.equal(call.command, "export");
        assert.deepEqual(call.args.slice(0, 4), [
            "-workspace",
            join(dir, "workspace.dsl"),
            "-format",
            "json",
        ]);
        assert.notEqual(call.cwd, dir);
        assert.ok(
            call.cwd.startsWith(tmpdir()) ||
                call.cwd.startsWith(`/private${tmpdir()}`),
            `${call.cwd} is not a temporary folder`,
        );
        assert.equal(basename(call.cwd), basename(call.args.at(-1)));
    });
});

test("a followed DSL goes to the tools as its URL", async () => {
    await withTempDir(async (dir) => {
        await withServer(
            { "orders/workspace.dsl": scoped("Orders") },
            async (origin, served) => {
                await write(dir, {
                    "landscape.json": landscape([
                        system("1", "Orders", {
                            url: `${origin}/orders/workspace.dsl`,
                        }),
                    ]),
                });
                const set = await load(["landscape.json"], { cwd: dir });
                assert.deepEqual(slugs(set), ["orders"]);
                assert.deepEqual(served, ["orders/workspace.dsl"]);
            },
        );
    });
});

test("a workspace.dsl without the tools fails naming the file and how to install them", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "workspace.dsl": scoped("Orders") });
        await assert.rejects(
            load(["workspace.dsl"], {
                cwd: dir,
                env: { STRUCTURIZR_CLI: "renderizr-no-such-structurizr-cli" },
            }),
            (error) => {
                assert.match(error.message, /workspace\.dsl/);
                assert.match(error.message, /STRUCTURIZR_CLI/);
                assert.match(error.message, /structurizr-cli on your PATH/);
                return true;
            },
        );
    });
});

test("a JSON workspace runs no tools", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "workspace.json": scoped("Orders") });
        const set = await load(["workspace.json"], {
            cwd: dir,
            env: { STRUCTURIZR_CLI: "renderizr-no-such-structurizr-cli" },
        });
        assert.equal(set.landscape.workspace.name, "Orders workspace");
    });
});

test("a DSL the tools refuse fails with their message and the file", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl": {
                ...scoped("Orders"),
                stub: { fail: "Unexpected tokens at line 3" },
            },
        });
        await assert.rejects(load(["workspace.dsl"], { cwd: dir }), {
            message:
                /Structurizr's tools couldn't read workspace\.dsl:\nUnexpected tokens at line 3/,
        });
    });
});

test("a DSL the tools refuse names its file and the tools' message on the error", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "orders/workspace.dsl": {
                ...scoped("Orders"),
                stub: { fail: "Unexpected tokens at line 3" },
            },
            "landscape.json": landscape([system("1", "Orders")]),
        });
        await assert.rejects(
            load(["landscape.json", "orders/workspace.dsl"], { cwd: dir }),
            (error) => {
                assert.ok(error instanceof DslError, "the error is a DslError");
                assert.equal(error.source, "orders/workspace.dsl");
                assert.equal(error.detail, "Unexpected tokens at line 3");
                return true;
            },
        );
    });
});

/** The stub's `export` runs logged beside `dsl`, a path under `dir`. */
const exportsOf = async (dir, dsl) =>
    (
        await readFile(join(dir, dirname(dsl), ".stub-calls"), "utf8").catch(
            () => "",
        )
    )
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((call) => call.command === "export" && call.done);

test("a load reuses each export the cache holds and fills it with the rest", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape/workspace.dsl": landscape([
                system("1", "Orders"),
                system("2", "Payments"),
            ]),
            "orders/workspace.dsl": scoped("Orders"),
            "payments/workspace.json": scoped("Payments"),
        });
        const positionals = [
            "landscape/workspace.dsl",
            "orders/workspace.dsl",
            "payments/workspace.json",
        ];
        const exports = new Map();
        await loadSet(positionals, {
            cwd: dir,
            env: { STRUCTURIZR_CLI: STUB },
            output: sink(),
            exports,
        });
        assert.deepEqual(
            [...exports.keys()].sort(),
            [
                join(dir, "landscape/workspace.dsl"),
                join(dir, "orders/workspace.dsl"),
            ],
            "the cache holds each DSL by its path",
        );

        // Orders changes; the cache drops it and keeps the landscape.
        await write(dir, { "orders/workspace.dsl": scoped("Orders 2") });
        exports.delete(join(dir, "orders/workspace.dsl"));
        await assert.rejects(
            loadSet(positionals, {
                cwd: dir,
                env: { STRUCTURIZR_CLI: STUB },
                output: sink(),
                exports,
            }),
            /doesn't name/,
            "the new export reached the set",
        );
        assert.equal(
            (await exportsOf(dir, "landscape/workspace.dsl")).length,
            1,
        );
        assert.equal((await exportsOf(dir, "orders/workspace.dsl")).length, 2);
    });
});

test("a failed export leaves the cache without it", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl": { ...scoped("Orders"), stub: { fail: "Nope" } },
        });
        const exports = new Map();
        await assert.rejects(
            loadSet(["workspace.dsl"], {
                cwd: dir,
                env: { STRUCTURIZR_CLI: STUB },
                output: sink(),
                exports,
            }),
        );
        assert.equal(exports.size, 0);
    });
});

test("onRead hears each local file the load reads, even when it then fails", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "set/landscape-workspace.json": landscape([
                system("1", "Orders", {
                    url: pathToFileURL(join(dir, "teams/orders-workspace.json"))
                        .href,
                }),
            ]),
            "teams/orders-workspace.json": scoped("Orders"),
            "stray-workspace.json": scoped("Stray"),
        });
        const read = [];
        await loadSet(["set"], {
            cwd: dir,
            output: sink(),
            onRead: (path) => read.push(path),
        });
        assert.deepEqual(read, [
            join(dir, "set/landscape-workspace.json"),
            join(dir, "teams/orders-workspace.json"),
        ]);

        const failed = [];
        await assert.rejects(
            loadSet(["set", "stray-workspace.json"], {
                cwd: dir,
                output: sink(),
                onRead: (path) => failed.push(path),
            }),
            /doesn't name/,
        );
        assert.ok(failed.includes(join(dir, "stray-workspace.json")));
    });
});

/* -------------------------------------------------------- following links */

test("following element links walks a chain three hops deep", async () => {
    await withTempDir(async (dir) => {
        const files = {};
        await withServer(files, async (origin, served) => {
            const url = (name) => `${origin}/${name}/workspace.json`;
            files["a/workspace.json"] = scoped("A", {
                others: [system("9", "B", { url: url("b") })],
            });
            files["b/workspace.json"] = scoped("B", {
                others: [system("9", "C", { url: url("c") })],
            });
            files["c/workspace.json"] = scoped("C");
            await write(dir, {
                "landscape.json": landscape([
                    system("1", "A", { url: url("a") }),
                    system("2", "B"),
                    system("3", "C"),
                ]),
            });
            const set = await load(["landscape.json"], { cwd: dir });
            assert.deepEqual(slugs(set), ["a", "b", "c"]);
            assert.deepEqual(served, [
                "a/workspace.json",
                "b/workspace.json",
                "c/workspace.json",
            ]);
            assert.deepEqual(set.notices, []);
        });
    });
});

test("following element links stops at a cycle and loads each URL once", async () => {
    await withTempDir(async (dir) => {
        const files = {};
        await withServer(files, async (origin, served) => {
            const url = (name) => `${origin}/${name}/workspace.json`;
            files["a/workspace.json"] = scoped("A", {
                others: [system("9", "B", { url: url("b") })],
            });
            files["b/workspace.json"] = scoped("B", {
                others: [system("9", "A", { url: url("a") })],
            });
            await write(dir, {
                "landscape.json": landscape([
                    system("1", "A", { url: url("a") }),
                    system("2", "B", { url: url("b") }),
                ]),
            });
            const set = await load(["landscape.json"], { cwd: dir });
            assert.deepEqual(slugs(set), ["a", "b"]);
            assert.deepEqual(served.sort(), [
                "a/workspace.json",
                "b/workspace.json",
            ]);
        });
    });
});

test("following reads file:/// links and leaves every other link alone", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "teams/orders/workspace.json": scoped("Orders"),
        });
        await write(dir, {
            "landscape.json": landscape([
                system("1", "Orders", {
                    url: pathToFileURL(join(dir, "teams/orders/workspace.json"))
                        .href,
                }),
                system("2", "Wiki", { url: "https://wiki.example.com/page" }),
                system("3", "Relative", { url: "teams/orders/workspace.json" }),
            ]),
        });
        const set = await load(["landscape.json"], { cwd: dir });
        assert.deepEqual(slugs(set), ["orders"]);
        assert.equal(
            set.workspaces[0].source,
            join(dir, "teams/orders/workspace.json"),
        );
    });
});

test("a positional beats a link to the same workspace, and the build says it skipped the link", async () => {
    await withTempDir(async (dir) => {
        await withServer({}, async (origin, served) => {
            const link = `${origin}/orders/workspace.json`;
            await write(dir, {
                "landscape.json": landscape([
                    system("1", "Orders", { url: link }),
                ]),
                "orders.json": scoped("Orders"),
            });
            const set = await load(["landscape.json", "orders.json"], {
                cwd: dir,
            });
            assert.deepEqual(served, []);
            assert.equal(set.workspaces[0].source, "orders.json");
            assert.equal(set.notices.length, 1);
            assert.match(set.notices[0], new RegExp(`Skipped ${link}`));
            assert.match(set.notices[0], /Orders/);
            assert.match(set.notices[0], /landscape\.json/);
            assert.match(set.notices[0], /orders\.json/);
        });
    });
});

/* ---------------------------------------------------- matching {workspace:N} */

test("{workspace:N} matches the workspace scoped to the software system of the same name", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape.json": landscape([
                system("1", "Orders", { url: "{workspace:0}/diagrams" }),
                system("2", "Payments", {
                    url: "{workspace:0}/diagrams#Containers",
                }),
            ]),
            "orders.json": scoped("Orders"),
            "payments.json": scoped("Payments"),
        });
        const set = await load(
            ["landscape.json", "orders.json", "payments.json"],
            {
                cwd: dir,
            },
        );
        assert.deepEqual(crossings(set.landscape), [
            "1 -> orders workspace-link",
            "2 -> payments workspace-link",
        ]);
        assert.equal(
            set.landscape.crossings[1].url,
            "{workspace:0}/diagrams#Containers",
        );
        assert.deepEqual(set.warnings, []);
    });
});

test("{workspace:N} falls back to a nonzero N unique in the set", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape.json": landscape([
                system("1", "Orders", { url: "{workspace:7}/diagrams" }),
                system("2", "Old Payments", { url: "{workspace:8}/diagrams" }),
                system("3", "Old Shipping", { url: "{workspace:0}/diagrams" }),
                system("4", "Payments"),
                system("5", "Shipping"),
            ]),
            "orders.json": scoped("Orders", { id: 1 }),
            "payments.json": scoped("Payments", { id: 8 }),
            "shipping.json": scoped("Shipping", { id: 8 }),
        });
        const set = await load(
            ["landscape.json", "orders.json", "payments.json", "shipping.json"],
            { cwd: dir },
        );
        // Orders matches by name although its id differs; Old Payments
        // names no workspace and 8 is not unique; 0 never matches.
        assert.deepEqual(crossings(set.landscape), [
            "1 -> orders workspace-link",
            "4 -> payments name",
            "5 -> shipping name",
        ]);
        assert.equal(set.warnings.length, 2);
        assert.match(set.warnings[0], /Old Payments/);
        assert.match(set.warnings[0], /\{workspace:8\}\/diagrams/);
        assert.match(set.warnings[0], /landscape\.json/);
        assert.match(set.warnings[1], /Old Shipping/);
    });
});

test("{workspace:N} matches a nonzero unique N when the names differ", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape.json": landscape([
                system("1", "Payment Service", {
                    url: "{workspace:42}/diagrams",
                }),
                system("2", "Payments"),
            ]),
            "payments.json": scoped("Payments", { id: 42 }),
        });
        const set = await load(["landscape.json", "payments.json"], {
            cwd: dir,
        });
        assert.deepEqual(crossings(set.landscape), [
            "1 -> payments workspace-link",
            "2 -> payments name",
        ]);
        assert.deepEqual(set.warnings, []);
    });
});

test("a followed link, a name match and a software system's own workspace", async () => {
    await withTempDir(async (dir) => {
        const ordersUrl = pathToFileURL(
            join(dir, "orders/workspace.json"),
        ).href;
        await write(dir, {
            "landscape.json": landscape([
                system("1", "Orders", { url: ordersUrl }),
                system("2", "Payments"),
            ]),
            "orders/workspace.json": scoped("Orders", {
                others: [system("9", "Payments")],
            }),
            "payments.json": scoped("Payments", {
                others: [system("9", "Orders", { url: ordersUrl })],
            }),
        });
        const set = await load(["landscape.json", "payments.json"], {
            cwd: dir,
        });
        assert.deepEqual(crossings(set.landscape), [
            "1 -> orders followed-link",
            "2 -> payments name",
        ]);
        const bySlug = Object.fromEntries(
            set.workspaces.map((member) => [member.slug, member]),
        );
        // Each workspace crosses to the other, never to itself.
        assert.deepEqual(crossings(bySlug.orders), ["9 -> payments name"]);
        assert.deepEqual(crossings(bySlug.payments), [
            "9 -> orders followed-link",
        ]);
        assert.deepEqual(bySlug.orders.system, { id: "1", name: "Orders" });
    });
});

/* ---------------------------------------------------------------- warnings */

test("a crossing to a view or page the target lacks warns", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape.json": landscape([
                system("1", "Orders", {
                    url: "{workspace:0}/diagrams#Deployment",
                }),
                system("2", "Payments", { url: "{workspace:0}/documentation" }),
                system("3", "Shipping", { url: "{workspace:0}/decisions" }),
                system("4", "Billing", {
                    url: "{workspace:0}/diagrams#Containers",
                }),
            ]),
            "orders.json": scoped("Orders"),
            "payments.json": scoped("Payments"),
            "shipping.json": scoped("Shipping", {
                documentation: { decisions: [] },
            }),
            "billing.json": scoped("Billing", {
                documentation: { sections: [{ title: "Intro" }] },
            }),
        });
        const set = await load(
            [
                "landscape.json",
                "orders.json",
                "payments.json",
                "shipping.json",
                "billing.json",
            ],
            { cwd: dir },
        );
        // The crossings stay; they land on the default view.
        assert.equal(set.landscape.crossings.length, 4);
        assert.equal(set.warnings.length, 3);
        assert.match(
            set.warnings[0],
            /Orders workspace has no view Deployment/,
        );
        assert.match(
            set.warnings[1],
            /Payments workspace has no documentation/,
        );
        assert.match(set.warnings[2], /Shipping workspace has no decisions/);
    });
});

/* ---------------------------------------------------------------- failures */

/** Each set that fails, the files it holds and what the message says. */
const FAILURES = [
    {
        name: "a set with no landscape scoped workspace",
        files: {
            "orders.json": scoped("Orders"),
            "payments.json": scoped("Payments"),
        },
        message: /no landscape scoped workspace.*orders\.json.*payments\.json/s,
    },
    {
        name: "a set with two landscape scoped workspaces",
        files: {
            "one.json": landscape([system("1", "Orders")]),
            "two.json": landscape([system("1", "Orders")]),
            "orders.json": scoped("Orders"),
        },
        message: /one\.json and two\.json are both landscape scoped/,
    },
    {
        name: "an unscoped workspace in a set",
        files: {
            "landscape.json": landscape([system("1", "Orders")]),
            "orders.json": scoped("Orders", { scope: null }),
        },
        message: /orders\.json sets no workspace scope/,
    },
    {
        name: "two workspaces scoped to the same software system",
        files: {
            "landscape.json": landscape([system("1", "Orders")]),
            "orders.json": scoped("Orders"),
            "orders-copy.json": scoped("Orders"),
        },
        message: /orders\.json and orders-copy\.json are both scoped to Orders/,
    },
    {
        name: "two software systems whose names share a slug",
        files: {
            "landscape.json": landscape([
                system("1", "Order Service"),
                system("2", "order-service"),
            ]),
            "a.json": scoped("Order Service"),
            "b.json": scoped("order-service"),
        },
        message: /a\.json and b\.json .*share the slug order-service/,
    },
    {
        name: "a software system scoped workspace the landscape doesn't name",
        files: {
            "landscape.json": landscape([system("1", "Orders")]),
            "payments.json": scoped("Payments"),
        },
        message:
            /payments\.json is scoped to Payments, which landscape\.json doesn't name/,
    },
    {
        name: "a software system scoped workspace with no software system with containers",
        files: {
            "landscape.json": landscape([system("1", "Orders")]),
            "orders.json": {
                ...scoped("Orders"),
                model: { softwareSystems: [system("1", "Orders")] },
            },
        },
        message:
            /orders\.json is software system scoped, but no software system in it has containers/,
    },
];

for (const { name, files, message } of FAILURES) {
    test(`${name} fails`, async () => {
        await withTempDir(async (dir) => {
            await write(dir, files);
            await assert.rejects(load(Object.keys(files), { cwd: dir }), {
                message,
            });
        });
    });
}

/** Each followed link that fails, what the server gives and the message. */
const FOLLOW_FAILURES = [
    {
        name: "a fetch error",
        content: undefined,
        message: /responded 404 Not Found/,
    },
    {
        name: "content that isn't a workspace",
        content: "<html>Sign in</html>",
        message: /is not valid JSON/,
    },
    {
        name: "JSON that isn't a workspace",
        content: JSON.stringify([1, 2, 3]),
        message: /holds no Structurizr workspace/,
    },
    {
        name: "the wrong scope",
        content: landscape([system("1", "Orders")]),
        message:
            /is landscape scoped; a followed element link must lead to a software system scoped workspace/,
    },
    {
        name: "no scope",
        content: scoped("Orders", { scope: null }),
        message:
            /sets no workspace scope; a followed element link must lead to a software system scoped workspace/,
    },
    {
        name: "a workspace scoped to a different software system",
        content: scoped("Payments"),
        message:
            /is scoped to Payments, a different software system than Orders/,
    },
];

for (const { name, content, message } of FOLLOW_FAILURES) {
    test(`a followed link that fails with ${name} fails the build naming the element, its file and the URL`, async () => {
        await withTempDir(async (dir) => {
            const files =
                content === undefined
                    ? {}
                    : { "orders/workspace.json": content };
            await withServer(files, async (origin) => {
                const link = `${origin}/orders/workspace.json`;
                await write(dir, {
                    "landscape.json": landscape([
                        system("1", "Orders", { url: link }),
                    ]),
                });
                await assert.rejects(
                    load(["landscape.json"], { cwd: dir }),
                    (error) => {
                        assert.match(error.message, message);
                        assert.match(error.message, /Orders/);
                        assert.match(error.message, /landscape\.json/);
                        assert.ok(error.message.includes(link), error.message);
                        return true;
                    },
                );
            });
        });
    });
}

/* ------------------------------------------------------------------- slugs */

test("a slug is the software system's name in kebab case", () => {
    const SLUGS = [
        ["Orders", "orders"],
        ["Payment Service", "payment-service"],
        ["Internet Banking System", "internet-banking-system"],
        ["Café Crème", "cafe-creme"],
        ["  API / Gateway  ", "api-gateway"],
        ["CRM2Go", "crm2go"],
    ];
    for (const [name, slug] of SLUGS) assert.equal(slugOf(name), slug, name);
});

/* ----------------------------------------------------------------- fixture */

test("the enterprise fixture loads as a set, warning only of its one crossing to a missing view", async () => {
    const set = await load(["test/__fixtures__/enterprise"], {
        cwd: REPO_ROOT,
    });
    assert.equal(set.landscape.workspace.configuration.scope, "Landscape");
    assert.ok(set.workspaces.length >= 2);
    for (const member of set.workspaces) {
        assert.equal(member.workspace.configuration.scope, "SoftwareSystem");
    }
    // Orders links Payments' Deployment view, which Payments lacks, so a
    // reader sees the notice for a crossing that lands on the default view.
    assert.deepEqual(set.warnings, [
        "test/__fixtures__/enterprise/orders-workspace.json: Payments links {workspace:0}/diagrams#Deployment, but Payments has no view Deployment, so the crossing lands on its default view.",
    ]);
    assert.deepEqual(set.notices, []);
    assert.equal(set.landscape.crossings.length, set.workspaces.length);
    for (const crossing of set.landscape.crossings) {
        assert.equal(crossing.via, "workspace-link");
    }
});
