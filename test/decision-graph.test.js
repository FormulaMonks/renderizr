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
import { syntheticDecisions } from "./support/decision-sets.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    continuesLane,
    edgesOfDecision,
    joinsLane,
    laneColumnsOfDecision,
    layoutDecisionGraph,
    linkKind,
    relatedDecisions,
} = await importSrc("model/decision-graph");

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

test("undated decisions run last, by number, whatever order they arrive in", () => {
    const decisions = [
        decision(1, "2024-01-10T00:00:00Z"),
        decision(4, ""),
        decision(2, "2024-03-01T00:00:00Z"),
        decision(3, undefined),
        decision(5, "2024-02-01T00:00:00Z"),
    ];

    for (const order of [decisions, decisions.toReversed()]) {
        assert.deepEqual(
            layoutDecisionGraph(order).rows.map((row) => row.id),
            ["2", "5", "1", "4", "3"],
            "dated decisions newest first, then the undated, higher number first",
        );
    }
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
    assert.equal(
        layout.columns,
        2,
        "column 0 holds the lone dots, and column 1 waits for the lit links",
    );
});

test("supersede and amend join decisions into one lineage on one lane", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "Supersedes"]]),
        decision(3, "2024-03-01", [[2, "Amends"]]),
    ]);

    assert.deepEqual(lanesOf(layout), [
        {
            col: 2,
            top: "3",
            bottom: "1",
            members: ["3", "2", "1"],
            linkers: [],
        },
    ]);
    assert.deepEqual(loneOf(layout), []);
    assert.equal(layout.columns, 3);
});

test("a decision a later one references gets a lane up to its newest linker", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "References"]]),
        decision(3, "2024-03-01"),
        decision(4, "2024-04-01", [[1, "Clarifies"]]),
    ]);

    assert.deepEqual(lanesOf(layout), [
        { col: 2, top: "4", bottom: "1", members: ["1"], linkers: ["4", "2"] },
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
        { col: 2, top: "3", bottom: "1", members: ["3", "1"], linkers: ["2"] },
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
            [2, "2"],
            [3, "1"],
        ],
        "2's lane opens first, at 4, so it takes column 2",
    );
    assert.equal(layout.columns, 4);
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
            [2, "3"],
            [2, "1"],
        ],
        "3's lane closes at 3, above where 1's lane opens, at 2",
    );
    assert.equal(layout.columns, 3);
});

test("each row knows the lane it sits on", () => {
    const layout = layoutDecisionGraph([
        decision(1, "2024-01-01"),
        decision(2, "2024-02-01", [[1, "Supersedes"]]),
        decision(3, "2024-03-01", [[1, "References"]]),
    ]);

    assert.deepEqual(
        layout.laneOf.map((lane) => lane?.col ?? null),
        [null, 2, 2],
        "3 references the lineage and stays lone; 2 and 1 sit on its lane",
    );
});

/* ---------------- the open decision's edges */

/**
 * 3 supersedes 1, so they share a lane; 2 and 5 reference 1 and join it; 4
 * references 3; 6 references 3 and 1; 7 links to nothing.
 */
const JOINED = [
    decision(1, "2024-01-01"),
    decision(2, "2024-02-01", [[1, "References"]]),
    decision(3, "2024-03-01", [[1, "Supersedes"]]),
    decision(4, "2024-04-01", [[3, "References"]]),
    decision(5, "2024-05-01", [[1, "References"]]),
    decision(6, "2024-06-01", [
        [3, "References"],
        [1, "References"],
    ]),
    decision(7, "2024-07-01"),
];

/** What a decision's edges light up, by decision id, for readable failures. */
const lit = (layout, id) => {
    const idOf = (row) => layout.rows[row].id;
    const row = layout.rows.findIndex((decision) => decision.id === id);
    const edges = edgesOfDecision(layout, row);

    return {
        links: edges.links.map((edge) => `${idOf(edge.from)}-${idOf(edge.to)}`),
        dots: [...edges.dots].map(idOf).sort(),
    };
};

