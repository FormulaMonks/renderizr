/**
 * Documentation scopes across a workspace set (spec: _Activation targets_
 * and _Addresses_): a software system on the landscape scoped
 * workspace crosses into its own workspace's documentation and decisions,
 * and `{workspace:N}/documentation|decisions/<path>#…` links lead into the
 * documentation scope they name in another workspace of the set.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    WorkspaceModel,
    elementTargets,
    indicatorOf,
    classifyLink,
    landingSearch,
    missingLanding,
} = await importSrc("model/index");

/** The landscape scoped workspace, which carries no documentation. */
const landscape = (urls = {}) => ({
    name: "Acme",
    configuration: { scope: "Landscape" },
    model: {
        softwareSystems: [
            { id: "orders", name: "Orders", url: urls.orders },
            { id: "payments", name: "Payments", url: urls.payments },
            { id: "shipping", name: "Shipping", url: urls.shipping },
            { id: "billing", name: "Billing", url: urls.billing },
        ],
    },
    views: {
        systemLandscapeViews: [{ key: "Landscape", elements: [] }],
        configuration: {},
    },
});

/**
 * The set as the loader records it: Payments carries documentation and
 * decisions on its software system, Shipping only decisions, Orders
 * nothing, and Billing has no workspace.
 */
const SET = {
    workspaces: [
        { slug: "orders", name: "Orders" },
        {
            slug: "payments",
            name: "Payments",
            documents: {
                scope: "payments",
                documentation: true,
                decisions: true,
            },
        },
        {
            slug: "shipping",
            name: "Shipping",
            documents: {
                scope: "shipping",
                documentation: false,
                decisions: true,
            },
        },
    ],
    crossings: [
        { element: "orders", slug: "orders", via: "name" },
        { element: "payments", slug: "payments", via: "name" },
        { element: "shipping", slug: "shipping", via: "name" },
    ],
};

const inSet = (json = landscape(), set = SET) => new WorkspaceModel(json, set);

/** What activating `id` offers from the landscape, as plain records. */
const offered = (m, id) =>
    elementTargets(m, m.findElementById(id), "Landscape").map((target) => ({
        kind: target.kind,
        label: target.label,
        slug: target.slug,
        landing: target.landing,
        ...(target.shows ? { shows: target.shows } : {}),
    }));

test("a landscape software system crosses into its workspace, then into that workspace's documentation and decisions", () => {
    assert.deepEqual(offered(inSet(), "payments"), [
        {
            kind: "workspace",
            label: "Payments",
            slug: "payments",
            landing: null,
        },
        {
            kind: "workspace",
            label: "Documentation",
            slug: "payments",
            landing: { page: "documentation", id: "payments" },
            shows: "documentation",
        },
        {
            kind: "workspace",
            label: "Decisions",
            slug: "payments",
            landing: { page: "decisions", id: "", filter: "payments" },
            shows: "decisions",
        },
    ]);
});

test("Documentation lands on the software system's first section and Decisions on the index filtered to it", () => {
    const [, documentation, decisions] = elementTargets(
        inSet(),
        inSet().findElementById("payments"),
        "Landscape",
    );
    assert.equal(
        landingSearch(documentation.landing),
        "page=docs&section=payments",
    );
    assert.equal(landingSearch(decisions.landing), "page=adrs&filter=payments");
});

test("a software system offers only what its workspace's software system carries", () => {
    assert.deepEqual(
        offered(inSet(), "shipping").map((target) => target.label),
        ["Shipping", "Decisions"],
    );
    assert.deepEqual(
        offered(inSet(), "orders").map((target) => target.label),
        ["Orders"],
    );
    assert.deepEqual(offered(inSet(), "billing"), []);
});

test("a software system without a crossing into its workspace offers none of its documents", () => {
    const m = inSet(landscape(), { ...SET, crossings: [] });
    assert.deepEqual(offered(m, "payments"), []);
});

test("a software system in its own workspace offers its own documentation scope, not a crossing", () => {
    const payments = new WorkspaceModel(
        {
            name: "Payments",
            configuration: { scope: "SoftwareSystem" },
            model: {
                softwareSystems: [
                    {
                        id: "2",
                        name: "Payments",
                        documentation: {
                            sections: [
                                {
                                    filename: "01-context.md",
                                    order: 1,
                                    content: "# Context",
                                    format: "Markdown",
                                },
                            ],
                        },
                        containers: [{ id: "3", name: "Payment API" }],
                    },
                ],
            },
            views: { configuration: {} },
        },
        SET,
    );
    // The slug path starts at the software system, as on the landscape.
    assert.deepEqual(
        elementTargets(payments, payments.findElementById("2"), "x").map(
            (target) => `${target.kind}: ${target.label} ${target.search}`,
        ),
        ["documentation: Documentation page=docs&section=payments/01-context"],
    );
});

