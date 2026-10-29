/**
 * `src/model/targets.ts`: what activating an element or a relationship
 * offers the reader, in the order spec 6.1 gives, and how each destination
 * is labeled in the target menu.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    WorkspaceModel,
    elementTargets,
    relationshipTargets,
    classifyLink,
    mermaidNodeTargets,
    landingSearch,
    missingLanding,
} = await importSrc("model/index");

/** A small workspace with every kind of destination an element can offer. */
const workspace = () => ({
    name: "Targets",
    model: {
        people: [
            {
                id: "user",
                name: "User",
                properties: {
                    Profile: "https://people.example.com/user",
                    Notes: "not a link",
                    Mail: "mailto:user@example.com",
                },
                relationships: [
                    {
                        id: "uses",
                        sourceId: "user",
                        destinationId: "system",
                        description: "Uses",
                        url: "https://runbooks.example.com/uses",
                        properties: { Trace: "http://trace.example.com/1" },
                    },
                    {
                        id: "plain",
                        sourceId: "user",
                        destinationId: "other",
                    },
                ],
            },
        ],
        softwareSystems: [
            {
                id: "system",
                name: "System",
                url: "https://github.com/example/system",
                properties: { Wiki: "https://wiki.example.com/system" },
                containers: [
                    {
                        id: "api",
                        name: "API",
                        url: "#Context",
                    },
                ],
            },
            { id: "other", name: "Other" },
        ],
        deploymentNodes: [
            {
                id: "node",
                name: "Node",
                environment: "Live",
                url: "https://console.example.com/node",
                containerInstances: [
                    { id: "api-1", containerId: "api", environment: "Live" },
                ],
                softwareSystemInstances: [
                    { id: "system-1", softwareSystemId: "system" },
                ],
            },
        ],
    },
    views: {
        systemLandscapeViews: [{ key: "Landscape", elements: [] }],
        systemContextViews: [
            {
                key: "Context",
                title: "System in context",
                softwareSystemId: "system",
                elements: [],
            },
        ],
        containerViews: [
            {
                key: "Containers",
                softwareSystemId: "system",
                elements: [],
            },
        ],
        componentViews: [
            { key: "Components", containerId: "api", elements: [] },
        ],
        deploymentViews: [{ key: "Live", environment: "Live", elements: [] }],
        imageViews: [
            {
                key: "SystemPicture",
                title: "System picture",
                elementId: "system",
            },
        ],
        configuration: {},
    },
    documentation: {
        sections: [
            {
                title: "Overview",
                filename: "01-overview.md",
                content: "",
                format: "Markdown",
                order: 1,
            },
        ],
        decisions: [
            {
                id: "4",
                title: "Use React Flow",
                content: "",
                format: "Markdown",
                status: "Accepted",
                date: "2026-01-01",
            },
        ],
    },
});

const model = (json = workspace()) => new WorkspaceModel(json);

/** A target as the menu shows it: its kind and its label. */
const labeled = (targets) =>
    targets.map(({ kind, label }) => `${kind}: ${label}`);

const elementOf = (m, id) => m.findElementById(id);

/* ---------------------------------------------------------------- order */

test("a software system offers its link, its drill-down views, its image views, then its http(s) properties", () => {
    const m = model();

    assert.deepEqual(
        labeled(elementTargets(m, elementOf(m, "system"), "Landscape")),
        [
            "link: github.com",
            "view: System in context",
            "view: Container View: System",
            "view: System picture",
            "link: Wiki (wiki.example.com)",
        ],
    );
});

test("a container drills down to its component views", () => {
    const m = model();
    const targets = elementTargets(m, elementOf(m, "api"), "Landscape");

    assert.deepEqual(
        targets.map((target) => target.kind === "view" && target.key),
        ["Context", "Components"],
        "the link to a view comes first, then the drill-down",
    );
});

