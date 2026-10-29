/**
 * A set written in DSL against Structurizr's real tools: the enterprise DSL
 * fixture loads as a set through `export -format json`, its `!include`s
 * resolve from the empty temporary folder the tools run in, Shipping's
 * `workspace extends` of the landscape keeps the landscape's people,
 * software systems and links, the landscape's element link to Big Bank plc's published `workspace.json` brings that
 * workspace into the set, and the build writes one JSON file per software
 * system scoped workspace.
 *
 * It needs Java, the tools and the network (the link points at GitHub), so
 * it runs only with `STRUCTURIZR_CLI` set, as the `structurizr` CI job sets
 * it:
 *
 *     STRUCTURIZR_CLI="java -jar structurizr.war" pnpm test:structurizr
 *
 * `scripts/workspace-set.test.js` covers the set loader with a stub.
 */

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { test } from "node:test";
import { REPO_ROOT, runCli } from "../scripts/__fixtures__/helpers.js";
import { loadSet } from "../scripts/workspace-set.js";

const COMMAND = process.env.STRUCTURIZR_CLI?.trim();
const SKIP = !COMMAND && "STRUCTURIZR_CLI is not set";
const ENTERPRISE_DSL = "test/__fixtures__/enterprise-dsl";

/**
 * Where the landscape links the Internet Banking System: the fixture's
 * software system scoped copy of Big Bank plc, at the commit that added it.
 */
const BIG_BANK =
    "https://raw.githubusercontent.com/FormulaMonks/renderizr/9a88e1e12d793db5f43a22490c379f19e6959c8c/test/__fixtures__/enterprise-dsl/remote/big-bank-plc/workspace.json";

/** The tools' output, kept for a failure's message. */
function sink() {
    let text = "";
    const stream = new Writable({
        write(chunk, _encoding, done) {
            text += chunk;
            done();
        },
    });
    stream.text = () => text;
    return stream;
}

/** Each member's crossings as `[slug, via, url]`, keyed by its slug. */
const crossingsOf = (set) =>
    Object.fromEntries(
        [set.landscape, ...set.workspaces].map((member) => [
            member.slug ?? "landscape",
            member.crossings.map(({ slug, via, url }) => [slug, via, url]),
        ]),
    );

test("a folder of DSL workspaces loads as a set through the tools, following a link to a published workspace", {
    skip: SKIP,
    timeout: 180_000,
}, async () => {
    const output = sink();
    const set = await loadSet([ENTERPRISE_DSL], {
        cwd: REPO_ROOT,
        env: process.env,
        output,
    }).catch((error) => assert.fail(`${error.message}\n${output.text()}`));

    assert.equal(set.landscape.workspace.name, "Acme");
    assert.equal(set.landscape.workspace.configuration.scope, "Landscape");
    assert.deepEqual(
        set.workspaces.map(({ slug, system }) => [slug, system.name]),
        [
            ["orders", "Orders"],
            ["payments", "Payments"],
            ["shipping", "Shipping"],
            ["storefront", "Storefront"],
            ["internet-banking-system", "Internet Banking System"],
        ],
    );
    const bigBank = set.workspaces.at(-1);
    assert.equal(bigBank.source, BIG_BANK);
    assert.equal(bigBank.workspace.name, "Big Bank plc");
    assert.deepEqual(crossingsOf(set), {
        landscape: [
            ["storefront", "workspace-link", "{workspace:0}/diagrams"],
            ["orders", "workspace-link", "{workspace:0}/diagrams"],
            ["payments", "workspace-link", "{workspace:0}/diagrams#Containers"],
            ["shipping", "workspace-link", "{workspace:0}/diagrams"],
            ["internet-banking-system", "followed-link", BIG_BANK],
        ],
        orders: [["payments", "workspace-link", "{workspace:0}/diagrams"]],
        payments: [["orders", "name", undefined]],
        // Shipping inherits the landscape's links and drops its own.
        shipping: [
            ["storefront", "workspace-link", "{workspace:0}/diagrams"],
            ["orders", "workspace-link", "{workspace:0}/diagrams"],
            ["payments", "workspace-link", "{workspace:0}/diagrams#Containers"],
            ["internet-banking-system", "followed-link", BIG_BANK],
        ],
        storefront: [["orders", "name", undefined]],
        "internet-banking-system": [],
    });
    assert.deepEqual(set.warnings, []);
    assert.deepEqual(set.notices, []);

    const bySlug = (slug) => set.workspaces.find((m) => m.slug === slug);

    // `shared/people.dsl` reaches both workspaces that include it, and
    // Shipping, which extends the landscape.
    for (const member of [
        set.landscape,
        bySlug("storefront"),
        bySlug("shipping"),
    ])
        assert.deepEqual(
            member.workspace.model.people.map((person) => person.name),
            ["Customer"],
        );

    // Shipping takes its name and scope from its own DSL, and adds its
    // containers to the software system it inherits.
    const shipping = bySlug("shipping").workspace;
    assert.equal(shipping.name, "Shipping");
    assert.equal(shipping.configuration.scope, "SoftwareSystem");
    assert.deepEqual(
        shipping.model.softwareSystems
            .find((system) => system.name === "Shipping")
            .containers.map((container) => container.name),
        ["Shipment tracker", "Carrier gateway"],
    );
});

test("pnpm render builds a set written in DSL", {
    skip: SKIP,
    timeout: 300_000,
}, async () => {
    const out = await mkdtemp(join(tmpdir(), "renderizr-dsl-set-"));
    try {
        const result = await runCli([ENTERPRISE_DSL, "--out", out]);
        assert.equal(
            result.code,
            0,
            `build failed:\n${result.stdout}\n${result.stderr}`,
        );
        const written = (await readdir(out)).filter((file) =>
            file.endsWith(".json"),
        );
        assert.deepEqual(written.sort(), [
            "internet-banking-system.json",
            "orders.json",
            "payments.json",
            "shipping.json",
            "storefront.json",
        ]);
        const payments = JSON.parse(
            await readFile(join(out, "payments.json"), "utf-8"),
        );
        assert.equal(payments.workspace.name, "Payments");
        const html = await readFile(join(out, "index.html"), "utf-8");
        assert.match(html, /<title>Acme \| Structurizr<\/title>/);
    } finally {
        await rm(out, { recursive: true, force: true });
    }
});