test("the crossing's indicators are the documentation and decisions glyphs", () => {
    const kinds = elementTargets(
        inSet(),
        inSet().findElementById("payments"),
        "Landscape",
    ).map(indicatorOf);
    assert.deepEqual(kinds, ["workspace", "documentation", "decisions"]);
});

/* ---------------------------------------------------- {workspace:N} links */

/** The landscape with `url` on Billing, and the crossing the loader records. */
const linked = (url, slug = "payments") =>
    inSet(landscape({ billing: url }), {
        ...SET,
        crossings: [
            ...SET.crossings,
            { element: "billing", slug, via: "workspace-link", url },
        ],
    });

/** Where the link `url` on Billing lands. */
const landingOf = (url, slug) =>
    classifyLink(linked(url, slug), url, "billing")?.landing;

test("{workspace:N}/documentation/<path>#<section> lands on that section of the documentation scope the names lead to", () => {
    assert.deepEqual(landingOf("{workspace:3}/documentation/Payments#02-api"), {
        page: "documentation",
        id: "payments/02-api",
    });
    assert.deepEqual(
        landingOf(
            "{workspace:3}/documentation/payments/Payment%20API#01-overview",
        ),
        { page: "documentation", id: "payments/payment-api/01-overview" },
    );
});

test("{workspace:N}/documentation/<path> with no section lands on the scope's first", () => {
    assert.deepEqual(landingOf("{workspace:3}/documentation/Payments"), {
        page: "documentation",
        id: "payments",
    });
});

test("{workspace:N}/decisions/<path>#<id> opens that decision of the scope, and with no id the index filtered to the scope", () => {
    assert.deepEqual(landingOf("{workspace:3}/decisions/Payments#2"), {
        page: "decisions",
        id: "payments/2",
    });
    assert.deepEqual(landingOf("{workspace:3}/decisions/Payments"), {
        page: "decisions",
        id: "",
        filter: "payments",
    });
    assert.equal(
        landingSearch(landingOf("{workspace:3}/decisions/Payments#2")),
        "page=adrs&adr=payments/2",
    );
});

test("{workspace:N} links to the workspace's own documents read as they always did", () => {
    assert.deepEqual(landingOf("{workspace:3}/documentation#overview"), {
        page: "documentation",
        id: "overview",
    });
    assert.deepEqual(landingOf("{workspace:3}/documentation/*#overview"), {
        page: "documentation",
        id: "overview",
    });
    assert.deepEqual(landingOf("{workspace:3}/decisions"), {
        page: "decisions",
        id: "",
    });
});

test("an element link into the software system's own documentation merges with its Documentation crossing, in the link's place", () => {
    const url = "{workspace:0}/documentation/Payments#02-api";
    const m = inSet(landscape({ payments: url }), {
        ...SET,
        crossings: [
            {
                element: "payments",
                slug: "payments",
                via: "workspace-link",
                url,
            },
        ],
    });
    assert.deepEqual(offered(m, "payments"), [
        {
            kind: "workspace",
            label: "Documentation",
            slug: "payments",
            landing: { page: "documentation", id: "payments/02-api" },
            shows: "documentation",
        },
        {
            kind: "workspace",
            label: "Decisions",
            slug: "payments",
            landing: { page: "decisions", id: "", filter: "payments" },
            shows: "decisions",
        },
    ]);
});

test("a crossing into the documentation of an element of the target counts every documentation scope there", () => {
    const m = new WorkspaceModel({
        name: "Payments",
        model: {
            softwareSystems: [
                {
                    id: "2",
                    name: "Payments",
                    documentation: {
                        decisions: [
                            {
                                id: "1",
                                date: "2024-01-01",
                                title: "One",
                                status: "Accepted",
                                content: "",
                                format: "Markdown",
                            },
                        ],
                    },
                },
            ],
        },
        views: { configuration: {} },
    });
    assert.equal(
        missingLanding(m, { page: "decisions", id: "", filter: "payments" }),
        null,
    );
    assert.equal(
        missingLanding(m, { page: "documentation", id: "payments" }),
        "documentation",
    );
});