test("a decision on a lane lights its own links and their ends, not the rest of its lane", () => {
    assert.deepEqual(lit(layoutDecisionGraph(JOINED), "3"), {
        // Farthest first, so the nearest draws on top where they overlap.
        links: ["6-3", "3-1", "4-3"],
        // 2 and 5 join 3's lane, but they link to 1, not to 3.
        dots: ["1", "3", "4", "6"],
    });
});

test("a decision that joins another lane lights only its own link", () => {
    assert.deepEqual(lit(layoutDecisionGraph(JOINED), "4"), {
        links: ["4-3"],
        dots: ["3", "4"],
    });
});

test("a decision's links run farthest first, either way", () => {
    assert.deepEqual(lit(layoutDecisionGraph(JOINED), "1").links, [
        "6-1",
        "5-1",
        "3-1",
        "2-1",
    ]);
});

test("a decision with no links lights nothing, not even its own dot", () => {
    assert.deepEqual(lit(layoutDecisionGraph(JOINED), "7"), {
        links: [],
        dots: [],
    });
});

test("a decision in the middle of a long amend trunk lights only its direct links", () => {
    // One lineage of ten: from 2 on, each decision amends the one before. 11
    // and 12 reference 5, and 5 references 13, a lone dot otherwise.
    const trunk = Array.from({ length: 10 }, (__, index) =>
        decision(
            index + 1,
            `2024-01-${String(index + 1).padStart(2, "0")}`,
            index === 0 ? [] : [[index, "Amends"]],
        ),
    );
    trunk[4].links.push({ id: "13", description: "References" });
    const layout = layoutDecisionGraph([
        ...trunk,
        decision(11, "2024-02-01", [[5, "References"]]),
        decision(12, "2024-02-02", [[5, "References"]]),
        decision(13, "2023-12-01"),
    ]);

    assert.deepEqual(
        layout.laneOf.map((lane) => lane?.members.length ?? 0),
        [0, 0, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 1],
        "the ten share one trunk lane",
    );
    assert.deepEqual(lit(layout, "5"), {
        links: ["12-5", "11-5", "5-13", "6-5", "5-4"],
        dots: ["11", "12", "13", "4", "5", "6"],
    });
});

/* ---------------- the cap and the fallbacks */

/**
 * 2 supersedes 1; 3 references 1; 4 references 3; 5 references 2; 6
 * references 4. With reference lanes, the lineage's lane runs up to 5, and 3
 * and 4 get lanes of their own: 5 columns in all.
 */
const CAPPED = [
    decision(1, "2024-01-01"),
    decision(2, "2024-02-01", [[1, "Supersedes"]]),
    decision(3, "2024-03-01", [[1, "References"]]),
    decision(4, "2024-04-01", [[3, "References"]]),
    decision(5, "2024-05-01", [[2, "References"]]),
    decision(6, "2024-06-01", [[4, "References"]]),
];

test("a graph whose lanes all fit the cap needs no fallback", () => {
    const layout = layoutDecisionGraph(CAPPED, 5);

    assert.equal(
        layout.columns,
        5,
        "lanes for 1, 3 and 4, the lone dots and column 1",
    );
    assert.equal(layout.fallback, "none");
});

test("every layout keeps column 1 for the lit decision's links, and lanes start at column 2", () => {
    for (const cap of [Number.POSITIVE_INFINITY, 5, 4, 2]) {
        const layout = layoutDecisionGraph(CAPPED, cap);

        assert.equal(layout.referenceColumn, 1, `under a cap of ${cap}`);
        assert.ok(
            layout.lanes.every((lane) => lane.col >= 2),
            `no lane takes column 1 under a cap of ${cap}`,
        );
    }
});

test("without a cap, every lane opens", () => {
    const layout = layoutDecisionGraph(CAPPED);

    assert.equal(layout.columns, 5);
    assert.equal(layout.fallback, "none");
});

