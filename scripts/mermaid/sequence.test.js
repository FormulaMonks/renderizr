import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { mermaidView, mermaidWorkspace } from "../__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "./index.js";
import { ignoredWarning } from "./warnings.js";

/** The `mermaid` model and the notices of one image view `seq` drawing `source`. */
function readOne(source) {
    const workspace = mermaidWorkspace([mermaidView("seq", source)]);
    const notices = readMermaidDiagrams(workspace);
    return { mermaid: workspace.views.imageViews[0].mermaid, notices };
}

const sequence = (body) => readOne(`sequenceDiagram\n${body}\n`);

/** The script's items without what every one of a kind repeats. */
const kinds = (mermaid) => mermaid.items.map((item) => item.kind);

test("a sequence diagram image view gains a sequence model and stays an image view", () => {
    const workspace = mermaidWorkspace([
        mermaidView("seq", "sequenceDiagram\n  Alice->>Bob: Hi\n"),
    ]);
    const notices = readMermaidDiagrams(workspace);
    const { mermaid } = workspace.views.imageViews[0];
    assert.equal(workspace.views.imageViews.length, 1);
    assert.equal(mermaid.kind, "sequence");
    assert.deepEqual(notices, []);
    assert.deepEqual(workspace.model, {}, "nothing enters the model");
});

test("participants keep their order, alias and type; the other types fall back and warn", () => {
    const { mermaid, notices } = sequence(
        [
            "  actor U as User",
            "  participant W as Web<br/>shop",
            '  participant G@{ "type": "boundary" } as Gateway',
            '  participant D@{ "type": "database" } as Orders',
            '  participant Q@{ "type": "queue" }',
            '  participant C@{ "type": "collections" }',
            "  U->>W: Hi",
        ].join("\n"),
    );
    assert.deepEqual(mermaid.participants, [
        { id: "U", label: "User", type: "actor" },
        { id: "W", label: "Web\nshop", type: "participant" },
        { id: "G", label: "Gateway", type: "participant" },
        { id: "D", label: "Orders", type: "database" },
        { id: "Q", label: "Q", type: "queue" },
        { id: "C", label: "C", type: "participant" },
    ]);
    assert.deepEqual(notices, [
        ignoredWarning("seq", [
            'participant type "boundary"',
            'participant type "collections"',
        ]),
    ]);
});

test("participant menus drop with no warning", () => {
    const { mermaid, notices } = sequence(
        [
            "  participant A",
            "  link A: Dashboard @ https://example.test",
            '  links A: {"Repo": "https://example.test/repo"}',
            "  A->>A: Hi",
        ].join("\n"),
    );
    assert.deepEqual(mermaid.participants, [
        { id: "A", label: "A", type: "participant" },
    ]);
    assert.deepEqual(notices, []);
});

test("messages carry their ends and line: arrows, open arrows, crosses and none", () => {
    const { mermaid, notices } = sequence(
        [
            "  A->>B: arrow",
            "  A-->>B: dotted arrow",
            "  A<<->>B: both",
            "  A-)B: open",
            "  A--)B: dotted open",
            "  A-xB: cross",
            "  A--xB: dotted cross",
            "  A->B: none",
            "  A-->B: dotted none",
        ].join("\n"),
    );
    assert.deepEqual(
        mermaid.items.map(({ label, start, end, line }) => [
            label,
            start,
            end,
            line,
        ]),
        [
            ["arrow", "none", "arrow", "solid"],
            ["dotted arrow", "none", "arrow", "dotted"],
            ["both", "arrow", "arrow", "solid"],
            ["open", "none", "openArrow", "solid"],
            ["dotted open", "none", "openArrow", "dotted"],
            ["cross", "none", "cross", "solid"],
            ["dotted cross", "none", "cross", "dotted"],
            ["none", "none", "none", "solid"],
            ["dotted none", "none", "none", "dotted"],
        ],
    );
    assert.deepEqual(
        mermaid.items.map((m) => [m.id, m.from, m.to]).slice(0, 2),
        [
            ["0", "A", "B"],
            ["1", "A", "B"],
        ],
        "each message keeps Mermaid's index as its id",
    );
    assert.deepEqual(notices, []);
});

