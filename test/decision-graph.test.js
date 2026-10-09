/**
 * `src/model/decision-graph.ts`: the decision graph's layout, pure and without
 * a DOM. It puts the decisions in the menu's order, sorts each link's wording
 * into supersede, amend or reference, and merges the two sides of a link into
 * one edge from the newer decision to the older.
 *
 * Authors write links from one side or both, in whatever wording their ADR
 * tool uses, so every case here is one a real workspace sends.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { layoutDecisionGraph, linkKind } = await importSrc(
    "model/decision-graph",
);

const decision = (id, date, links = [], status = "Accepted") => ({
    id: String(id),
    title: `Decision ${id}`,
    content: "",
    format: "Markdown",
    date,
    status,
    links: links.map(([to, description]) => ({ id: String(to), description })),
});

/** Each edge as `newer kind older`, by decision id, for readable failures. */
const edgesOf = (layout) =>
    layout.edges.map(
        (edge) =>
            `${layout.rows[edge.from].id} ${edge.kind} ${layout.rows[edge.to].id}`,
    );

/* ---------------- order */

test("decisions run newest first, by date and then by number", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-10T00:00:00Z"),
        decision(3, "2024-03-01T00:00:00Z"),
        decision(2, "2024-03-01T00:00:00Z"),
        decision(10, "2024-01-10T00:00:00Z"),
    ]);

    assert.deepEqual(
        layout.rows.map((row) => row.id),
        ["3", "2", "10", "1"],
        "the latest date comes first, and the higher number wins a tie",
    );
});

/* ---------------- link kinds */

const WORDINGS = [
    ["Supersedes", "supersede"],
    ["Superseded by", "supersede"],
    ["Supercedes", "supersede"],
    ["Superceded by", "supersede"],
    ["superseded by", "supersede"],
    ["Overrides", "supersede"],
    ["Overridden by", "supersede"],
    ["  SUPERSEDES  ", "supersede"],
    ["Amends", "amend"],
    ["Amended by", "amend"],
    ["amended by", "amend"],
    ["References", "reference"],
    ["Referenced by", "reference"],
    ["Clarifies", "reference"],
    ["Required by", "reference"],
    ["", "reference"],
];

for (const [wording, kind] of WORDINGS) {
    test(`"${wording}" is a ${kind} link`, () => {
        assert.equal(linkKind(wording), kind);
    });
}

/* ---------------- edges */

test("a link stated from one side still makes an edge", () => {
    const fromNewer = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "Supersedes"]]),
    ]);
    const fromOlder = layoutDecisionGraph([
        decision(1, "2024-01-01", [[2, "Superseded by"]]),
        decision(2, "2024-02-01"),
    ]);

    assert.deepEqual(edgesOf(fromNewer), ["2 supersede 1"]);
    assert.deepEqual(edgesOf(fromOlder), ["2 supersede 1"]);
});

test("both sides of a link merge into one edge", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01", [[2, "Amended by"]]),
        decision(2, "2024-02-01", [[1, "Amends"]]),
    ]);

    assert.deepEqual(edgesOf(layout), ["2 amend 1"]);
});

test("an edge runs from the newer decision to the older, whichever side states it", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01", [[2, "References"]]),
        decision(2, "2024-02-01"),
    ]);

    assert.deepEqual(
        layout.edges.map(({ from, to }) => [from, to]),
        [[0, 1]],
        "from is the newer decision's row, to the older's",
    );
});

const STRONGER = [
    ["Supersedes", "Amended by", "supersede"],
    ["Amends", "Superseded by", "supersede"],
    ["Amends", "Referenced by", "amend"],
    ["References", "Amended by", "amend"],
    ["Overrides", "Referenced by", "supersede"],
];

for (const [newer, older, kind] of STRONGER) {
    test(`"${newer}" against "${older}" merges into a ${kind} edge`, () => {
        const layout = layoutDecisionGraph([
            decision(1, "2024-01-01", [[2, older]]),
            decision(2, "2024-02-01", [[1, newer]]),
        ]);

        assert.deepEqual(edgesOf(layout), [`2 ${kind} 1`]);
    });
}

test("links to decisions outside the set and to itself make no edge", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01", [[1, "Supersedes"]]),
        decision(2, "2024-02-01", [
            [99, "Supersedes"],
            [1, "References"],
        ]),
    ]);

    assert.deepEqual(edgesOf(layout), ["2 reference 1"]);
});

test("a decision without links makes no edge", () => {
    const { links, ...unlinked } = decision(1, "2024-01-01");
    const layout = layoutDecisionGraph([unlinked]);

    assert.deepEqual(layout.edges, []);
});

/* ---------------- our own decisions */

const OURS = JSON.parse(
    readFileSync(
        new URL("../architecture/workspace.json", import.meta.url),
        "utf-8",
    ),
).documentation.decisions;

test("our own decisions get back the three links the importer drops", () => {
    const edges = edgesOf(layoutDecisionGraph(OURS));

    // The importer reads "(0,0)" later on the line as part of the link, so
    // 10 and 17 lose these; 4 and 10 still state them from their side.
    for (const lost of [
        "10 reference 4",
        "17 reference 4",
        "17 reference 10",
    ]) {
        assert.ok(edges.includes(lost), `${lost} is missing`);
    }
});

test("our own decisions make one amend edge and 22 references", () => {
    const edges = edgesOf(layoutDecisionGraph(OURS));

    assert.equal(edges.length, 23);
    assert.deepEqual(
        edges.filter((edge) => !edge.includes("reference")),
        ["14 amend 4"],
    );
});

/* ---------------- the fixture workspace */

const FIXTURE = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/decision-graph.json", import.meta.url),
        "utf-8",
    ),
).documentation.decisions;

test("the fixture links decisions every way an author writes them", () => {
    const edges = edgesOf(layoutDecisionGraph(FIXTURE)).filter(
        (edge) => Number(edge.split(" ")[0]) <= 10,
    );

    assert.deepEqual(edges.toSorted(), [
        "10 supersede 7", // "superseded by", from 7's side only
        "2 supersede 1", // "Supersedes" and "Superseded by"
        "4 supersede 3", // "Supercedes", from 4's side only
        "5 supersede 2", // "Overridden by", from 2's side only
        "6 amend 4", // "Amends" and "Amended by"
        "7 reference 6", // "Clarifies", a wording nobody knows
        "8 reference 2", // "References" and "Referenced by"
        "8 reference 5", // "Depends on", a wording nobody knows
    ]);
});

test("the fixture's newest decision builds on 35 others, more lanes than the menu has room for", () => {
    const layout = layoutDecisionGraph(FIXTURE);
    const newest = layout.edges.filter((edge) => edge.from === 0);

    assert.equal(layout.rows[0].id, "46");
    assert.equal(newest.length, 36, "35 owners and the API changelog");
});