test("software system and container instances drill down like what they are instances of", () => {
    const m = model();

    assert.deepEqual(
        labeled(elementTargets(m, elementOf(m, "system-1"), "Live")),
        [
            "link: github.com",
            "view: System in context",
            "view: Container View: System",
        ],
        "an instance takes its system's link but has no image views of its own",
    );
    assert.deepEqual(
        labeled(elementTargets(m, elementOf(m, "api-1"), "Live")),
        ["view: System in context", "view: Component View: System - API"],
    );
});

test("a deployment node has no drill-down, only its link", () => {
    const m = model();

    assert.deepEqual(labeled(elementTargets(m, elementOf(m, "node"), "Live")), [
        "link: console.example.com",
    ]);
});

test("only properties whose value is an http(s) URL are targets", () => {
    const m = model();

    assert.deepEqual(
        labeled(elementTargets(m, elementOf(m, "user"), "Landscape")),
        ["link: Profile (people.example.com)"],
    );
});

test("the view on screen is never a target", () => {
    const m = model();
    const keys = elementTargets(m, elementOf(m, "system"), "Context")
        .filter((target) => target.kind === "view")
        .map((target) => target.key);

    assert.deepEqual(keys, ["Containers", "SystemPicture"]);
});

test("a destination offered twice is listed once, where it first appears", () => {
    const json = workspace();
    json.model.softwareSystems[0].url = "#Containers";
    const m = model(json);
    const keys = elementTargets(m, elementOf(m, "system"), "Landscape")
        .filter((target) => target.kind === "view")
        .map((target) => target.key);

    assert.deepEqual(keys, ["Containers", "Context", "SystemPicture"]);
});

test("a relationship offers its link, then its http(s) properties, and no drill-down", () => {
    const m = model();
    const uses = m.getRelationships().find((r) => r.id === "uses");
    const plain = m.getRelationships().find((r) => r.id === "plain");

    assert.deepEqual(labeled(relationshipTargets(m, uses, "Landscape")), [
        "link: runbooks.example.com",
        "link: Trace (trace.example.com)",
    ]);
    assert.deepEqual(relationshipTargets(m, plain, "Landscape"), []);
});

test("an element with nothing to offer has no targets", () => {
    const m = model();

    assert.deepEqual(elementTargets(m, elementOf(m, "other"), "Landscape"), []);
});

/* -------------------------------------------------- classifying the link */

const LINKS = [
    // A view in this workspace, written each way spec 6.1 names.
    ["#Containers", { kind: "view", key: "Containers" }],
    ["?view=Containers", { kind: "view", key: "Containers" }],
    ["#/?page=diagrams&view=Containers", { kind: "view", key: "Containers" }],
    [
        "https://structurizr.com/share/1234/diagrams#Containers",
        { kind: "view", key: "Containers" },
    ],
    ["{workspace}/diagrams#Containers", { kind: "view", key: "Containers" }],
    // Documentation and decisions, Structurizr's and Renderizr's own.
    [
        "https://structurizr.com/share/1234/documentation",
        { kind: "documentation", search: "page=docs" },
    ],
    [
        "{workspace}/documentation#01-overview",
        { kind: "documentation", search: "page=docs&section=01-overview" },
    ],
    [
        "#/?page=docs&section=01-overview",
        { kind: "documentation", search: "page=docs&section=01-overview" },
    ],
    [
        "https://structurizr.com/share/1234/decisions#4",
        { kind: "decisions", search: "page=adrs&adr=4" },
    ],
    ["?page=adrs&adr=4", { kind: "decisions", search: "page=adrs&adr=4" }],
    // Anything else opens in a new tab.
    [
        "https://example.com/a/b",
        { kind: "link", url: "https://example.com/a/b" },
    ],
    [
        "mailto:team@example.com",
        { kind: "link", url: "mailto:team@example.com" },
    ],
    ["docs/readme.md", { kind: "link", url: "docs/readme.md" }],
    // Only Structurizr's own pages are this workspace's, wherever the path.
    [
        "https://github.com/org/repo/tree/main/decisions",
        {
            kind: "link",
            url: "https://github.com/org/repo/tree/main/decisions",
        },
    ],
    [
        "https://example.com/documentation#01-overview",
        { kind: "link", url: "https://example.com/documentation#01-overview" },
    ],
    [
        "https://example.com/team/diagrams#Containers",
        { kind: "link", url: "https://example.com/team/diagrams#Containers" },
    ],
    [
        "https://acme.structurizr.com/workspace/1/diagrams#Containers",
        { kind: "view", key: "Containers" },
    ],
    [
        "https://structurizr.com.example.com/share/1/diagrams#Containers",
        {
            kind: "link",
            url: "https://structurizr.com.example.com/share/1/diagrams#Containers",
        },
    ],
    // Nowhere to go: no such view, or a script.
    ["#NoSuchView", undefined],
    ["javascript:alert(1)", undefined],
    ["data:text/html,hi", undefined],
    ["", undefined],
];