test("half arrows fall back to an arrow or an open arrow at the end the syntax puts it, and warn", () => {
    const { mermaid, notices } = sequence(
        [
            "  A-|\\B: solid top",
            "  A--|/B: dotted solid bottom",
            "  A-\\\\B: stick top",
            "  A/|-B: reversed solid",
            "  A//-B: reversed stick",
        ].join("\n"),
    );
    assert.deepEqual(
        mermaid.items.map(({ start, end, line }) => [start, end, line]),
        [
            ["none", "arrow", "solid"],
            ["none", "arrow", "dotted"],
            ["none", "openArrow", "solid"],
            ["arrow", "none", "solid"],
            ["openArrow", "none", "solid"],
        ],
    );
    assert.deepEqual(notices, [ignoredWarning("seq", ["half arrows"])]);
});

test("a central connection marks a dot and opens an activation on that lifeline", () => {
    const { mermaid } = sequence(
        ["  A->>()B: end", "  A()->>B: start", "  A()->>()B: both"].join("\n"),
    );
    assert.deepEqual(
        mermaid.items.map((item) =>
            item.kind === "message"
                ? ["message", item.dots]
                : [item.kind, item.who],
        ),
        [
            ["message", "end"],
            ["activate", "B"],
            ["message", "start"],
            ["activate", "A"],
            ["message", "both"],
            ["activate", "B"],
            ["activate", "A"],
        ],
    );
});

test("notes keep their placement, the participants they span, their lines and wrap", () => {
    const { mermaid } = sequence(
        [
            "  participant A",
            "  participant B",
            "  Note left of A: Left<br/>two lines",
            "  Note right of B: Right",
            "  Note over A: Over",
            "  Note over A,B: wrap:Across both",
        ].join("\n"),
    );
    assert.deepEqual(mermaid.items, [
        {
            kind: "note",
            placement: "left",
            from: "A",
            to: "A",
            text: "Left\ntwo lines",
            wrap: false,
        },
        {
            kind: "note",
            placement: "right",
            from: "B",
            to: "B",
            text: "Right",
            wrap: false,
        },
        {
            kind: "note",
            placement: "over",
            from: "A",
            to: "A",
            text: "Over",
            wrap: false,
        },
        {
            kind: "note",
            placement: "over",
            from: "A",
            to: "B",
            text: "Across both",
            wrap: true,
        },
    ]);
});

test("every fragment opens, splits into sections and closes in order", () => {
    const { mermaid } = sequence(
        [
            "  loop Every job",
            "    A->>B: a",
            "  end",
            "  alt Valid",
            "    A->>B: b",
            "  else Malformed",
            "    A->>B: c",
            "  end",
            "  opt Changed",
            "    A->>B: d",
            "  end",
            "  par One",
            "    A->>B: e",
            "  and Two",
            "    A->>B: f",
            "  end",
            "  par_over Over",
            "    A->>B: g",
            "  end",
            "  critical Clean up",
            "    A->>B: h",
            "  option Unavailable",
            "    A->>B: i",
            "  end",
            "  break Quota",
            "    A->>B: j",
            "  end",
            "  rect rgb(230, 240, 255)",
            "    A->>B: k",
            "  end",
            "  rect",
            "    A->>B: l",
            "  end",
        ].join("\n"),
    );
    const outline = mermaid.items
        .filter((item) => item.kind !== "message")
        .map((item) =>
            item.kind === "open"
                ? [item.kind, item.fragment, item.title, item.color]
                : item.kind === "section"
                  ? [item.kind, item.title]
                  : [item.kind],
        );
    assert.deepEqual(outline, [
        ["open", "loop", "Every job", undefined],
        ["close"],
        ["open", "alt", "Valid", undefined],
        ["section", "Malformed"],
        ["close"],
        ["open", "opt", "Changed", undefined],
        ["close"],
        ["open", "par", "One", undefined],
        ["section", "Two"],
        ["close"],
        ["open", "par", "Over", undefined],
        ["close"],
        ["open", "critical", "Clean up", undefined],
        ["section", "Unavailable"],
        ["close"],
        ["open", "break", "Quota", undefined],
        ["close"],
        ["open", "rect", "", "rgb(230, 240, 255)"],
        ["close"],
        ["open", "rect", "", undefined],
        ["close"],
    ]);
});

