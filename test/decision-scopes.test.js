/**
 * Decisions across documentation scopes, from `src/model/decisions.ts`
 * (spec: _The decisions page_): every scope's decisions in one list, told
 * apart by scope and id, their links kept inside their own scope, the pill
 * only while the list mixes scopes, and the filter that narrows it to one
 * scope.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { documentationScopes } = await importSrc("model/documentation");
const {
    decisionAddress,
    filterByScope,
    mixesScopes,
    scopeFilterOf,
    scopeFilterOptions,
    scopeHue,
    scopeLabel,
    scopedDecisions,
} = await importSrc("model/decisions");

const FIXTURE = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/element-documentation.json", import.meta.url),
        "utf-8",
    ),
);

const SCOPES = documentationScopes(FIXTURE);
const ALL = scopedDecisions(SCOPES);

const decision = (id, date, links = []) => ({
    id,
    title: `Decision ${id}`,
    content: "",
    format: "Markdown",
    date,
    status: "Accepted",
    links,
});

/** A workspace carrying `own` decisions, and a software system `theirs`. */
const workspace = (own, theirs) => ({
    name: "Big Bank plc",
    documentation: { decisions: own },
    model: {
        softwareSystems: [
            { id: "1", name: "Payments", documentation: { decisions: theirs } },
        ],
    },
});

/* ------------------------------------------------------- the every-scope list */

test("the list holds every documentation scope's decisions, newest first", () => {
    assert.equal(ALL.length, 9);
    assert.equal(new Set(ALL.map((d) => d.scope)).size, 4);
    const dates = ALL.map((d) => new Date(d.date).getTime());
    assert.deepEqual(
        dates,
        dates.toSorted((a, b) => b - a),
    );
    assert.deepEqual(
        ALL.slice(0, 3).map((d) => d.id),
        [
            "internet-banking-system/api-application/sign-in-controller/1",
            "internet-banking-system/4",
            "internet-banking-system/api-application/2",
        ],
    );
});

test("a scope without decisions adds nothing to the list", () => {
    const mobile = SCOPES.find((scope) => scope.name === "Mobile App");
    assert.ok(mobile, "the Mobile App carries sections");
    assert.equal(
        ALL.some((d) => d.scope === mobile),
        false,
    );
});

/* ---------------------------------------------- ids that repeat across scopes */

test("a decision is told apart by its scope's slug path and its id", () => {
    const ones = ALL.filter((d) => d.number === "1").map((d) => d.id);
    assert.deepEqual(ones.toSorted(), [
        "1",
        "internet-banking-system/1",
        "internet-banking-system/api-application/1",
        "internet-banking-system/api-application/sign-in-controller/1",
    ]);
    assert.equal(new Set(ALL.map((d) => d.id)).size, ALL.length);
});

test("the workspace's own decisions keep the id they always had", () => {
    const own = ALL.filter((d) => d.scope.type === "Workspace");
    assert.deepEqual(own.map((d) => d.id).toSorted(), ["1", "2"]);
});

test("each decision keeps its own number", () => {
    const four = ALL.find((d) => d.id === "internet-banking-system/4");
    assert.equal(four.number, "4");
});

test("a decision's address names its scope's slug path; the workspace adds nothing", () => {
    assert.equal(decisionAddress({ path: "" }, "3"), "3");
    assert.equal(
        decisionAddress({ path: "internet-banking-system" }, "3"),
        "internet-banking-system/3",
    );
});

test("on the same date, the higher number is the later decision, whatever its scope", () => {
    const list = scopedDecisions(
        documentationScopes(
            workspace(
                [decision("1", "2026-01-01T12:00:00Z")],
                [
                    decision("2", "2026-01-01T12:00:00Z"),
                    decision("1", "2026-01-01T12:00:00Z"),
                ],
            ),
        ),
    );
    assert.deepEqual(
        list.map((d) => d.id),
        ["payments/2", "1", "payments/1"],
    );
});

/* -------------------------------------------- links stay inside their scope */

test("a decision's links resolve inside its own scope", () => {
    const three = ALL.find((d) => d.id === "internet-banking-system/3");
    assert.deepEqual(
        three.links.map((link) => link.id),
        ["internet-banking-system/2"],
    );
    const amends = ALL.find(
        (d) => d.id === "internet-banking-system/api-application/2",
    );
    assert.deepEqual(
        amends.links.map((link) => link.id),
        ["internet-banking-system/api-application/1"],
    );
    const own = ALL.find((d) => d.id === "2");
    assert.deepEqual(
        own.links.map((link) => link.id),
        ["1"],
    );
});

