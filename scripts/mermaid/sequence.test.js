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

/* ----------------------------------------------------------------- palette */

const init = (config) => `%%{init: ${JSON.stringify(config)}}%%\n`;

/** `color`, as Mermaid's theme code writes it, in `#rrggbb`, to compare against measured tables. */
function hex(color) {
    const names = { black: "#000000", white: "#ffffff", lightgrey: "#d3d3d3" };
    const value = String(color).trim().toLowerCase();
    if (names[value]) return names[value];
    const short = /^#([\da-f])([\da-f])([\da-f])$/.exec(value);
    if (short)
        return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    if (/^#[\da-f]{6}$/.test(value)) return value;
    const channels = (rgb) =>
        `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
    const rgb = /^rgb\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(value);
    if (rgb) return channels(rgb.slice(1).map(Number));
    const hsl = /^hsl\((-?[\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(value);
    assert.ok(hsl, `a color: ${color}`);
    const h = (((Number(hsl[1]) % 360) + 360) % 360) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (t) => {
        const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        if (u < 1 / 6) return p + (q - p) * 6 * u;
        if (u < 1 / 2) return q;
        if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
        return p;
    };
    return channels([h + 1 / 3, h, h - 1 / 3].map((t) => channel(t) * 255));
}

const inHex = (colors) =>
    Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, hex(v)]));

/**
 * The sequence variables of each named theme as research 195 measured them
 * on Mermaid 12.2.0's own pictures, and the base theme's with
 * `primaryColor: "#d6eaf8"` (the sign-in fixture).
 */
const MEASURED = {
    default: {
        actorBkg: "#ececff",
        actorBorder: "#9370db",
        actorTextColor: "#000000",
        actorLineColor: "#9370db",
        signalColor: "#333333",
        signalTextColor: "#333333",
        noteBkgColor: "#fff5ad",
        noteBorderColor: "#aaaa33",
        noteTextColor: "#000000",
        labelBoxBkgColor: "#ececff",
        labelBoxBorderColor: "#9370db",
        labelTextColor: "#000000",
        loopTextColor: "#000000",
        activationBkgColor: "#f4f4f4",
        activationBorderColor: "#666666",
        sequenceNumberColor: "#ffffff",
        rectBkgColor: "#f9ffec",
    },
    dark: {
        actorBkg: "#1f2020",
        actorBorder: "#cccccc",
        actorTextColor: "#d3d3d3",
        actorLineColor: "#cccccc",
        signalColor: "#d3d3d3",
        signalTextColor: "#d3d3d3",
        noteBkgColor: "#474949",
        noteBorderColor: "#2f2f2f",
        noteTextColor: "#b8b6b6",
        labelBoxBkgColor: "#1f2020",
        labelBoxBorderColor: "#cccccc",
        labelTextColor: "#d3d3d3",
        loopTextColor: "#d3d3d3",
        activationBkgColor: "#474949",
        activationBorderColor: "#cccccc",
        sequenceNumberColor: "#000000",
        rectBkgColor: "#201f1f",
    },
    forest: {
        actorBkg: "#cde498",
        actorBorder: "#a6cf47",
        actorTextColor: "#000000",
        actorLineColor: "#a6cf47",
        signalColor: "#333333",
        signalTextColor: "#333333",
        noteBkgColor: "#fff5ad",
        noteBorderColor: "#6eaa49",
        noteTextColor: "#000000",
        labelBoxBkgColor: "#cde498",
        labelBoxBorderColor: "#326932",
        labelTextColor: "#000000",
        loopTextColor: "#000000",
        activationBkgColor: "#f4f4f4",
        activationBorderColor: "#666666",
        sequenceNumberColor: "#ffffff",
        rectBkgColor: "#e1efc0",
    },
    neutral: {
        actorBkg: "#eeeeee",
        actorBorder: "#d4d4d4",
        actorTextColor: "#333333",
        actorLineColor: "#d4d4d4",
        signalColor: "#333333",
        signalTextColor: "#333333",
        noteBkgColor: "#666666",
        noteBorderColor: "#999999",
        noteTextColor: "#ffffff",
        labelBoxBkgColor: "#eeeeee",
        labelBoxBorderColor: "#d4d4d4",
        labelTextColor: "#333333",
        loopTextColor: "#333333",
        activationBkgColor: "#f4f4f4",
        activationBorderColor: "#666666",
        sequenceNumberColor: "#ffffff",
        rectBkgColor: "#eeeeee",
    },
};

test("a silent sequence diagram carries no palette, and warns about nothing", () => {
    const { mermaid, notices } = sequence("  A->>B: hi");
    assert.equal(mermaid.palette, undefined);
    assert.deepEqual(notices, []);
});

test("each named theme gives the sequence colors Mermaid draws, to the hex digit", () => {
    for (const [theme, colors] of Object.entries(MEASURED)) {
        const { mermaid } = readOne(
            `${init({ theme })}sequenceDiagram\n  A->>B: hi\n`,
        );
        assert.deepEqual(inHex(mermaid.palette.colors), colors, theme);
        assert.equal(mermaid.palette.dark, theme === "dark", theme);
        assert.equal(mermaid.palette.participants, undefined, theme);
    }
});

test("the base theme derives the sequence colors from primaryColor, as the sign-in fixture shows", () => {
    const { mermaid } = readOne(
        `${init({ theme: "base", themeVariables: { primaryColor: "#d6eaf8" } })}sequenceDiagram\n  A->>B: hi\n`,
    );
    assert.deepEqual(inHex(mermaid.palette.colors), {
        actorBkg: "#d6eaf8",
        actorBorder: "#bed0dd",
        actorTextColor: "#333333",
        actorLineColor: "#bed0dd",
        signalColor: "#333333",
        signalTextColor: "#333333",
        noteBkgColor: "#fff5ad",
        noteBorderColor: "#e4db95",
        noteTextColor: "#333333",
        labelBoxBkgColor: "#d6eaf8",
        labelBoxBorderColor: "#bed0dd",
        labelTextColor: "#333333",
        loopTextColor: "#333333",
        activationBkgColor: "#eaf8d6",
        activationBorderColor: "#d4f1aa",
        sequenceNumberColor: "#f4f4f4",
        rectBkgColor: "#fcf2ec",
    });
});

test("a sequence theme variable the source sets wins over the theme's", () => {
    const { mermaid, notices } = readOne(
        `${init({ theme: "forest", themeVariables: { noteBkgColor: "#123456", signalColor: "#654321" } })}sequenceDiagram\n  A->>B: hi\n`,
    );
    assert.equal(mermaid.palette.colors.noteBkgColor, "#123456");
    assert.equal(mermaid.palette.colors.signalColor, "#654321");
    assert.deepEqual(notices, []);
});

test("redux-color gives each participant its own fill and border, by participant order", () => {
    const { mermaid } = sequence(
        "  participant C\n  participant B\n  participant A\n  A->>B: hi",
    );
    assert.equal(mermaid.palette, undefined, "a silent source never takes it");
    const color = readOne(
        `${init({ theme: "redux-color" })}sequenceDiagram\n  participant C\n  participant B\n  A->>B: hi\n`,
    ).mermaid;
    assert.deepEqual(color.palette.participants, [
        { background: "#FDF4FF", stroke: "#E879F9" },
        { background: "#F0FDFA", stroke: "#2DD4BF" },
        { background: "#FFF7ED", stroke: "#FB923C" },
    ]);
    const dark = readOne(
        `${init({ theme: "redux-dark-color" })}sequenceDiagram\n  A->>B: hi\n`,
    ).mermaid;
    assert.equal(dark.palette.dark, true);
    assert.deepEqual(
        dark.palette.participants,
        [{ stroke: "#E879F9" }, { stroke: "#2DD4BF" }],
        "redux-dark-color outlines its participants and fills none",
    );
    const plain = readOne(
        `${init({ theme: "redux" })}sequenceDiagram\n  A->>B: hi\n`,
    ).mermaid;
    assert.equal(plain.palette.participants, undefined);
});

test("the palette carries fontSize and fontFamily only when the source sets them", () => {
    const { mermaid } = readOne(
        `${init({ themeVariables: { fontSize: "20px", fontFamily: "Georgia, serif" } })}sequenceDiagram\n  A->>B: hi\n`,
    );
    assert.equal(mermaid.palette.fontSize, 20);
    assert.equal(mermaid.palette.fontFamily, "Georgia, serif");
    assert.equal(mermaid.palette.dark, false);
});

test("a sequence diagram warns about the sequence fonts, messageMargin, curve and flowchart theme variables", () => {
    const { notices } = readOne(
        [
            "---",
            "config:",
            "  look: handDrawn",
            "  curve: linear",
            "  themeVariables:",
            "    clusterBkg: '#ffcc00'",
            "    actorBkg: '#ffeeee'",
            "  sequence:",
            "    actorFontSize: 20",
            "    noteFontFamily: Georgia",
            "    messageFontWeight: bold",
            "    messageMargin: 40",
            "    mirrorActors: false",
            "---",
            "sequenceDiagram",
            "  A->>B: hi",
        ].join("\n"),
    );
    assert.deepEqual(notices, [
        ignoredWarning("seq", [
            "clusterBkg",
            "look",
            "curve",
            "sequence.actorFontSize",
            "sequence.noteFontFamily",
            "messageMargin",
        ]),
    ]);
});

test("a flowchart still warns about the sequence theme variables", () => {
    const workspace = mermaidWorkspace([
        mermaidView(
            "flow",
            `${init({ themeVariables: { actorBkg: "#ffeeee" } })}flowchart TD\n  A --> B\n`,
        ),
    ]);
    assert.deepEqual(readMermaidDiagrams(workspace), [
        ignoredWarning("flow", ["actorBkg"]),
    ]);
});
