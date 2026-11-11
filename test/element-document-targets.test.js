/**
 * `elementTargets` in `src/model/targets.ts`: elements that carry their own
 * documentation or decisions offer them as activation targets, and
 * instances offer what they instantiate (spec: _Activation targets_).
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, elementTargets } = await importSrc("model/index");

const section = (filename, order) => ({
    filename,
    order,
    title: "",
    content: `# ${filename}`,
    format: "Markdown",
});

const decision = (id, date) => ({
    id,
    date,
    title: `Decision ${id}`,
    status: "Accepted",
    content: "",
    format: "Markdown",
});

/**
 * Documentation on the workspace, a software system, a container and a
 * component that carries sections only, beside a container and a software
 * system that carry none.
 */
const workspace = (urls = {}) => ({
    name: "Bank",
    documentation: {
        sections: [section("01-about.md", 1)],
        decisions: [decision("1", "2024-01-01")],
    },
    model: {
        softwareSystems: [
            {
                id: "ibs",
                name: "Internet Banking System",
                url: urls.ibs ?? "https://github.com/example/ibs",
                properties: { Wiki: "https://wiki.example.com/ibs" },
                documentation: {
                    sections: [
                        section("02-containers.md", 2),
                        section("01-context.md", 1),
                    ],
                    decisions: [decision("1", "2024-01-01")],
                },
                containers: [
                    {
                        id: "api",
                        name: "API Application",
                        url: urls.api,
                        documentation: {
                            sections: [
                                section("01-overview.md", 1),
                                section("02-operations.md", 2),
                            ],
                            decisions: [
                                decision("1", "2024-06-01"),
                                decision("2", "2024-07-01"),
                            ],
                        },
                        components: [
                            {
                                id: "signin",
                                name: "Sign In Controller",
                                url: urls.signin,
                                documentation: {
                                    sections: [section("01-sign-in.md", 1)],
                                },
                            },
                        ],
                    },
                    { id: "web", name: "Web Application" },
                ],
            },
            {
                id: "mainframe",
                name: "Mainframe Banking System",
                url: urls.mainframe,
            },
        ],
        deploymentNodes: [
            {
                id: "node",
                name: "Node",
                environment: "Live",
                containerInstances: [
                    { id: "api-1", containerId: "api", environment: "Live" },
                    { id: "web-1", containerId: "web", environment: "Live" },
                ],
                softwareSystemInstances: [
                    { id: "ibs-1", softwareSystemId: "ibs" },
                ],
            },
        ],
    },
    views: {
        systemLandscapeViews: [{ key: "Landscape", elements: [] }],
        containerViews: [
            { key: "Containers", softwareSystemId: "ibs", elements: [] },
        ],
        deploymentViews: [{ key: "Live", environment: "Live", elements: [] }],
        imageViews: [
            { key: "Picture", title: "IBS picture", elementId: "ibs" },
        ],
        configuration: {},
    },
});

/** What activating `id` offers from the landscape: kind, label and where. */
const offers = (id, urls) => {
    const m = new WorkspaceModel(workspace(urls));
    return elementTargets(m, m.findElementById(id), "Landscape").map(
        (t) => `${t.kind}: ${t.label} ${t.search ?? t.key ?? t.url}`,
    );
};

test("an element offers its documentation and decisions after its image views and before its properties", () => {
    assert.deepEqual(offers("ibs"), [
        "link: github.com https://github.com/example/ibs",
        "view: Container View: Internet Banking System Containers",
        "view: IBS picture Picture",
        "documentation: Documentation page=docs&section=internet-banking-system/01-context",
        "decisions: Decisions page=adrs&filter=internet-banking-system",
        "link: Wiki (wiki.example.com) https://wiki.example.com/ibs",
    ]);
});

test("Documentation opens at the element's first section and Decisions filters the index to the element", () => {
    assert.deepEqual(offers("api"), [
        "documentation: Documentation page=docs&section=internet-banking-system/api-application/01-overview",
        "decisions: Decisions page=adrs&filter=internet-banking-system/api-application",
    ]);
});