test("past the cap, references open no lanes", () => {
    const layout = layoutDecisionGraph(CAPPED, 4);

    assert.equal(layout.fallback, "lineage");
    assert.deepEqual(lanesOf(layout), [
        { col: 2, top: "2", bottom: "1", members: ["2", "1"], linkers: [] },
    ]);
    assert.deepEqual(loneOf(layout), ["6", "5", "4", "3"]);
    assert.equal(layout.columns, 3, "the lone dots, column 1 and one lane");
    assert.equal(layout.edges.length, 5, "every link still makes an edge");
});

test("when even supersede and amend lanes outgrow the cap, the lanes scroll", () => {
    const layout = layoutDecisionGraph(CAPPED, 2);

    assert.equal(layout.fallback, "scroll");
    assert.equal(layout.columns, 3, "the columns of the lineage fallback");
    assert.equal(layout.cap, 2, "the lanes scroll at the cap's width");
});

test("a layout keeps the cap it was laid out under", () => {
    assert.equal(layoutDecisionGraph(CAPPED, 4).cap, 4);
    assert.equal(layoutDecisionGraph(CAPPED).cap, Number.POSITIVE_INFINITY);
});

test("past the cap, a reference from one lineage's decision to another opens no lane", () => {
    const layout = layoutDecisionGraph(
        [
            decision(1, "2024-01-01"),
            decision(2, "2024-02-01", [[1, "Amends"]]),
            decision(3, "2024-03-01"),
            decision(4, "2024-04-01", [
                [3, "Supersedes"],
                [1, "References"],
            ]),
        ],
        2,
    );

    assert.notEqual(layout.fallback, "none");
    assert.deepEqual(
        lanesOf(layout).map((lane) => [lane.members, lane.linkers]),
        [
            [["4", "3"], []],
            [["2", "1"], []],
        ],
    );
});

test("a decision lights the same links whether the graph falls back or not", () => {
    for (const id of ["1", "2", "5"]) {
        assert.deepEqual(
            lit(layoutDecisionGraph(CAPPED, 4), id),
            lit(layoutDecisionGraph(CAPPED), id),
            `decision ${id}`,
        );
    }
});

test("past the cap, a reference joins no lane, and supersede and amend still do", () => {
    const cases = [
        { cap: 5, kind: "reference", joins: true },
        { cap: 4, kind: "reference", joins: false },
        { cap: 4, kind: "supersede", joins: true },
        { cap: 4, kind: "amend", joins: true },
    ];

    for (const { cap, kind, joins } of cases) {
        assert.equal(
            joinsLane(layoutDecisionGraph(CAPPED, cap), {
                from: 0,
                to: 1,
                kind,
            }),
            joins,
            `a ${kind} under a cap of ${cap}`,
        );
    }
});

/**
 * Past the cap of 2, the lanes scroll: 4 amends 2 in column 2 and 3 amends 1
 * in column 3. 4 also references 1, and 5 references 3 and 4 from a lone dot.
 */
const TWO_LANES = [
    decision(1, "2024-01-01"),
    decision(2, "2024-02-01"),
    decision(3, "2024-03-01", [[1, "Amends"]]),
    decision(4, "2024-04-01", [
        [2, "Amends"],
        [1, "References"],
    ]),
    decision(5, "2024-05-01", [
        [3, "References"],
        [4, "References"],
    ]),
];

test("the lanes a decision reaches come with its own lane first, then nearest the titles first", () => {
    const layout = layoutDecisionGraph(TWO_LANES, 2);
    assert.equal(layout.fallback, "scroll");

    const cases = [
        { id: "4", columns: [2, 3], why: "its own lane, then 1's" },
        { id: "1", columns: [3, 2], why: "its own lane, then 4's" },
        { id: "5", columns: [2, 3], why: "a lone dot reaches both lanes" },
        { id: "2", columns: [2], why: "each lane once" },
    ];
    for (const { id, columns, why } of cases) {
        const row = layout.rows.findIndex((decision) => decision.id === id);
        assert.deepEqual(laneColumnsOfDecision(layout, row), columns, why);
    }
});