for (const [url, expected] of LINKS) {
    test(`the element link ${JSON.stringify(url)} is classified as ${expected?.kind ?? "nothing"}`, () => {
        const target = classifyLink(model(), url);
        if (expected === undefined) {
            assert.equal(target, undefined);
            return;
        }
        for (const [field, value] of Object.entries(expected)) {
            assert.equal(target?.[field], value, `${field} of ${url}`);
        }
    });
}

test("links to documentation or decisions a workspace does not have open as ordinary links", () => {
    const json = workspace();
    json.documentation = {};
    const target = classifyLink(
        model(json),
        "https://structurizr.com/share/1234/decisions#4",
    );

    assert.equal(target?.kind, "link");
});

test("documentation and decisions are labeled by what they are", () => {
    const m = model();

    assert.equal(
        classifyLink(m, "{workspace}/documentation").label,
        "Documentation",
    );
    assert.equal(classifyLink(m, "{workspace}/decisions").label, "Decisions");
    assert.equal(
        classifyLink(m, "#Containers").label,
        "Container View: System",
    );
    assert.equal(
        classifyLink(m, "mailto:team@example.com").label,
        "mailto:team@example.com",
        "a link with no host is labeled with itself",
    );
});

/* ------------------------------------------------------- Mermaid nodes */

test("a Mermaid node's link offers what an element link would, from the view on screen", () => {
    const m = model();
    const cases = [
        ["a URL", "https://example.com/shop", ["link: example.com"]],
        ["a view by hash", "#Context", ["view: System in context"]],
        [
            "a view under the workspace's address",
            "{workspace}/diagrams#Containers",
            ["view: Container View: System"],
        ],
        ["the view on screen", "#Landscape", []],
        ["the view on screen by route", "?view=Landscape", []],
        ["a view the workspace lacks", "#Nowhere", []],
        ["a script", "javascript:alert(1)", []],
        ["no link", undefined, []],
    ];
    for (const [name, link, expected] of cases) {
        assert.deepEqual(
            labeled(mermaidNodeTargets(m, link, "Landscape")),
            expected,
            name,
        );
    }
});

/* ------------------------------------------------- crossing workspaces */

/**
 * The landscape scoped workspace of a set (ADR 26), with the crossings the
 * set loader records for its software systems: one per element link into
 * another workspace of the set, and one per name match the link didn't
 * already reach.
 */
const landscape = () => ({
    name: "Acme",
    configuration: { scope: "Landscape" },
    model: {
        softwareSystems: [
            { id: "orders", name: "Orders", url: "{workspace:0}/diagrams" },
            {
                id: "payments",
                name: "Payments",
                url: "{workspace:0}/diagrams#Containers",
            },
            {
                id: "storefront",
                name: "Storefront",
                url: "https://teams.example.com/storefront/workspace.json",
            },
            { id: "billing", name: "Billing", url: "{workspace:7}/diagrams" },
            { id: "shipping", name: "Shipping" },
            {
                id: "ledger",
                name: "Ledger",
                url: "https://teams.example.com/ledger/workspace.json",
            },
            {
                id: "docs",
                name: "Docs",
                url: "{workspace:3}/documentation#overview",
            },
        ],
    },
    views: {
        systemLandscapeViews: [{ key: "Landscape", elements: [] }],
        systemContextViews: [
            { key: "Shipping", softwareSystemId: "shipping", elements: [] },
        ],
        configuration: {},
    },
});

