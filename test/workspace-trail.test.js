/**
 * The workspace trail, from `src/workspace-trail.ts` (ADR 26): the
 * workspaces a reader crossed into from the landscape scoped workspace,
 * which the address records as one segment each (`#/orders/payments/`),
 * and how the page follows it: entering the workspace it ends at, sending
 * the reader up the trail when a workspace on it is gone, and telling the
 * reader when a crossing can't land where its link says.
 */

import assert from "node:assert/strict";
import { createMemoryHistory } from "history";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    trailOf,
    trailPath,
    workspaceOf,
    crossInto,
    existingTrail,
    parentOf,
    followTrail,
} = await importSrc("workspace-trail");
const { createWorkspaceSet } = await importSrc("workspace-set");

/* ------------------------------------------------------------ the address */

const ADDRESSES = [
    ["/", []],
    ["", []],
    ["/orders/", ["orders"]],
    ["/orders", ["orders"]],
    ["/orders/payments/", ["orders", "payments"]],
    ["//orders//payments/", ["orders", "payments"]],
    // The trail never repeats a workspace: a repeat cuts it back there.
    ["/orders/payments/orders/", ["orders"]],
];

for (const [pathname, trail] of ADDRESSES) {
    test(`the address ${JSON.stringify(pathname)} records the trail ${JSON.stringify(trail)}`, () => {
        assert.deepEqual(trailOf(pathname), trail);
    });
}

test("the landscape scoped workspace adds no segment to the address", () => {
    assert.equal(trailPath([]), "/");
    assert.equal(trailPath(["orders"]), "/orders/");
    assert.equal(trailPath(["orders", "payments"]), "/orders/payments/");
});

test("the workspace an address names is the last on its trail, or the landscape", () => {
    assert.equal(workspaceOf("/orders/payments/"), "payments");
    assert.equal(workspaceOf("/orders/"), "orders");
    assert.equal(workspaceOf("/"), null);
});

/* -------------------------------------------------------------- crossing */

test("a crossing appends the workspace it enters", () => {
    assert.deepEqual(crossInto([], "orders"), ["orders"]);
    assert.deepEqual(crossInto(["orders"], "payments"), ["orders", "payments"]);
});

test("crossing into a workspace already on the trail truncates the trail there", () => {
    assert.deepEqual(
        crossInto(["orders", "payments", "storefront"], "payments"),
        ["orders", "payments"],
    );
    assert.deepEqual(crossInto(["orders", "payments"], "orders"), ["orders"]);
});

test("entering the landscape clears the trail", () => {
    assert.deepEqual(crossInto(["orders", "payments"], null), []);
});

test("the header leads back to the previous workspace on the trail, or the landscape", () => {
    assert.equal(parentOf([]), undefined, "the landscape has no parent");
    assert.deepEqual(parentOf(["orders"]), { slug: null, trail: [] });
    assert.deepEqual(parentOf(["orders", "payments"]), {
        slug: "orders",
        trail: ["orders"],
    });
});

test("a trail keeps every workspace before the first one the set lacks", () => {
    const has = (slug) => slug !== "payments";
    assert.deepEqual(existingTrail(["orders", "storefront"], has), {
        trail: ["orders", "storefront"],
        missing: null,
    });
    assert.deepEqual(existingTrail(["orders", "payments", "storefront"], has), {
        trail: ["orders"],
        missing: "payments",
    });
    assert.deepEqual(existingTrail(["payments", "orders"], has), {
        trail: [],
        missing: "payments",
    });
});

/* ------------------------------------------------------------- following */

const NO_BRANDING = { logo: null, font: null, primaryColor: null };

/**
 * A workspace payload called `name` with views keyed `views`. The first,
 * its default view, takes a title with a bracketed kind, which the view
 * drawer leaves out.
 */
const payloadOf = (name, views = ["SystemContext", "Containers"]) => ({
    workspace: {
        name,
        model: {},
        views: {
            systemContextViews: [
                {
                    key: views[0],
                    title: "[System Context] Big picture",
                    elements: [],
                },
            ],
            containerViews: views
                .slice(1)
                .map((key) => ({ key, elements: [] })),
        },
    },
    branding: NO_BRANDING,
    crossings: [],
});

const PAYLOADS = {
    orders: payloadOf("Orders"),
    payments: payloadOf("Payments"),
    storefront: payloadOf("Storefront"),
};

/**
 * A follower on a set of the landscape `Acme` and `PAYLOADS`, from the
 * address `start`, recording the notices and errors it shows.
 */
async function follow(start = "/", { load } = {}) {
    const history = createMemoryHistory({ initialEntries: [start] });
    const set = createWorkspaceSet({
        landscape: payloadOf("Acme", ["Landscape"]),
        workspaces: Object.entries(PAYLOADS).map(([slug, { workspace }]) => ({
            slug,
            name: workspace.name,
        })),
        load: load ?? ((slug) => Promise.resolve(PAYLOADS[slug])),
    });
    const notices = [];
    const errors = [];
    const follower = followTrail({
        set,
        history,
        notice: (text) => notices.push(text),
        error: (text) => errors.push(text),
    });
    await follower.ready;
    /** Let every pending entry settle. */
    const settled = async () => {
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
        await follower.ready;
    };
    return { history, set, follower, notices, errors, settled };
}

const address = ({ location }) => `${location.pathname}${location.search}`;

test("the page opens in the workspace its address ends at", async () => {
    const { set, notices } = await follow("/orders/payments/?view=Containers");
    assert.equal(set.currentWorkspace().slug, "payments");
    assert.deepEqual(notices, []);
});

