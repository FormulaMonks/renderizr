/**
 * `classifyLink` in `src/model/targets.ts`: element links, and Mermaid
 * flowchart nodes' links, that name an element's documents lead to them
 * (spec: _Element links and links between documents_). Structurizr's
 * `{workspace}/documentation/<name>…#<section>` and
 * `{workspace}/decisions/<path>#<id>` and Renderizr's own routes with a slug
 * path all land on the documentation scope they name.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, classifyLink, mermaidNodeTargets } =
    await importSrc("model/index");

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
 * Documentation on the workspace, a software system, two of its containers
 * and a component, and a software system that carries none.
 */
const workspace = () => ({
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
                documentation: {
                    // Written out of order: the scope's first is by `order`.
                    sections: [
                        section("02-containers.md", 2),
                        section("01-context.md", 1),
                    ],
                    decisions: [
                        decision("1", "2024-01-01"),
                        decision("2", "2025-01-01"),
                    ],
                },
                containers: [
                    {
                        id: "api",
                        name: "API Application",
                        documentation: {
                            sections: [section("01-overview.md", 1)],
                            decisions: [decision("1", "2024-06-01")],
                        },
                        components: [
                            {
                                id: "signin",
                                name: "Sign In Controller",
                                documentation: {
                                    sections: [section("01-sign-in.md", 1)],
                                },
                            },
                        ],
                    },
                    {
                        id: "mobile",
                        name: "Mobile App",
                        documentation: {
                            sections: [section("01-mobile.md", 1)],
                        },
                    },
                ],
            },
            { id: "mainframe", name: "Mainframe Banking System" },
        ],
    },
    views: {
        systemLandscapeViews: [{ key: "Landscape", elements: [] }],
        configuration: {},
    },
});

const model = (json = workspace()) => new WorkspaceModel(json);

/** Where `url` leads: its kind and query, or `undefined` for nowhere. */
const leads = (m, url) => {
    const target = classifyLink(m, url);
    return target && `${target.kind} ${target.search ?? target.url}`;
};

const check = (cases, m = model()) => {
    for (const [url, expected] of cases)
        assert.equal(leads(m, url), expected, url);
};

test("Structurizr's documentation link names an element's documentation scope by name path", () => {
    check([
        [
            "{workspace}/documentation/Internet%20Banking%20System#02-containers",
            "documentation page=docs&section=internet-banking-system/02-containers",
        ],
        [
            "{workspace}/documentation/Internet Banking System/API Application#01-overview",
            "documentation page=docs&section=internet-banking-system/api-application/01-overview",
        ],
        [
            "{workspace}/documentation/Internet%20Banking%20System/API%20Application/Sign%20In%20Controller#01-sign-in",
            "documentation page=docs&section=internet-banking-system/api-application/sign-in-controller/01-sign-in",
        ],
        [
            "https://structurizr.com/share/1234/documentation/Internet%20Banking%20System#01-context",
            "documentation page=docs&section=internet-banking-system/01-context",
        ],
    ]);
});

test("names match ignoring case", () => {
    check([
        [
            "{workspace}/documentation/internet banking system/API APPLICATION#01-overview",
            "documentation page=docs&section=internet-banking-system/api-application/01-overview",
        ],
        [
            "{workspace}/decisions/INTERNET%20banking%20System#1",
            "decisions page=adrs&adr=internet-banking-system/1",
        ],
    ]);
});

test("Structurizr's decisions link names an element's documentation scope by name path", () => {
    check([
        [
            "{workspace}/decisions/Internet%20Banking%20System#2",
            "decisions page=adrs&adr=internet-banking-system/2",
        ],
        [
            "{workspace}/decisions/Internet Banking System/API Application#1",
            "decisions page=adrs&adr=internet-banking-system/api-application/1",
        ],
        [
            "https://structurizr.com/share/1234/decisions/Internet%20Banking%20System/API%20Application#1",
            "decisions page=adrs&adr=internet-banking-system/api-application/1",
        ],
    ]);
});

test("the workspace's own documents keep their addresses, with no name or with *", () => {
    check([
        [
            "{workspace}/documentation#01-about",
            "documentation page=docs&section=01-about",
        ],
        [
            "{workspace}/documentation/*#01-about",
            "documentation page=docs&section=01-about",
        ],
        ["{workspace}/decisions#1", "decisions page=adrs&adr=1"],
        ["{workspace}/decisions/%2A#1", "decisions page=adrs&adr=1"],
    ]);
});

test("Renderizr's own routes carry the slug path in the document's id", () => {
    check([
        [
            "#/?page=docs&section=internet-banking-system/api-application/01-overview",
            "documentation page=docs&section=internet-banking-system/api-application/01-overview",
        ],
        [
            "?page=docs&section=internet-banking-system%2F01-context",
            "documentation page=docs&section=internet-banking-system/01-context",
        ],
        [
            "#/?page=adrs&adr=internet-banking-system/2",
            "decisions page=adrs&adr=internet-banking-system/2",
        ],
        [
            "#/?page=adrs&adr=internet-banking-system/api-application/1",
            "decisions page=adrs&adr=internet-banking-system/api-application/1",
        ],
        ["#/?page=adrs&adr=1", "decisions page=adrs&adr=1"],
    ]);
});

