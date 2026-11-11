/**
 * Documentation scopes, from `src/model/documentation.ts` (spec 316, ADR 30):
 * the workspace, each software system, container and component with the
 * sections and decisions it carries, in model order, each with the slug path
 * its documents are addressed by. And the one slug rule that names every
 * element in an address, from `src/model/slug.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { documentationScopes, slugCollisions, slugOf } = await importSrc(
    "model/documentation",
);

const fixture = (name) =>
    JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${name}.json`, import.meta.url),
            "utf-8",
        ),
    );

const section = (title) => ({
    id: title,
    title,
    content: `# ${title}`,
    filename: `${title}.md`,
    format: "Markdown",
    order: 1,
});

const decision = (id) => ({
    id,
    title: `Decision ${id}`,
    content: "",
    format: "Markdown",
    date: "2026-01-01T00:00:00Z",
    status: "Accepted",
    links: [],
});

/** Documentation carrying `sections` titled and `decisions` numbered. */
const docs = (sections = [], decisions = []) => ({
    sections: sections.map(section),
    decisions: decisions.map(decision),
});

/** A workspace whose model holds `softwareSystems`. */
const workspace = (softwareSystems, documentation) => ({
    name: "Workspace",
    documentation,
    model: { softwareSystems },
});

/** The scopes of `json` as `[type, path, parent, depth]`. */
const outline = (json) =>
    documentationScopes(json).map(({ type, path, parent, depth }) => [
        type,
        path,
        parent,
        depth,
    ]);

/* -------------------------------------------------------------- the rule */

test("a slug drops accents and keeps the letters of every script", () => {
    const SLUGS = [
        ["Internet Banking System", "internet-banking-system"],
        ["Café Crème", "cafe-creme"],
        ["Café Système", "cafe-systeme"],
        ["Straße", "straße"],
        ["Ørsted Æble", "ørsted-æble"],
        ["日本 支払い", "日本-支払い"],
        ["Платежи", "платежи"],
        ["ﬁle", "file"],
        ["CRM2Go", "crm2go"],
        ["Ⅻ Legion", "xii-legion"],
    ];
    for (const [name, slug] of SLUGS) assert.equal(slugOf(name), slug, name);
});

test("a slug turns every run of other characters into one hyphen and trims them", () => {
    const SLUGS = [
        ["  API / Gateway  ", "api-gateway"],
        ["Sign-In -- Controller!", "sign-in-controller"],
        ["...Orders___v2...", "orders-v2"],
        ["a b\tc", "a-b-c"],
        ["🚀 Launch 🚀", "launch"],
    ];
    for (const [name, slug] of SLUGS) assert.equal(slugOf(name), slug, name);
});

/* -------------------------------------------------------------- the scopes */

test("a workspace whose elements carry nothing has only its own scope", () => {
    const json = workspace(
        [{ id: "1", name: "Orders", containers: [{ id: "2", name: "API" }] }],
        docs(["Context"], ["1"]),
    );
    assert.deepEqual(outline(json), [["Workspace", "", null, 0]]);
    const [scope] = documentationScopes(json);
    assert.equal(scope.elementId, null);
    assert.equal(scope.sections.length, 1);
    assert.equal(scope.decisions.length, 1);
});

test("a workspace with no documentation anywhere has no scopes", () => {
    assert.deepEqual(documentationScopes(fixture("big-bank-plc")), []);
    assert.deepEqual(documentationScopes({}), []);
});

test("the scopes follow model order: the workspace, then each software system, its containers and their components", () => {
    const json = workspace(
        [
            {
                id: "1",
                name: "Orders",
                documentation: docs(["Orders"]),
                containers: [
                    {
                        id: "2",
                        name: "Orders API",
                        documentation: docs([], ["1"]),
                        components: [
                            {
                                id: "3",
                                name: "Checkout",
                                documentation: docs(["Checkout"]),
                            },
                        ],
                    },
                    {
                        id: "4",
                        name: "Orders DB",
                        documentation: docs(["Schema"]),
                    },
                ],
            },
            { id: "5", name: "Payments", documentation: docs([], ["1"]) },
        ],
        docs(["Overview"]),
    );
    assert.deepEqual(outline(json), [
        ["Workspace", "", null, 0],
        ["Software System", "orders", null, 0],
        ["Container", "orders/orders-api", "orders", 1],
        ["Component", "orders/orders-api/checkout", "orders/orders-api", 2],
        ["Container", "orders/orders-db", "orders", 1],
        ["Software System", "payments", null, 0],
    ]);
    const scopes = documentationScopes(json);
    assert.deepEqual(
        scopes.map((scope) => scope.elementId),
        [null, "1", "2", "3", "4", "5"],
    );
    assert.deepEqual(scopes[3].names, ["Orders", "Orders API", "Checkout"]);
    assert.equal(scopes[3].name, "Checkout");
});

test("a scope whose parent carries nothing hangs from the nearest ancestor that does", () => {
    const json = workspace([
        {
            id: "1",
            name: "Orders",
            documentation: docs(["Orders"]),
            containers: [
                {
                    id: "2",
                    name: "API",
                    components: [
                        {
                            id: "3",
                            name: "Checkout",
                            documentation: docs([], ["1"]),
                        },
                    ],
                },
            ],
        },
        {
            id: "4",
            name: "Payments",
            containers: [
                {
                    id: "5",
                    name: "Ledger",
                    components: [
                        {
                            id: "6",
                            name: "Posting",
                            documentation: docs(["Posting"]),
                        },
                    ],
                },
            ],
        },
    ]);
    // The workspace carries nothing, so it is no scope; each path still
    // names every element from the software system down.
    assert.deepEqual(outline(json), [
        ["Software System", "orders", null, 0],
        ["Component", "orders/api/checkout", "orders", 1],
        ["Component", "payments/ledger/posting", null, 0],
    ]);
});