test("the lanes a decision reaches leave out the pinned columns", () => {
    const layout = layoutDecisionGraph(
        [...TWO_LANES, decision(6, "2024-06-01", [[5, "References"]])],
        2,
    );
    const row = layout.rows.findIndex((decision) => decision.id === "6");

    assert.deepEqual(laneColumnsOfDecision(layout, row), []);
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

test("our own decisions need 9 columns", () => {
    const layout = layoutDecisionGraph(OURS);
    const lane = (col, members, linkers) => ({
        col,
        top: linkers[0] ?? members[0],
        bottom: members.at(-1),
        members,
        linkers,
    });

    assert.equal(layout.columns, 9);
    assert.deepEqual(lanesOf(layout), [
        lane(2, ["7"], ["19", "17", "8"]),
        lane(3, ["3"], ["18", "15", "6"]),
        lane(4, ["14", "4"], ["17", "10", "9"]),
        lane(5, ["9"], ["17", "10"]),
        lane(6, ["10"], ["17"]),
        lane(7, ["16"], ["17"]),
        lane(7, ["2"], ["13", "12", "11", "9", "7", "5", "3"]),
        lane(8, ["15"], ["16"]),
        lane(8, ["11"], ["12"]),
    ]);
    assert.deepEqual(
        loneOf(layout),
        ["19", "18", "17", "13", "12", "8", "6", "5", "1"],
        "every other decision is a lone dot",
    );
});

test("our own decisions need no fallback at 9 columns", () => {
    const layout = layoutDecisionGraph(OURS, 9);

    assert.equal(layout.columns, 9);
    assert.equal(layout.fallback, "none");
});

/* ---------------- seeded synthetic sets */

/** The prototype's sparse set: 1,000 decisions, 0.2 references each. */
const SPARSE_1000 = syntheticDecisions(1000, 0.2, 13);

test("the sparse 1,000-decision set is the prototype's, decision for decision", () => {
    assert.equal(SPARSE_1000[0].title, "Cache the gateway in Postgres");
    assert.equal(SPARSE_1000[0].date, "2019-01-12");
    assert.equal(SPARSE_1000.at(-1).date, "2043-08-23");
    assert.equal(
        SPARSE_1000.filter((decision) => decision.status === "Superseded")
            .length,
        85,
    );
});

test("the sparse 1,000-decision set opens 52 columns with every lane", () => {
    const layout = layoutDecisionGraph(SPARSE_1000);

    assert.equal(layout.columns, 52);
    assert.equal(layout.fallback, "none");
});

test("the sparse 1,000-decision set falls back to supersede and amend lanes at 12 columns under a 30-column cap", () => {
    const layout = layoutDecisionGraph(SPARSE_1000, 30);

    assert.equal(layout.fallback, "lineage");
    assert.equal(layout.columns, 12);
    assert.equal(layout.referenceColumn, 1);
    assert.ok(
        layout.lanes.every((lane) => lane.linkers.length === 0),
        "no lane carries references",
    );
});

/** Sets, caps too small for even their supersede and amend lanes, columns. */
const SCROLLING = [
    ["the sparse 1,000-decision set", SPARSE_1000, 11, 12],
    ["the sparse 300-decision set", syntheticDecisions(300, 0.2, 11), 8, 10],
    ["the sparse 100-decision set", syntheticDecisions(100, 0.2, 7), 8, 10],
];

for (const [name, decisions, cap, columns] of SCROLLING) {
    test(`${name} scrolls its lanes under a ${cap}-column cap`, () => {
        const layout = layoutDecisionGraph(decisions, cap);

        assert.equal(layout.fallback, "scroll");
        assert.equal(layout.columns, columns, "the lanes keep every column");
        assert.equal(layout.referenceColumn, 1);
    });
}

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

test("a decision's relatives are the decisions it links to or that link to it, in decision order", () => {
    assert.deepEqual(
        idsOf(relatedDecisions(FAMILY, "1")),
        ["2", "1"],
        "2 supersedes 1; 3 amends 2, one step too far",
    );
    assert.deepEqual(
        idsOf(relatedDecisions(FAMILY, "2")),
        ["4", "3", "2", "5", "1"],
        "every kind counts, either way",
    );
});

test("a decision's relatives stop one step away, along its history too", () => {
    // 41 amends 5 and 35, and 5 supersedes 2: 2 is two steps away. 51 amends
    // 41 and 52 amends 51. 50 also amends 5: a sibling of 41.
    const set = [
        decision(2, "2024-01-02T00:00:00Z"),
        decision(5, "2024-01-05T00:00:00Z", [[2, "Supersedes"]]),
        decision(35, "2024-02-04T00:00:00Z"),
        decision(41, "2024-03-01T00:00:00Z", [
            [5, "Amends"],
            [35, "Amends"],
        ]),
        decision(45, "2024-03-05T00:00:00Z", [[41, "References"]]),
        decision(50, "2024-03-10T00:00:00Z", [[5, "Amends"]]),
        decision(51, "2024-03-11T00:00:00Z", [[41, "Amends"]]),
        decision(52, "2024-03-12T00:00:00Z", [[51, "Amends"]]),
    ];

    assert.deepEqual(idsOf(relatedDecisions(set, "41")), [
        "51",
        "45",
        "41",
        "35",
        "5",
    ]);
});

test("a decision's relatives stop at its direct references", () => {
    assert.deepEqual(idsOf(relatedDecisions(FAMILY, "4")), ["6", "4", "2"]);
});

test("a decision with no links is its own only relative, and an unknown one has none", () => {
    const set = [...FAMILY, decision(8, "2024-08-01T00:00:00Z")];

    assert.deepEqual(idsOf(relatedDecisions(set, "8")), ["8"]);
    assert.deepEqual(relatedDecisions(set, "99"), []);
});

test("the fixture falls back to supersede and amend lanes under the menu's 30-column cap", () => {
    const uncapped = layoutDecisionGraph(FIXTURE);
    const layout = layoutDecisionGraph(FIXTURE, 30);

    assert.ok(uncapped.columns > 30, `${uncapped.columns} columns uncapped`);
    assert.equal(layout.fallback, "lineage");
    assert.equal(layout.referenceColumn, 1);
});

/**
 * The scrolling fixture: forty supersede and amend lineages stay open across
 * the same rows, so their lanes outgrow the menu's cap and a wide index's.
 */
const SCROLL_FIXTURE = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/decision-graph-scroll.json", import.meta.url),
        "utf-8",
    ),
).documentation.decisions;

