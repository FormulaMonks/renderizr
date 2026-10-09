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

const { layoutDecisionGraph, linkKind, relatedDecisions } = await importSrc(
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

/* ---------------- lanes */

/**
 * Each lane as its column, its ends, its members and its linkers by decision
 * id, newest first, ordered by column and then from the top down.
 */
const lanesOf = (layout) =>
    layout.lanes
        .toSorted((a, b) => a.col - b.col || a.top - b.top)
        .map((lane) => ({
            col: lane.col,
            top: layout.rows[lane.top].id,
            bottom: layout.rows[lane.bottom].id,
            members: lane.members.map((row) => layout.rows[row].id),
            linkers: lane.linkers.map((row) => layout.rows[row].id),
        }));

/** The decisions drawn as lone dots, newest first. */
const loneOf = (layout) =>
    layout.rows
        .filter((__, row) => layout.laneOf[row] === null)
        .map((row) => row.id);

test("a decision nobody links to is a lone dot in column 0", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01"),
    ]);

    assert.deepEqual(layout.lanes, []);
    assert.deepEqual(loneOf(layout), ["2", "1"]);
    assert.equal(layout.columns, 1, "column 0 holds the lone dots");
});

test("supersede and amend join decisions into one lineage on one lane", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "Supersedes"]]),
        decision(3, "2024-03-01", [[2, "Amends"]]),
    ]);

    assert.deepEqual(lanesOf(layout), [
        {
            col: 1,
            top: "3",
            bottom: "1",
            members: ["3", "2", "1"],
            linkers: [],
        },
    ]);
    assert.deepEqual(loneOf(layout), []);
    assert.equal(layout.columns, 2);
});

test("a decision a later one references gets a lane up to its newest linker", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "References"]]),
        decision(3, "2024-03-01"),
        decision(4, "2024-04-01", [[1, "Clarifies"]]),
    ]);

    assert.deepEqual(lanesOf(layout), [
        { col: 1, top: "4", bottom: "1", members: ["1"], linkers: ["4", "2"] },
    ]);
    assert.deepEqual(
        loneOf(layout),
        ["4", "3", "2"],
        "the linkers stay lone dots and join the lane",
    );
});

test("a lane runs up to its newest decision when that is newer than its newest linker", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "References"]]),
        decision(3, "2024-03-01", [[1, "Supersedes"]]),
    ]);

    assert.deepEqual(lanesOf(layout), [
        { col: 1, top: "3", bottom: "1", members: ["3", "1"], linkers: ["2"] },
    ]);
});

test("a decision that references two decisions of one lineage joins its lane once", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "Amends"]]),
        decision(3, "2024-03-01", [
            [1, "References"],
            [2, "References"],
        ]),
    ]);

    assert.deepEqual(lanesOf(layout)[0].linkers, ["3"]);
});

test("lanes open to the left, newest first, in the lowest free column", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01"),
        decision(3, "2024-03-01", [[1, "References"]]),
        decision(4, "2024-04-01", [[2, "References"]]),
    ]);

    assert.deepEqual(
        lanesOf(layout).map(({ col, bottom }) => [col, bottom]),
        [
            [1, "2"],
            [2, "1"],
        ],
        "2's lane opens first, at 4, so it takes column 1",
    );
    assert.equal(layout.columns, 3);
});

test("a column comes back into use once its lane closes", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "References"]]),
        decision(3, "2024-03-01"),
        decision(4, "2024-04-01", [[3, "References"]]),
    ]);

    assert.deepEqual(
        lanesOf(layout).map(({ col, bottom }) => [col, bottom]),
        [
            [1, "3"],
            [1, "1"],
        ],
        "3's lane closes at 3, above where 1's lane opens, at 2",
    );
    assert.equal(layout.columns, 2);
});

test("each row knows the lane it sits on", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "Supersedes"]]),
        decision(3, "2024-03-01", [[1, "References"]]),
    ]);

    assert.deepEqual(
        layout.laneOf.map((lane) => lane?.col ?? null),
        [null, 1, 1],
        "3 references the lineage and stays lone; 2 and 1 sit on its lane",
    );
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

test("our own decisions need 8 columns", () => {
    const layout = layoutDecisionGraph(OURS);
    const lane = (col, members, linkers) => ({
        col,
        top: linkers[0] ?? members[0],
        bottom: members.at(-1),
        members,
        linkers,
    });

    assert.equal(layout.columns, 8);
    assert.deepEqual(lanesOf(layout), [
        lane(1, ["7"], ["19", "17", "8"]),
        lane(2, ["3"], ["18", "15", "6"]),
        lane(3, ["14", "4"], ["17", "10", "9"]),
        lane(4, ["9"], ["17", "10"]),
        lane(5, ["10"], ["17"]),
        lane(6, ["16"], ["17"]),
        lane(6, ["2"], ["13", "12", "11", "9", "7", "5", "3"]),
        lane(7, ["15"], ["16"]),
        lane(7, ["11"], ["12"]),
    ]);
    assert.deepEqual(
        loneOf(layout),
        ["19", "18", "17", "13", "12", "8", "6", "5", "1"],
        "every other decision is a lone dot",
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

/* ---------------- related decisions */

const idsOf = (decisions) => decisions.map((d) => d.id);

/**
 * 2 supersedes 1 and 3 amends 2: one lineage. 2 references 5 and 4 references
 * 2. 6 references 4 and 7 supersedes 5, each one step too far from 2.
 */
const FAMILY = [
    decision(1, "2024-01-01T00:00:00Z"),
    decision(5, "2024-01-05T00:00:00Z"),
    decision(2, "2024-02-01T00:00:00Z", [
        [1, "Supersedes"],
        [5, "References"],
    ]),
    decision(3, "2024-03-01T00:00:00Z", [[2, "Amends"]]),
    decision(4, "2024-04-01T00:00:00Z", [[2, "References"]]),
    decision(6, "2024-06-01T00:00:00Z", [[4, "References"]]),
    decision(7, "2024-07-01T00:00:00Z", [[5, "Supersedes"]]),
];

test("a decision's relatives are its lineage at any distance and its direct references, in decision order", () => {
    assert.deepEqual(
        idsOf(relatedDecisions(FAMILY, "1")),
        ["3", "2", "1"],
        "2 supersedes 1 and 3 amends 2",
    );
    assert.deepEqual(
        idsOf(relatedDecisions(FAMILY, "2")),
        ["4", "3", "2", "5", "1"],
        "a reference counts either way, but not the referenced decision's lineage",
    );
});

test("a decision's relatives stop at its direct references", () => {
    assert.deepEqual(idsOf(relatedDecisions(FAMILY, "4")), ["6", "4", "2"]);
});

test("a decision with no links is its own only relative, and an unknown one has none", () => {
    const set = [...FAMILY, decision(8, "2024-08-01T00:00:00Z")];

    assert.deepEqual(idsOf(relatedDecisions(set, "8")), ["8"]);
    assert.deepEqual(relatedDecisions(set, "99"), []);
});