const SET = {
    workspaces: [
        { slug: "orders", name: "Orders" },
        { slug: "payments", name: "Payments" },
        { slug: "storefront", name: "Storefront" },
        { slug: "shipping", name: "Shipping" },
        { slug: "docs", name: "Docs" },
    ],
    crossings: [
        {
            element: "orders",
            slug: "orders",
            via: "workspace-link",
            url: "{workspace:0}/diagrams",
        },
        {
            element: "payments",
            slug: "payments",
            via: "workspace-link",
            url: "{workspace:0}/diagrams#Containers",
        },
        {
            element: "storefront",
            slug: "storefront",
            via: "followed-link",
            url: "https://teams.example.com/storefront/workspace.json",
        },
        { element: "shipping", slug: "shipping", via: "name" },
        {
            element: "docs",
            slug: "docs",
            via: "workspace-link",
            url: "{workspace:3}/documentation#overview",
        },
    ],
};

const inSet = (json = landscape(), set = SET) => new WorkspaceModel(json, set);

/** What activating the element `id` of `m` offers, from the landscape. */
const offered = (m, id) =>
    elementTargets(m, elementOf(m, id), "Landscape").map((target) =>
        target.kind === "workspace"
            ? {
                  kind: target.kind,
                  slug: target.slug,
                  label: target.label,
                  landing: target.landing,
              }
            : `${target.kind}: ${target.label}`,
    );

test("a {workspace:N} link with a view key crosses into its workspace at that view", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "payments"), [
        {
            kind: "workspace",
            slug: "payments",
            label: "Payments",
            landing: { view: "Containers" },
        },
    ]);
});

test("a {workspace:N} link with no view key crosses into its workspace's default view", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "orders"), [
        {
            kind: "workspace",
            slug: "orders",
            label: "Orders",
            landing: null,
        },
    ]);
});

test("a {workspace:N} link to its documentation crosses into that page", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "docs"), [
        {
            kind: "workspace",
            slug: "docs",
            label: "Docs",
            landing: { page: "documentation", id: "overview" },
        },
    ]);
});

test("a raw-file link the build followed crosses into its workspace's default view", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "storefront"), [
        {
            kind: "workspace",
            slug: "storefront",
            label: "Storefront",
            landing: null,
        },
    ]);
});

test("a raw-file link the build didn't follow stays an ordinary link, labeled by its host", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "ledger"), ["link: teams.example.com"]);
});

test("a software system named after a workspace of the set crosses into it, ahead of its drill-down", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "shipping"), [
        {
            kind: "workspace",
            slug: "shipping",
            label: "Shipping",
            landing: null,
        },
        "view: System Context View: Shipping",
    ]);
});

test("an element link and a name match to one workspace collapse into one target, in the link's position", () => {
    const json = landscape();
    json.model.softwareSystems[4].url = "https://example.com/shipping";
    const m = inSet(json, {
        ...SET,
        crossings: [
            {
                element: "payments",
                slug: "payments",
                via: "workspace-link",
                url: "{workspace:0}/diagrams#Containers",
            },
            { element: "payments", slug: "payments", via: "name" },
            { element: "shipping", slug: "shipping", via: "name" },
        ],
    });
    assert.deepEqual(
        offered(m, "payments").map((target) => target.slug),
        ["payments"],
    );
    assert.deepEqual(offered(m, "shipping"), [
        "link: example.com",
        {
            kind: "workspace",
            slug: "shipping",
            label: "Shipping",
            landing: null,
        },
        "view: System Context View: Shipping",
    ]);
});