test("the scrolling fixture scrolls its lanes under the menu's cap and a wide index's", () => {
    for (const cap of [30, 35]) {
        const layout = layoutDecisionGraph(SCROLL_FIXTURE, cap);

        assert.equal(layout.fallback, "scroll", `under a ${cap}-column cap`);
        assert.equal(layout.columns, 42, "40 lanes, the lone dots, column 1");
    }
});

/* ---------------- lineage links on their lane */

test("both ends of every supersede and amend link sit on one lane, under any cap", () => {
    const sets = [
        ["the joined set", JOINED],
        ["the capped set", CAPPED],
        ["our own decisions", OURS],
        ["the fixture", FIXTURE],
        ["the scrolling fixture", SCROLL_FIXTURE],
        ["the sparse 1,000-decision set", SPARSE_1000],
    ];
    for (const [name, decisions] of sets) {
        for (const cap of [Number.POSITIVE_INFINITY, 30, 8, 2]) {
            const { edges, laneOf } = layoutDecisionGraph(decisions, cap);
            for (const edge of edges.filter((e) => continuesLane(e.kind))) {
                assert.ok(
                    laneOf[edge.from] !== null &&
                        laneOf[edge.from] === laneOf[edge.to],
                    `${name} under a cap of ${cap}: rows ${edge.from} and ${edge.to}`,
                );
            }
        }
    }
});

test("a reference never continues a lane", () => {
    assert.equal(continuesLane("reference"), false);
    assert.equal(continuesLane("supersede"), true);
    assert.equal(continuesLane("amend"), true);
});