test("an element's scope carries its own images", () => {
    const image = { name: "context.png", type: "image/png", content: "AA==" };
    const [scope] = documentationScopes(
        workspace([
            {
                id: "1",
                name: "Orders",
                documentation: { ...docs(["Orders"]), images: [image] },
            },
        ]),
    );
    assert.deepEqual(scope.images, [image]);
});

test("the element documentation fixture holds five scopes and nine decisions", () => {
    const json = fixture("element-documentation");
    assert.deepEqual(outline(json), [
        ["Workspace", "", null, 0],
        ["Software System", "internet-banking-system", null, 0],
        [
            "Container",
            "internet-banking-system/api-application",
            "internet-banking-system",
            1,
        ],
        [
            "Component",
            "internet-banking-system/api-application/sign-in-controller",
            "internet-banking-system/api-application",
            2,
        ],
        [
            "Container",
            "internet-banking-system/mobile-app",
            "internet-banking-system",
            1,
        ],
    ]);
    const scopes = documentationScopes(json);
    assert.equal(
        scopes.reduce((sum, scope) => sum + scope.decisions.length, 0),
        9,
    );
    assert.equal(scopes.filter((scope) => scope.decisions.length).length, 4);
});

test("Big Bank keeps all of its documentation on Internet Banking System", () => {
    const scopes = documentationScopes(fixture("big-bank-plc-stored"));
    assert.ok(scopes.length > 0);
    assert.ok(scopes.every((scope) => scope.type !== "Workspace"));
    assert.ok(scopes.some((scope) => scope.sections.length));
    assert.ok(scopes.some((scope) => scope.decisions.length));
});

/* ------------------------------------------------------------- collisions */

test("the later of two siblings that slug the same takes -2, the next -3", () => {
    const json = workspace([
        {
            id: "1",
            name: "Orders",
            containers: [
                { id: "2", name: "API", documentation: docs(["A"]) },
                { id: "3", name: "Api", documentation: docs(["B"]) },
                { id: "4", name: "A.P.I.", documentation: docs([]) },
                { id: "5", name: "a p i", documentation: docs(["C"]) },
                { id: "6", name: "A-P-I", documentation: docs(["D"]) },
            ],
        },
        { id: "7", name: "Orders!", documentation: docs(["E"]) },
    ]);
    assert.deepEqual(
        documentationScopes(json).map((scope) => scope.path),
        [
            "orders/api",
            "orders/api-2",
            // A.P.I. carries nothing and still takes a-p-i.
            "orders/a-p-i-2",
            "orders/a-p-i-3",
            "orders-2",
        ],
    );
});

test("a sibling that carries nothing still takes its place in model order", () => {
    const json = workspace([
        { id: "1", name: "Orders" },
        { id: "2", name: "orders", documentation: docs(["Orders"]) },
    ]);
    assert.deepEqual(
        documentationScopes(json).map((scope) => scope.path),
        ["orders-2"],
    );
});

test("a suffix never lands on a sibling's own slug", () => {
    const json = workspace([
        { id: "1", name: "Orders", documentation: docs(["A"]) },
        { id: "2", name: "Orders 2", documentation: docs(["B"]) },
        { id: "3", name: "Orders", documentation: docs(["C"]) },
    ]);
    assert.deepEqual(
        documentationScopes(json).map((scope) => scope.path),
        ["orders", "orders-2", "orders-3"],
    );
});

test("elements under different parents may share a slug", () => {
    const json = workspace([
        {
            id: "1",
            name: "Orders",
            containers: [{ id: "2", name: "API", documentation: docs(["A"]) }],
        },
        {
            id: "3",
            name: "Payments",
            containers: [{ id: "4", name: "API", documentation: docs(["B"]) }],
        },
    ]);
    assert.deepEqual(
        documentationScopes(json).map((scope) => scope.path),
        ["orders/api", "payments/api"],
    );
    assert.deepEqual(slugCollisions(json), []);
});

test("a collision that reaches a documentation scope is named for the author", () => {
    const json = workspace([
        {
            id: "1",
            name: "Orders",
            containers: [
                { id: "2", name: "API", documentation: docs(["A"]) },
                {
                    id: "3",
                    name: "Api",
                    components: [
                        {
                            id: "4",
                            name: "Checkout",
                            documentation: docs(["B"]),
                        },
                    ],
                },
            ],
        },
    ]);
    assert.deepEqual(slugCollisions(json), [
        {
            parent: "orders",
            slug: "api",
            names: ["API", "Api"],
            paths: ["orders/api", "orders/api-2"],
        },
    ]);
});

test("a collision that reaches no documentation scope changes nothing the author sees", () => {
    const json = workspace(
        [
            { id: "1", name: "Orders" },
            { id: "2", name: "orders" },
        ],
        docs(["Overview"]),
    );
    assert.deepEqual(slugCollisions(json), []);
    assert.deepEqual(slugCollisions(fixture("element-documentation")), []);
});