test("a route to the decisions keeps a filter that names a documentation scope", () => {
    check([
        [
            "#/?page=adrs&filter=internet-banking-system/api-application",
            "decisions page=adrs&filter=internet-banking-system/api-application",
        ],
        ["#/?page=adrs&filter=*", "decisions page=adrs&filter=*"],
        // Mobile App carries no decisions, and nobody answers to the rest.
        [
            "#/?page=adrs&filter=internet-banking-system/mobile-app",
            "decisions page=adrs",
        ],
        ["#/?page=adrs&filter=nobody", "decisions page=adrs"],
    ]);
});

test("an unknown section or decision in a known documentation scope opens that scope's first", () => {
    check([
        [
            "{workspace}/documentation/Internet Banking System#no-such-section",
            "documentation page=docs&section=internet-banking-system/01-context",
        ],
        [
            "{workspace}/documentation/Internet Banking System",
            "documentation page=docs&section=internet-banking-system/01-context",
        ],
        [
            "#/?page=docs&section=internet-banking-system/no-such-section",
            "documentation page=docs&section=internet-banking-system/01-context",
        ],
        // The decisions page lists newest first, so its first is the newest.
        [
            "{workspace}/decisions/Internet Banking System#9",
            "decisions page=adrs&adr=internet-banking-system/2",
        ],
        [
            "#/?page=adrs&adr=internet-banking-system/api-application/9",
            "decisions page=adrs&adr=internet-banking-system/api-application/1",
        ],
        // The workspace's own still open the page, as they always did.
        [
            "{workspace}/documentation#no-such-section",
            "documentation page=docs",
        ],
        ["#/?page=adrs&adr=9", "decisions page=adrs"],
    ]);
});

test("an unknown element opens the page's landing", () => {
    check([
        [
            "{workspace}/documentation/Nobody#01-context",
            "documentation page=docs",
        ],
        [
            "{workspace}/documentation/Internet Banking System/Nobody#01-overview",
            "documentation page=docs",
        ],
        ["#/?page=docs&section=nobody/01-context", "documentation page=docs"],
        [
            "#/?page=docs&section=internet-banking-system/nobody/01-overview",
            "documentation page=docs",
        ],
        ["{workspace}/decisions/Nobody#1", "decisions page=adrs"],
        // An element that carries none of what the link names.
        [
            "{workspace}/documentation/Mainframe Banking System#01-context",
            "documentation page=docs",
        ],
        [
            "{workspace}/decisions/Internet Banking System/Mobile App#1",
            "decisions page=adrs",
        ],
        [
            "#/?page=adrs&adr=internet-banking-system/mobile-app/1",
            "decisions page=adrs",
        ],
    ]);
});

test("a workspace whose documents sit only on elements still opens the page", () => {
    const json = workspace();
    delete json.documentation;
    check(
        [
            ["{workspace}/documentation#01-about", "documentation page=docs"],
            ["{workspace}/decisions/*#1", "decisions page=adrs"],
            [
                "{workspace}/decisions/Internet Banking System#1",
                "decisions page=adrs&adr=internet-banking-system/1",
            ],
        ],
        model(json),
    );
});

test("a workspace with no documentation or no decisions in any scope makes the link lead nowhere", () => {
    const json = workspace();
    delete json.documentation;
    delete json.model.softwareSystems[0].documentation.decisions;
    delete json.model.softwareSystems[0].containers[0].documentation.decisions;
    const m = model(json);
    check(
        [
            ["{workspace}/decisions/Internet Banking System#1", undefined],
            ["#/?page=adrs&adr=internet-banking-system/1", undefined],
            // Structurizr's own page opens there, like any link.
            [
                "https://structurizr.com/share/1/decisions/Internet%20Banking%20System#1",
                "link https://structurizr.com/share/1/decisions/Internet%20Banking%20System#1",
            ],
            // The documentation still leads where it did.
            [
                "{workspace}/documentation/Mobile App#01-mobile",
                "documentation page=docs",
            ],
        ],
        m,
    );

    const bare = { name: "Bare", model: {}, views: { configuration: {} } };
    check(
        [
            ["{workspace}/documentation/Internet Banking System#x", undefined],
            ["#/?page=docs&section=internet-banking-system/x", undefined],
        ],
        model(bare),
    );
});

test("the fixture's element links lead to the documents they name", async () => {
    const { readFile } = await import("node:fs/promises");
    const json = JSON.parse(
        await readFile(
            new URL(
                "./__fixtures__/element-documentation.json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    const m = model(json);
    const linkOf = (id) => {
        const element = m.findElementById(id);
        return leads(m, element.url);
    };

    assert.equal(
        linkOf("4"),
        "documentation page=docs&section=internet-banking-system/api-application/02-operations",
        "Mainframe Banking System",
    );
    assert.equal(
        linkOf("5"),
        "decisions page=adrs&adr=internet-banking-system/api-application/sign-in-controller/1",
        "E-mail System",
    );
    assert.equal(
        linkOf("27"),
        "decisions page=adrs&adr=internet-banking-system/3",
        "Database",
    );
});

test("a Mermaid flowchart node's link leads to an element's documents the same way", () => {
    const m = model();
    const targets = (link) =>
        mermaidNodeTargets(m, link, "Landscape").map(
            ({ kind, search }) => `${kind} ${search}`,
        );
    assert.deepEqual(
        targets(
            "{workspace}/documentation/Internet%20Banking%20System#01-context",
        ),
        ["documentation page=docs&section=internet-banking-system/01-context"],
    );
    assert.deepEqual(
        targets("#/?page=adrs&adr=internet-banking-system/api-application/1"),
        ["decisions page=adrs&adr=internet-banking-system/api-application/1"],
    );
    assert.deepEqual(targets("{workspace}/decisions/Nobody#1"), [
        "decisions page=adrs",
    ]);
});
