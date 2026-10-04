/**
 * `src/model/targets.ts`: what activating an element or a relationship
 * offers the reader, in the order spec 6.1 gives, and how each destination
 * is labeled in the target menu.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, elementTargets, relationshipTargets, classifyLink } =
    await importSrc("model/index");

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