test("activations open and close by participant, from + and - as from activate and deactivate", () => {
    const { mermaid } = sequence(
        [
            "  A->>+B: open",
            "  activate B",
            "  deactivate B",
            "  B-->>-A: close",
        ].join("\n"),
    );
    assert.deepEqual(
        kinds(mermaid).map((kind, i) => [kind, mermaid.items[i].who]),
        [
            ["message", undefined],
            ["activate", "B"],
            ["activate", "B"],
            ["deactivate", "B"],
            ["message", undefined],
            ["deactivate", "B"],
        ],
    );
});

test("autonumber keeps its start, step and visibility, and showSequenceNumbers numbers every message", () => {
    const { mermaid } = sequence(
        [
            "  autonumber 10 5",
            "  A->>B: a",
            "  autonumber off",
            "  A->>B: b",
            "  autonumber",
            "  A->>B: c",
        ].join("\n"),
    );
    assert.deepEqual(
        mermaid.items.filter((item) => item.kind === "autonumber"),
        [
            { kind: "autonumber", start: 10, step: 5, visible: true },
            { kind: "autonumber", visible: false },
            { kind: "autonumber", visible: true },
        ],
    );
    assert.equal(mermaid.numbers, false);
    const shown = readOne(
        "---\nconfig:\n  sequence:\n    showSequenceNumbers: true\n---\nsequenceDiagram\n  A->>B: a\n",
    );
    assert.equal(shown.mermaid.numbers, true);
});

test("create and destroy mark the message that makes or ends a participant", () => {
    const { mermaid } = sequence(
        [
            "  participant A",
            "  create participant S as Session",
            "  A->>S: start",
            "  destroy S",
            "  A-xS: stop",
        ].join("\n"),
    );
    const [start, stop] = mermaid.items;
    assert.equal(start.creates, "S");
    assert.deepEqual(stop.destroys, ["S"]);
    assert.equal(stop.creates, undefined);
});

test("boxes keep their title, their fill and the participants inside them", () => {
    const { mermaid } = sequence(
        [
            "  box Shop",
            "    participant W",
            "    participant O",
            "  end",
            "  box rgb(240, 230, 255)",
            "    participant P",
            "  end",
            "  box transparent Plain",
            "    participant Q",
            "  end",
            "  W->>P: hi",
        ].join("\n"),
    );
    assert.deepEqual(mermaid.boxes, [
        { title: "Shop", participants: ["W", "O"] },
        { title: "", fill: "rgb(240, 230, 255)", participants: ["P"] },
        { title: "Plain", participants: ["Q"] },
    ]);
});

test("mirrorActors, rightAngles, wrap and the title travel with the model", () => {
    const { mermaid } = readOne(
        [
            "---",
            "title: Sign-in",
            "config:",
            "  sequence:",
            "    mirrorActors: false",
            "    rightAngles: true",
            "    wrap: true",
            "---",
            "sequenceDiagram",
            "  A->>B: hi",
        ].join("\n"),
    );
    assert.equal(mermaid.mirror, false);
    assert.equal(mermaid.rightAngles, true);
    assert.equal(mermaid.items[0].wrap, true);
    assert.equal(mermaid.title, "Sign-in");
    const plain = sequence("  A->>B: hi");
    assert.equal(plain.mermaid.mirror, true);
    assert.equal(plain.mermaid.rightAngles, false);
    assert.equal(plain.mermaid.title, undefined);
});

test("a sequence diagram that fails to parse says where, as a sequence diagram", () => {
    const { mermaid, notices } = sequence("  A->>: nobody");
    assert.equal(mermaid.kind, "sequence");
    assert.match(mermaid.error, /^a parse error at line 2/);
    assert.equal(notices.length, 1);
});

test("the sequence fixture reads every view with only the fallbacks it means to show", () => {
    const json = JSON.parse(
        readFileSync(
            new URL(
                "../../test/__fixtures__/mermaid-sequence.json",
                import.meta.url,
            ),
            "utf8",
        ),
    );
    const notices = readMermaidDiagrams(json);
    for (const view of json.views.imageViews)
        assert.equal(view.mermaid?.kind, "sequence", view.key);
    assert.deepEqual(notices, [
        ignoredWarning("shapes", [
            'participant type "boundary"',
            'participant type "control"',
            'participant type "entity"',
            'participant type "collections"',
        ]),
        ignoredWarning("constructs", ["half arrows"]),
    ]);
});