test("a {workspace:N} link that matches no workspace gives the element no target", () => {
    const m = inSet();
    assert.deepEqual(offered(m, "billing"), []);
    assert.equal(
        classifyLink(m, "{workspace:7}/diagrams", "billing"),
        undefined,
    );
    assert.equal(
        classifyLink(m, "{workspace:0}/diagrams"),
        undefined,
        "a link no element of the set carries leads nowhere",
    );
});

test("a lone workspace's {workspace:N} links lead nowhere", () => {
    assert.equal(classifyLink(model(), "{workspace:12}/diagrams"), undefined);
});

test("links that name no workspace resolve against the workspace that carries them", () => {
    const m = inSet();
    for (const link of [
        "{workspace}/diagrams#Landscape",
        "https://structurizr.com/share/1/diagrams#Landscape",
        "#Landscape",
        "?view=Landscape",
        "#/?page=diagrams&view=Landscape",
    ]) {
        assert.deepEqual(
            classifyLink(m, link, "orders"),
            { kind: "view", key: "Landscape", label: "System Landscape View" },
            link,
        );
    }
});

test("an authored full trail crosses along the trail it names", () => {
    const m = inSet();
    assert.deepEqual(
        classifyLink(m, "#/orders/payments/?page=diagrams&view=Containers"),
        {
            kind: "workspace",
            slug: "payments",
            label: "Payments",
            landing: { view: "Containers" },
            trail: ["orders", "payments"],
        },
    );
    assert.deepEqual(classifyLink(m, "#/orders/"), {
        kind: "workspace",
        slug: "orders",
        label: "Orders",
        landing: null,
        trail: ["orders"],
    });
    assert.deepEqual(classifyLink(m, "#/orders/?page=adrs&adr=4"), {
        kind: "workspace",
        slug: "orders",
        label: "Orders",
        landing: { page: "decisions", id: "4" },
        trail: ["orders"],
    });
    assert.equal(
        classifyLink(m, "#/orders/billing/"),
        undefined,
        "a trail through a workspace the set lacks leads nowhere",
    );
});

test("a relationship's {workspace:N} link leads nowhere, since no element carries it", () => {
    const json = landscape();
    json.model.softwareSystems[0].relationships = [
        {
            id: "pays",
            sourceId: "orders",
            destinationId: "payments",
            url: "{workspace:0}/diagrams",
        },
    ];
    const m = inSet(json);
    const pays = m.getRelationships().find((r) => r.id === "pays");
    assert.deepEqual(relationshipTargets(m, pays, "Landscape"), []);
});

/* ---------------------------------------------------- where it lands */

test("a crossing's landing is the address it pushes", () => {
    assert.equal(landingSearch(null), "page=diagrams");
    assert.equal(
        landingSearch({ view: "Containers" }),
        "page=diagrams&view=Containers",
    );
    assert.equal(
        landingSearch({ page: "documentation", id: "overview" }),
        "page=docs&section=overview",
    );
    assert.equal(landingSearch({ page: "decisions", id: "" }), "page=adrs");
});

test("a landing the target workspace lacks is named, so the reader is told", () => {
    const m = model();
    assert.equal(missingLanding(m, null), null);
    assert.equal(missingLanding(m, { view: "Containers" }), null);
    assert.equal(missingLanding(m, { view: "Deployment" }), "view Deployment");
    assert.equal(
        missingLanding(m, { page: "documentation", id: "nowhere" }),
        null,
        "the documentation opens where it can",
    );
    const bare = workspace();
    bare.documentation = {};
    assert.equal(
        missingLanding(model(bare), { page: "documentation", id: "" }),
        "documentation",
    );
    assert.equal(
        missingLanding(model(bare), { page: "decisions", id: "4" }),
        "decisions",
    );
});