test("an address on the landscape enters no other workspace", async () => {
    const { set } = await follow("/?view=Landscape");
    assert.equal(set.currentWorkspace().slug, null);
});

test("crossing pushes the trail and where it lands, then enters the workspace", async () => {
    const page = await follow("/");
    page.follower.cross({
        kind: "workspace",
        slug: "orders",
        label: "Orders",
        landing: null,
    });
    await page.settled();
    assert.equal(address(page.history), "/orders/?page=diagrams");
    assert.equal(page.history.action, "PUSH");
    assert.equal(page.set.currentWorkspace().slug, "orders");

    page.follower.cross({
        kind: "workspace",
        slug: "payments",
        label: "Payments",
        landing: { view: "Containers" },
    });
    await page.settled();
    assert.equal(
        address(page.history),
        "/orders/payments/?page=diagrams&view=Containers",
    );
    assert.equal(page.set.currentWorkspace().slug, "payments");
    assert.deepEqual(page.notices, []);
});

test("crossing back into a workspace on the trail truncates the trail there", async () => {
    const page = await follow("/orders/payments/");
    page.follower.cross({
        kind: "workspace",
        slug: "orders",
        label: "Orders",
        landing: null,
    });
    await page.settled();
    assert.equal(address(page.history), "/orders/?page=diagrams");
    assert.equal(page.set.currentWorkspace().slug, "orders");
});

test("an authored full trail replaces the trail with the one written", async () => {
    const page = await follow("/storefront/");
    page.follower.cross({
        kind: "workspace",
        slug: "payments",
        label: "Payments",
        landing: { view: "Containers" },
        trail: ["orders", "payments"],
    });
    await page.settled();
    assert.equal(
        address(page.history),
        "/orders/payments/?page=diagrams&view=Containers",
    );
    assert.equal(page.set.currentWorkspace().slug, "payments");
});

test("the browser's back and forward move between workspaces", async () => {
    const page = await follow("/");
    page.history.push("/orders/?page=diagrams");
    await page.settled();
    page.history.push("/orders/payments/?page=diagrams");
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, "payments");

    page.history.back();
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, "orders");
    page.history.back();
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, null);
    page.history.forward();
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, "orders");
});

test("a crossing to a view the target lacks lands on its default view and says so, naming it as the view drawer does", async () => {
    const page = await follow("/orders/");
    page.follower.cross({
        kind: "workspace",
        slug: "payments",
        label: "Payments",
        landing: { view: "Deployment" },
    });
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, "payments");
    assert.deepEqual(page.notices, [
        "Payments has no view Deployment, so the page shows Big picture.",
    ]);
});

test("a crossing to a page the target lacks says so too", async () => {
    const page = await follow("/");
    page.follower.cross({
        kind: "workspace",
        slug: "orders",
        label: "Orders",
        landing: { page: "documentation", id: "" },
    });
    await page.settled();
    assert.deepEqual(page.notices, [
        "Orders has no documentation, so the page shows Big picture.",
    ]);
});

test("a missing workspace on the trail sends the reader to the nearest earlier one, at its default view", async () => {
    const page = await follow("/orders/billing/payments/?view=Containers");
    assert.equal(address(page.history), "/orders/?page=diagrams");
    assert.equal(page.history.action, "REPLACE");
    assert.equal(page.set.currentWorkspace().slug, "orders");
    assert.deepEqual(page.notices, [
        "This site no longer has the billing workspace, so the page shows Orders.",
    ]);
});

test("a missing first workspace on the trail sends the reader to the landscape", async () => {
    const page = await follow("/");
    page.history.push("/billing/?view=Containers");
    await page.settled();
    assert.equal(address(page.history), "/?page=diagrams");
    assert.equal(page.set.currentWorkspace().slug, null);
    assert.deepEqual(page.notices, [
        "This site no longer has the billing workspace, so the page shows Acme.",
    ]);
});

test("an address that repeats a workspace is rewritten to the trail it means", async () => {
    const page = await follow("/orders/payments/orders/?view=Containers");
    assert.equal(address(page.history), "/orders/?view=Containers");
    assert.equal(page.set.currentWorkspace().slug, "orders");
    assert.deepEqual(page.notices, []);
});

test("a workspace that fails to load says why and puts the address back", async () => {
    const page = await follow("/", {
        load: (slug) =>
            slug === "payments"
                ? Promise.reject(new Error("Couldn't load payments.json"))
                : Promise.resolve(PAYLOADS[slug]),
    });
    page.history.push("/orders/?page=diagrams&view=Containers");
    await page.settled();
    page.history.push("/orders/payments/?page=diagrams");
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, "orders");
    assert.equal(
        address(page.history),
        "/orders/?page=diagrams&view=Containers",
    );
    assert.deepEqual(page.errors, ["Couldn't load payments.json"]);
});

test("moving within a workspace enters nothing", async () => {
    let loads = 0;
    const page = await follow("/orders/", {
        load: (slug) => {
            loads += 1;
            return Promise.resolve(PAYLOADS[slug]);
        },
    });
    page.history.push("/orders/?page=diagrams&view=Containers");
    page.history.push("/orders/?page=diagrams&view=SystemContext");
    await page.settled();
    assert.equal(loads, 1);
});

test("a stopped follower follows the address no more", async () => {
    const page = await follow("/");
    page.follower.stop();
    page.history.push("/orders/");
    await page.settled();
    assert.equal(page.set.currentWorkspace().slug, null);
});