test("a link to a decision its scope does not hold leads nowhere", () => {
    const list = scopedDecisions(
        documentationScopes(
            workspace(
                [decision("1", "2026-01-01T12:00:00Z")],
                [
                    decision("2", "2026-02-01T12:00:00Z", [
                        { id: "9", description: "References" },
                    ]),
                ],
            ),
        ),
    );
    assert.deepEqual(list.find((d) => d.id === "payments/2").links, []);
});

/* ---------------------------------------------------------------- pills */

test("the list mixes scopes until the filter narrows it to one", () => {
    assert.equal(mixesScopes(ALL), true);
    assert.equal(
        mixesScopes(filterByScope(ALL, "internet-banking-system")),
        false,
    );
    assert.equal(mixesScopes(filterByScope(ALL, "*")), false);
    assert.equal(mixesScopes([]), false);
});

test("a workspace whose decisions are all its own never mixes scopes", () => {
    const list = scopedDecisions(
        documentationScopes(
            workspace([decision("1", "2026-01-01T12:00:00Z")], []),
        ),
    );
    assert.equal(mixesScopes(list), false);
});

test("a pill names the element's scope, and the workspace's own as Workspace", () => {
    assert.deepEqual(
        SCOPES.filter((scope) => scope.decisions.length).map(scopeLabel),
        [
            "Workspace",
            "Internet Banking System",
            "API Application",
            "Sign In Controller",
        ],
    );
});

test("each scope takes a hue of its own", () => {
    const hues = SCOPES.map((scope) => scopeHue(SCOPES, scope));
    assert.equal(new Set(hues).size, hues.length);
    for (const hue of hues) assert.ok(hue >= 0 && hue < 360);
});

/* ---------------------------------------------------------------- filter */

test("the filter names a scope by its slug path, and the workspace's own as *", () => {
    assert.deepEqual(
        SCOPES.filter((scope) => scope.decisions.length).map(scopeFilterOf),
        [
            "*",
            "internet-banking-system",
            "internet-banking-system/api-application",
            "internet-banking-system/api-application/sign-in-controller",
        ],
    );
});

test("the filter keeps one scope's decisions, and no filter keeps every scope's", () => {
    assert.equal(filterByScope(ALL, null).length, 9);
    assert.deepEqual(
        filterByScope(ALL, "*").map((d) => d.id),
        ["2", "1"],
    );
    assert.deepEqual(
        filterByScope(ALL, "internet-banking-system/api-application").map(
            (d) => d.number,
        ),
        ["2", "1"],
    );
});

test("a filter no scope answers to keeps every scope's decisions", () => {
    assert.equal(filterByScope(ALL, "nowhere").length, 9);
});

test("the filter lists every scope that carries decisions, by type and count, indented by the scope tree", () => {
    assert.deepEqual(scopeFilterOptions(SCOPES), [
        { value: "", label: "All documentation scopes", depth: 0 },
        {
            value: "*",
            label: "[Workspace] Big Bank plc, documented at every scope (2)",
            depth: 0,
        },
        {
            value: "internet-banking-system",
            label: "[Software System] Internet Banking System (4)",
            depth: 0,
        },
        {
            value: "internet-banking-system/api-application",
            label: "[Container] API Application (2)",
            depth: 1,
        },
        {
            value: "internet-banking-system/api-application/sign-in-controller",
            label: "[Component] Sign In Controller (1)",
            depth: 2,
        },
    ]);
});

test("a scope whose parent carries only sections indents under the nearest one with decisions", () => {
    const json = {
        name: "W",
        model: {
            softwareSystems: [
                {
                    name: "S",
                    documentation: {
                        sections: [
                            {
                                filename: "01.md",
                                content: "",
                                format: "Markdown",
                                order: 1,
                                title: "",
                            },
                        ],
                    },
                    containers: [
                        {
                            name: "C",
                            documentation: {
                                decisions: [decision("1", "2026-01-01")],
                            },
                        },
                    ],
                },
            ],
        },
    };
    assert.deepEqual(
        scopeFilterOptions(documentationScopes(json)).map(
            ({ value, depth }) => [value, depth],
        ),
        [
            ["", 0],
            ["s/c", 0],
        ],
    );
});