test("an element link to another documentation scope's page names it after a middle dot", () => {
    assert.deepEqual(
        offers("api", { api: "{workspace}/documentation#01-about" }),
        [
            "documentation: Documentation · Workspace page=docs&section=01-about",
            "documentation: Documentation page=docs&section=internet-banking-system/api-application/01-overview",
            "decisions: Decisions page=adrs&filter=internet-banking-system/api-application",
        ],
    );
    assert.deepEqual(
        offers("signin", {
            signin: "{workspace}/decisions/Internet Banking System#1",
        }),
        [
            "decisions: Decisions · Internet Banking System page=adrs&adr=internet-banking-system/1",
            "documentation: Documentation page=docs&section=internet-banking-system/api-application/sign-in-controller/01-sign-in",
        ],
    );
});

test("an element link to the element's own documentation scope merges with its own target", () => {
    assert.deepEqual(
        offers("api", {
            api: "{workspace}/documentation/Internet Banking System/API Application#02-operations",
        }),
        [
            "documentation: Documentation page=docs&section=internet-banking-system/api-application/02-operations",
            "decisions: Decisions page=adrs&filter=internet-banking-system/api-application",
        ],
    );
    assert.deepEqual(
        offers("api", {
            api: "#/?page=adrs&filter=internet-banking-system/api-application",
        }),
        [
            "decisions: Decisions page=adrs&filter=internet-banking-system/api-application",
            "documentation: Documentation page=docs&section=internet-banking-system/api-application/01-overview",
        ],
    );
});

test("an instance offers the documentation and decisions of what it instantiates", () => {
    assert.deepEqual(offers("api-1"), [
        "documentation: Documentation page=docs&section=internet-banking-system/api-application/01-overview",
        "decisions: Decisions page=adrs&filter=internet-banking-system/api-application",
    ]);
    // An instance carries the element link of what it instantiates.
    assert.deepEqual(offers("ibs-1"), [
        "link: github.com https://github.com/example/ibs",
        "view: Container View: Internet Banking System Containers",
        "documentation: Documentation page=docs&section=internet-banking-system/01-context",
        "decisions: Decisions page=adrs&filter=internet-banking-system",
    ]);
});

test("an element offers only its own documentation scope", () => {
    assert.deepEqual(offers("web"), []);
    assert.deepEqual(offers("web-1"), []);
    // The Sign In Controller carries sections only: no decisions of its
    // container's.
    assert.deepEqual(offers("signin"), [
        "documentation: Documentation page=docs&section=internet-banking-system/api-application/sign-in-controller/01-sign-in",
    ]);
});

test("an element with no documentation or decisions offers the same targets as before", () => {
    assert.deepEqual(
        offers("mainframe", {
            mainframe:
                "{workspace}/documentation/Internet Banking System#02-containers",
        }),
        [
            "documentation: Documentation page=docs&section=internet-banking-system/02-containers",
        ],
    );
    assert.deepEqual(offers("mainframe", { mainframe: "#/?page=adrs" }), [
        "decisions: Decisions page=adrs",
    ]);
});

test("the fixture's API Application draws the documentation and decisions indicators, and so does its instance", async () => {
    const { readFileSync } = await import("node:fs");
    const { buildGraph } = await importSrc("engine/react-flow/graph");
    const json = JSON.parse(
        readFileSync(
            new URL(
                "./__fixtures__/element-documentation.json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    const labels = { descriptions: true, technologies: true };
    const kinds = (view, id) =>
        buildGraph(
            new WorkspaceModel(json),
            view,
            "light",
            labels,
        ).elements.find((e) => e.id === id).targets;

    // The API Application drills down to Components first.
    assert.deepEqual(kinds("Containers", "20"), [
        "view",
        "documentation",
        "decisions",
    ]);
    assert.deepEqual(kinds("LiveDeployment", "79"), [
        "view",
        "documentation",
        "decisions",
    ]);
});
