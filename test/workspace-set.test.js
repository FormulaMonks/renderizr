/**
 * The set the page holds, from `src/workspace-set.ts` (ADR 26): the
 * landscape scoped workspace, where the reader lands, and the software
 * system scoped workspaces, each loaded the first time the reader enters
 * it. The page draws its header, routes, branding and title from whichever
 * workspace the reader entered last.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { createWorkspaceSet } = await importSrc("workspace-set");

const NO_BRANDING = { logo: null, font: null, primaryColor: null };

const LANDSCAPE = {
    workspace: { name: "Acme" },
    branding: NO_BRANDING,
    crossings: [{ element: "1", slug: "orders", via: "name" }],
};

/** The payload of the workspace called `name`. */
const payloadOf = (name, branding = NO_BRANDING) => ({
    workspace: { name },
    branding,
    crossings: [],
});

const PAYLOADS = {
    orders: payloadOf("Orders", { ...NO_BRANDING, primaryColor: "#222" }),
    payments: payloadOf("Payments"),
};

/** A set over `PAYLOADS` that records each load, settling as `settle` says. */
function setOf({ settle = (slug) => Promise.resolve(PAYLOADS[slug]) } = {}) {
    const loads = [];
    const set = createWorkspaceSet({
        landscape: LANDSCAPE,
        workspaces: [
            { slug: "orders", name: "Orders" },
            { slug: "payments", name: "Payments" },
        ],
        load: (slug) => {
            loads.push(slug);
            return settle(slug);
        },
    });
    return { set, loads };
}

test("the reader lands on the landscape scoped workspace, which has no slug", () => {
    const { set, loads } = setOf();
    const current = set.currentWorkspace();
    assert.equal(current.slug, null);
    assert.equal(current.name, "Acme");
    assert.equal(current.workspace, LANDSCAPE.workspace);
    assert.deepEqual(current.crossings, LANDSCAPE.crossings);
    assert.deepEqual(loads, [], "a reader on the landscape loaded a workspace");
});

test("the set names every other workspace by slug and name", () => {
    const { set } = setOf();
    assert.deepEqual(set.workspaces, [
        { slug: "orders", name: "Orders" },
        { slug: "payments", name: "Payments" },
    ]);
});

test("entering a workspace loads it, makes it current and tells every listener", async () => {
    const { set } = setOf();
    const heard = [];
    set.onWorkspaceEntered((entered) => heard.push(entered.slug));

    const entered = await set.enterWorkspace("orders");

    assert.equal(entered.slug, "orders");
    assert.equal(entered.name, "Orders");
    assert.equal(entered.branding.primaryColor, "#222");
    assert.equal(set.currentWorkspace(), entered);
    assert.deepEqual(heard, ["orders"]);
});

test("a workspace loads the first time the reader enters it and never again", async () => {
    const { set, loads } = setOf();
    await set.enterWorkspace("orders");
    await set.enterWorkspace(null);
    await set.enterWorkspace("orders");
    assert.deepEqual(loads, ["orders"]);
    assert.equal(set.currentWorkspace().slug, "orders");
});

test("entering the landscape scoped workspace again needs no load", async () => {
    const { set, loads } = setOf();
    await set.enterWorkspace("payments");
    const landscape = await set.enterWorkspace(null);
    assert.equal(landscape.slug, null);
    assert.equal(landscape.name, "Acme");
    assert.deepEqual(loads, ["payments"]);
});

test("entering the workspace the reader is on tells no listener", async () => {
    const { set } = setOf();
    const heard = [];
    set.onWorkspaceEntered((entered) => heard.push(entered.slug));
    await set.enterWorkspace(null);
    await set.enterWorkspace("orders");
    await set.enterWorkspace("orders");
    assert.deepEqual(heard, ["orders"]);
});

test("a listener that unsubscribes hears nothing more", async () => {
    const { set } = setOf();
    const heard = [];
    const unsubscribe = set.onWorkspaceEntered((entered) =>
        heard.push(entered.slug),
    );
    await set.enterWorkspace("orders");
    unsubscribe();
    await set.enterWorkspace("payments");
    assert.deepEqual(heard, ["orders"]);
});

test("a slug the set doesn't hold fails, naming it, and the reader stays where they are", async () => {
    const { set, loads } = setOf();
    await assert.rejects(set.enterWorkspace("billing"), /billing/);
    assert.equal(set.currentWorkspace().slug, null);
    assert.deepEqual(loads, []);
});

test("a workspace that fails to load leaves the reader where they are, and the next entry tries again", async () => {
    let fail = true;
    const { set, loads } = setOf({
        settle: (slug) =>
            fail
                ? Promise.reject(new Error(`offline: ${slug}`))
                : Promise.resolve(PAYLOADS[slug]),
    });
    await assert.rejects(set.enterWorkspace("orders"), /offline: orders/);
    assert.equal(set.currentWorkspace().slug, null);

    fail = false;
    const entered = await set.enterWorkspace("orders");
    assert.equal(entered.slug, "orders");
    assert.deepEqual(loads, ["orders", "orders"]);
});

test("when the reader enters two workspaces in quick succession, the last one wins", async () => {
    const pending = new Map();
    const { set } = setOf({
        settle: (slug) =>
            new Promise((resolve) =>
                pending.set(slug, () => resolve(PAYLOADS[slug])),
            ),
    });
    const heard = [];
    set.onWorkspaceEntered((entered) => heard.push(entered.slug));

    const orders = set.enterWorkspace("orders");
    const payments = set.enterWorkspace("payments");
    pending.get("payments")();
    await payments;
    pending.get("orders")();
    await orders;

    assert.equal(set.currentWorkspace().slug, "payments");
    assert.deepEqual(heard, ["payments"]);
});
