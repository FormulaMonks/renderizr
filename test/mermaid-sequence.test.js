/**
 * Mermaid sequence diagrams as the page draws them (spec: Sequence
 * diagrams): the resolved view and its sequence script, the layout,
 * participants and messages as element boxes and edges, the `sequence`
 * layer around them, the toolbar and the export. The build's half is in
 * `scripts/mermaid/sequence.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    mermaidView,
    mermaidWorkspace,
} from "../scripts/__fixtures__/mermaid.js";
import { readMermaidDiagrams } from "../scripts/mermaid/index.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, inertToggles, resolveView, whyNotEditable } =
    await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const {
    layOutSequence,
    ACTIVATION_WIDTH,
    DOT_RADIUS,
    NUMBER_RADIUS,
    PARTICIPANT_ROW,
    PARTICIPANT_WIDTH,
} = await importSrc("engine/geometry/sequence");
const { mix, sequenceGroups, unitKey } = await importSrc(
    "engine/react-flow/sequence-graph",
);
const { stepStateOf } = await importSrc("engine/react-flow/animation");
const { exportSvg } = await importSrc("engine/react-flow/export-svg");
const { exportFrame } = await importSrc("engine/geometry/canvas");
const { shapeGeometry } = await importSrc("engine/geometry/shapes/index");

const LABELS = { descriptions: true, technologies: true };

/** A measure that needs no font: half the size per character. */
const measure = (text, size) => text.length * size * 0.5;

/** The `mermaid` model of `source`, as the build reads it. */
function scriptOf(source) {
    const json = mermaidWorkspace([mermaidView("seq", source)]);
    readMermaidDiagrams(json);
    return json.views.imageViews[0].mermaid;
}

const sequence = (body) => scriptOf(`sequenceDiagram\n${body}\n`);

/** The layout of `body`, every participant at the least width. */
const layout = (body) => layOutSequence(sequence(body), new Map(), measure);

function modelOf(source) {
    const json = mermaidWorkspace([mermaidView("seq", source)]);
    readMermaidDiagrams(json);
    return new WorkspaceModel(json);
}

const graphOf = (model, scheme = "light", key = "seq") =>
    buildGraph(model, key, scheme, LABELS, measure);

const FIXTURE = (() => {
    const json = JSON.parse(
        readFileSync(
            new URL("./__fixtures__/mermaid-sequence.json", import.meta.url),
            "utf8",
        ),
    );
    readMermaidDiagrams(json);
    return json;
})();

/** Every shape of a layer the hook `data-sequence` names. */
const shapes = (layer, name) =>
    layer.filter((shape) => shape.attrs["data-sequence"] === name);

/** What draws with the messages' arrows: their numbers and dots. */
const marks = (graph) => graph.edges.flatMap((edge) => edge.marks ?? []);

/* ------------------------------------------------------- the resolved view */

test("a sequence diagram resolves to its participants and messages, with its script", () => {
    const model = modelOf(
        "sequenceDiagram\n  actor U as User\n  U->>W: Hi\n  W-->>U: Hello\n",
    );
    const view = model.findViewByKey("seq");
    assert.equal(view.type, "Mermaid");
    assert.equal(whyNotEditable(view), "image", "read-only, as an image view");
    const resolved = resolveView(model, "seq");
    assert.deepEqual(
        resolved.elements.map((e) => [e.id, e.element.name, e.element.tags]),
        [
            ["mermaid:U", "User", "Element,Mermaid"],
            ["mermaid:W", "W", "Element,Mermaid"],
        ],
    );
    assert.deepEqual(
        resolved.relationships.map(({ relationship: r }) => [
            r.id,
            r.sourceId,
            r.destinationId,
            r.description,
            r.tags,
        ]),
        [
            [
                "mermaid-edge:0",
                "mermaid:U",
                "mermaid:W",
                "Hi",
                "Relationship,Mermaid",
            ],
            [
                "mermaid-edge:1",
                "mermaid:W",
                "mermaid:U",
                "Hello",
                "Relationship,Mermaid",
            ],
        ],
    );
    assert.deepEqual(resolved.boundaries, []);
    assert.equal(
        resolved.sequence,
        view.mermaid,
        "the script is the build's model",
    );
    assert.equal(resolved.mermaid, undefined);
    assert.equal(model.findElementById("mermaid:U"), undefined);
});

/* ------------------------------------------------------------------ layout */

test("participants sit 75 apart at least, a row of 111 high, and wider for a long label between them", () => {
    const short = layout("  A->>B: hi");
    const a = short.participants.get("A").head;
    const b = short.participants.get("B").head;
    assert.equal(a.width, PARTICIPANT_WIDTH);
    assert.equal(a.height, PARTICIPANT_ROW);
    assert.equal(PARTICIPANT_ROW, 111);
    assert.equal(b.x - (a.x + a.width), 75);
    const long = layout(`  A->>B: ${"x".repeat(60)}`);
    const gap =
        long.participants.get("B").head.x -
        (long.participants.get("A").head.x + PARTICIPANT_WIDTH);
    assert.ok(gap > 75, "the label widens the gap");
});

test("a message sits 69 below the one before, and a self-message takes 114", () => {
    const { messages } = layout(
        "  A->>B: a\n  A->>B: b\n  B->>B: c\n  A->>B: d",
    );
    const ys = messages.map((m) => m.route[0].y);
    assert.equal(ys[1] - ys[0], 69);
    assert.equal(ys[2] - ys[1], 69);
    assert.equal(ys[3] - ys[2], 69 + 45, "the loop takes its room below");
    const loop = messages[2];
    assert.equal(loop.loop, true, "a cubic loop");
    assert.equal(loop.route.length, 4);
    assert.equal(loop.route[3].y - loop.route[0].y, 30);
});

test("rightAngles draws a self-message as three straight sides", () => {
    const script = scriptOf(
        "---\nconfig:\n  sequence:\n    rightAngles: true\n---\nsequenceDiagram\n  A->>A: loop\n",
    );
    const [loop] = layOutSequence(script, new Map(), measure).messages;
    assert.equal(loop.loop, false);
    assert.deepEqual(
        loop.route.map((p) => p.y - loop.route[0].y),
        [0, 0, 37.5, 37.5],
    );
});

test("activation bars are 15 wide and stack 7.5 to the right; a bar nothing closes draws nothing", () => {
    const { activations, messages } = layout(
        [
            "  A->>+B: open",
            "  activate B",
            "  B->>B: work",
            "  deactivate B",
            "  B-->>-A: done",
            "  activate A",
        ].join("\n"),
    );
    assert.equal(activations.length, 2);
    const [inner, outer] = activations;
    assert.equal(inner.width, ACTIVATION_WIDTH);
    assert.equal(ACTIVATION_WIDTH, 15);
    assert.equal(inner.x - outer.x, 7.5);
    assert.equal(outer.depth, 0);
    assert.equal(inner.depth, 1);
    const b = layout("  A->>B: hi").lifelines[1].x;
    assert.equal(
        messages[0].route[1].x,
        b - ACTIVATION_WIDTH / 2,
        "a message that opens a bar ends at it",
    );
});

test("a note sits left of, right of or over one participant, or across two", () => {
    const { notes, lifelines } = layout(
        [
            "  participant A",
            "  participant B",
            "  Note left of A: Left",
            "  Note right of B: Right",
            "  Note over A: Over",
            "  Note over A,B: Across",
        ].join("\n"),
    );
    const [a, b] = lifelines.map((l) => l.x);
    const [left, right, over, across] = notes;
    assert.equal(left.x + left.width, a - 37.5);
    assert.equal(right.x, b + 37.5);
    assert.equal(over.x + over.width / 2, a);
    assert.equal(across.x, a - 37.5);
    assert.equal(across.x + across.width, b + 37.5);
    assert.ok(right.y > left.y && over.y > right.y && across.y > over.y);
});

test("every fragment frames what it holds, padded 15 per level, with its sections", () => {
    const { fragments } = layout(
        [
            "  loop Every job",
            "    alt Valid",
            "      A->>B: a",
            "    else Malformed",
            "      A->>B: b",
            "    end",
            "  end",
            "  par One",
            "    A->>B: c",
            "  and Two",
            "    A->>B: d",
            "  end",
            "  critical Clean",
            "    A->>B: e",
            "  option Retry",
            "    A->>B: f",
            "  end",
            "  opt Maybe",
            "    A->>B: g",
            "  end",
            "  break Stop",
            "    A->>B: h",
            "  end",
            "  rect rgb(1, 2, 3)",
            "    A->>B: i",
            "  end",
        ].join("\n"),
    );
    assert.deepEqual(fragments.map((f) => f.fragment).sort(), [
        "alt",
        "break",
        "critical",
        "loop",
        "opt",
        "par",
        "rect",
    ]);
    const loop = fragments.find((f) => f.fragment === "loop");
    const alt = fragments.find((f) => f.fragment === "alt");
    assert.equal(alt.x - loop.x, 15, "nested 15 in");
    assert.equal(loop.x + loop.width - (alt.x + alt.width), 15);
    assert.equal(alt.sections.length, 1);
    assert.deepEqual(alt.sections[0].title.lines, ["[Malformed]"]);
    assert.deepEqual(loop.title.lines, ["[Every job]"]);
    const rect = fragments.find((f) => f.fragment === "rect");
    assert.equal(rect.color, "rgb(1, 2, 3)");
    assert.equal(rect.title, undefined);
});

test("a fragment's title wraps to the width the first pass found, less the tab", () => {
    const title = "a fragment title much longer than the messages inside it";
    const { fragments } = layout(`  loop ${title}\n    A->>B: x\n  end`);
    assert.ok(fragments[0].title.lines.length > 1);
    for (const line of fragments[0].title.lines)
        assert.ok(measure(line, 20) <= fragments[0].width - 75 - 30);
});

test("create puts a participant's box on the creating message, and destroy ends its lifeline there", () => {
    const { participants, lifelines, messages } = layout(
        [
            "  participant A",
            "  create participant S",
            "  A->>S: start",
            "  destroy S",
            "  A-xS: stop",
        ].join("\n"),
    );
    const [start, stop] = messages;
    const s = participants.get("S");
    assert.equal(s.head.y + s.head.height / 2, start.route[0].y);
    assert.equal(start.route[1].x, s.head.x - 4.5, "it stops at the box");
    const line = lifelines.find((l) => l.id === "S");
    assert.equal(line.top, s.head.y + s.head.height);
    assert.equal(line.bottom, stop.route[0].y);
    assert.equal(s.foot.y + s.foot.height / 2, stop.route[0].y);
});

test("mirrorActors false draws no footer and ends every lifeline 30 below the last item", () => {
    const script = scriptOf(
        "---\nconfig:\n  sequence:\n    mirrorActors: false\n---\nsequenceDiagram\n  A->>B: hi\n",
    );
    const placed = layOutSequence(script, new Map(), measure);
    assert.equal(placed.participants.get("A").foot, undefined);
    const last = placed.messages[0].route[0].y;
    for (const line of placed.lifelines) assert.equal(line.bottom, last + 30);
    const mirrored = layout("  A->>B: hi");
    assert.equal(
        mirrored.participants.get("A").foot.y,
        mirrored.messages[0].route[0].y + 30,
    );
});

test("autonumber numbers every message from its start by its step, off and on again going on", () => {
    const { messages } = layout(
        [
            "  A->>B: a",
            "  autonumber 10 5",
            "  A->>B: b",
            "  A->>B: c",
            "  autonumber off",
            "  A->>B: d",
            "  autonumber",
            "  A->>B: e",
        ].join("\n"),
    );
    assert.deepEqual(
        messages.map((m) => m.number?.text),
        [undefined, "10", "15", undefined, "25"],
    );
    const numbered = messages[1];
    assert.equal(
        numbered.route[0].x - numbered.number.at.x,
        NUMBER_RADIUS,
        "the line starts past the circle",
    );
    const shown = scriptOf(
        "---\nconfig:\n  sequence:\n    showSequenceNumbers: true\n---\nsequenceDiagram\n  A->>B: a\n  A->>B: b\n",
    );
    assert.deepEqual(
        layOutSequence(shown, new Map(), measure).messages.map(
            (m) => m.number?.text,
        ),
        ["1", "2"],
    );
});

test("a central connection draws a dot on each lifeline it names", () => {
    const { messages, lifelines } = layout(
        "  A->>()B: end\n  A()->>B: start\n  A()->>()B: both",
    );
    const [a, b] = lifelines.map((l) => l.x);
    assert.deepEqual(
        messages.map((m) => m.dots.map((d) => d.x)),
        [[b], [a], [a, b]],
    );
});

test("hiding notes is laying the script out without them: a fragment of notes only stays, with its title", () => {
    const script = sequence(
        "  A->>B: a\n  opt Only a note\n    Note over A: n\n  end\n  A->>B: b",
    );
    const all = layOutSequence(script, new Map(), measure);
    const none = layOutSequence(
        { ...script, items: script.items.filter((i) => i.kind !== "note") },
        new Map(),
        measure,
    );
    assert.equal(all.notes.length, 1);
    assert.equal(none.notes.length, 0);
    assert.equal(none.fragments.length, 1);
    assert.deepEqual(none.fragments[0].title.lines, ["[Only a note]"]);
    assert.ok(none.bounds.height < all.bounds.height);
});

test("the checkout fixture lays out as tall as Mermaid's picture at 1.5", () => {
    const graph = buildGraph(
        new WorkspaceModel(FIXTURE),
        "checkout",
        "light",
        LABELS,
        measure,
    );
    // Mermaid's own picture is 1268 tall at 1.5 (the 197 write-up); heights
    // don't depend on the measure where nothing wraps, and `neo`'s taller
    // participant row and the actor's Person take a little more.
    const ratio = graph.bounds.height / 1268;
    assert.ok(ratio > 1 && ratio < 1.1, `${ratio}`);
});

/* ------------------------------------------------------------------- graph */

test("participants draw in the C4 label template: a box, a Person, a shallow Cylinder and the Pipe", () => {
    const graph = buildGraph(
        new WorkspaceModel(FIXTURE),
        "shapes",
        "light",
        LABELS,
        measure,
    );
    const shape = (id) =>
        graph.elements.find((e) => e.id === `mermaid:${id}`).shape;
    assert.deepEqual(["User", "Web", "Gate", "Db", "Bus"].map(shape), [
        "Person",
        "Box",
        "Box",
        "Cylinder",
        "Pipe",
    ]);
    const user = graph.elements.find((e) => e.id === "mermaid:User");
    const web = graph.elements.find((e) => e.id === "mermaid:Web");
    assert.equal(user.width, user.height, "an actor at its own square");
    assert.equal(user.width, Math.round(PARTICIPANT_ROW * 1.5));
    assert.equal(
        user.y + user.height,
        web.y + web.height,
        "standing on the row",
    );
    const foot = graph.elements.find((e) => e.id === "mermaid:User#footer");
    const webFoot = graph.elements.find((e) => e.id === "mermaid:Web#footer");
    assert.equal(foot.y, webFoot.y, "hanging from the footer row");
    for (const element of graph.elements) {
        assert.deepEqual(element.targets, [], "no participant activates");
        assert.equal(element.fontSize, 14);
    }
    assert.deepEqual(graph.focusOrder, []);
});

test("the Person's arms reach the bottom at C4's size, and stop at the body's curve in an actor's small box", () => {
    const armEnds = (size) =>
        shapeGeometry("Person", size, size, 2)
            .parts.find((part) => part.paint === "rule")
            .d.match(/L [\d.]+ ([\d.]+)/g)
            .map((segment) => Number(segment.split(" ")[2]));
    assert.deepEqual(armEnds(400), [400, 400], "C4 sizes unchanged");
    for (const end of armEnds(Math.round(PARTICIPANT_ROW * 1.5)))
        assert.ok(end < Math.round(PARTICIPANT_ROW * 1.5));
});

test("a silent source fills participants with the primary color, lifelines in it, and bars mixed toward the canvas", () => {
    for (const [scheme, primary, canvas, fill, stroke] of [
        ["light", "#145b9e", "#ffffff", 0.85, 0.55],
        ["dark", "#1168bd", "#111111", 0.55, 0.3],
    ]) {
        const graph = graphOf(
            modelOf("sequenceDiagram\n  A->>+B: hi\n  B-->>-A: bye\n"),
            scheme,
        );
        const a = graph.elements.find((e) => e.id === "mermaid:A");
        assert.equal(a.background, primary, scheme);
        assert.equal(a.color, "#ffffff");
        const [line] = shapes(graph.sequence.back, "lifeline");
        assert.equal(line.attrs.stroke, primary);
        const [bar] = shapes(graph.sequence.back, "activation");
        assert.equal(bar.attrs.fill, mix(primary, canvas, fill));
        assert.equal(bar.attrs.stroke, mix(primary, canvas, stroke));
    }
});

test("notes draw gray, fragments in the edge color with no fill, and a plain rect a faint tint of the primary color", () => {
    const source =
        "sequenceDiagram\n  Note over A: n\n  loop L\n    A->>B: a\n  end\n  rect\n    A->>B: b\n  end\n  rect rgb(1, 2, 3)\n    A->>B: c\n  end\n";
    for (const [scheme, note, canvas, primary] of [
        ["light", "#e6e6e6", "#ffffff", "#145b9e"],
        ["dark", "#474949", "#111111", "#1168bd"],
    ]) {
        const graph = graphOf(modelOf(source), scheme);
        assert.equal(shapes(graph.sequence.front, "note")[0].attrs.fill, note);
        const [loop] = shapes(graph.sequence.back, "fragment loop");
        assert.equal(loop.attrs.fill, "none");
        assert.equal(loop.attrs.stroke, graph.edges[0].color);
        const [plain, colored] = shapes(graph.sequence.back, "fragment rect");
        assert.equal(plain.attrs.fill, mix(primary, canvas, 0.85));
        assert.equal(colored.attrs.fill, "rgb(1, 2, 3)", "as written");
    }
});

test("the workspace's Element, Relationship and Mermaid styles sit over the silent look", () => {
    const json = mermaidWorkspace([
        mermaidView("seq", "sequenceDiagram\n  A->>B: hi\n"),
    ]);
    json.views.configuration.styles = {
        elements: [{ tag: "Mermaid", background: "#008800", fontSize: 20 }],
        relationships: [{ tag: "Mermaid", color: "#880000", thickness: 4 }],
    };
    readMermaidDiagrams(json);
    const graph = graphOf(new WorkspaceModel(json));
    const a = graph.elements.find((e) => e.id === "mermaid:A");
    assert.equal(a.background, "#008800");
    assert.equal(a.fontSize, 20);
    assert.equal(graph.edges[0].color, "#880000");
    assert.equal(graph.edges[0].thickness, 4);
    assert.equal(
        shapes(graph.sequence.back, "lifeline")[0].attrs.stroke,
        "#008800",
    );
});

test("messages are straight edges with the markers their syntax names, and their labels draw bare in front", () => {
    const graph = graphOf(
        modelOf(
            "sequenceDiagram\n  A->>B: arrow\n  A--)B: open\n  A-xB: cross\n  A->B: none\n  A<<->>B: both\n",
        ),
    );
    const [arrow, open, cross, none, both] = graph.edges;
    assert.deepEqual(
        graph.edges.map((e) => e.style),
        ["Solid", "Dotted", "Solid", "Solid", "Solid"],
    );
    for (const edge of graph.edges) {
        assert.equal(edge.route.length, 2);
        assert.equal(edge.route[0].y, edge.route[1].y, "horizontal");
        assert.equal(edge.labelBox, undefined, "no backing");
        assert.deepEqual(edge.targets, []);
    }
    assert.ok(arrow.arrowhead && !arrow.markerStroke);
    assert.ok(!open.arrowhead && open.markerStroke);
    assert.ok(!cross.arrowhead && cross.markerStroke);
    assert.equal(none.arrowhead, "");
    assert.equal(none.markerStroke, undefined);
    assert.equal((both.arrowhead.match(/M/g) ?? []).length, 2, "both ends");
    const labels = graph.sequence.front.filter((s) => s.tag === "text");
    assert.deepEqual(
        labels.map((s) => s.text),
        ["arrow", "open", "cross", "none", "both"],
    );
});

test("a sequence diagram hides only its technologies toggle", () => {
    const model = new WorkspaceModel(FIXTURE);
    assert.deepEqual(inertToggles(model.findViewByKey("checkout")), {
        descriptions: false,
        technologies: true,
    });
});

test("every fixture view draws in both schemes, every construct on the constructs view", () => {
    const model = new WorkspaceModel(FIXTURE);
    for (const key of FIXTURE.views.imageViews.map((v) => v.key))
        for (const scheme of ["light", "dark"]) {
            const graph = buildGraph(model, key, scheme, LABELS, measure);
            assert.equal(graph.error, undefined, `${key} ${scheme}`);
            assert.ok(graph.elements.length && graph.edges.length);
        }
    const graph = buildGraph(model, "constructs", "light", LABELS, measure);
    assert.equal(shapes(marks(graph), "dot").length, 4);
    assert.equal(shapes(marks(graph), "dot")[0].attrs.r, DOT_RADIUS);
    assert.equal(shapes(graph.sequence.front, "note").length, 4);
    assert.equal(shapes(graph.sequence.back, "box").length, 1);
    assert.equal(shapes(graph.sequence.back, "fragment par").length, 1);
    assert.equal(shapes(graph.sequence.back, "fragment rect").length, 2);
    assert.ok(
        graph.elements.some((e) => e.id === "mermaid:Cache#footer"),
        "the destroyed participant's footer draws at its last message",
    );
});

/* ------------------------------------------------------------------ export */

test("a sequence diagram exports its layers around the edges, as the canvas draws them", () => {
    const graph = buildGraph(
        new WorkspaceModel(FIXTURE),
        "checkout",
        "light",
        LABELS,
        measure,
    );
    const { svg } = exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Checkout",
            description: "",
            user: "Unknown",
            modified: "10/16/2026",
        },
        text: {
            measure,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    });
    const at = (needle) => {
        const index = svg.indexOf(needle);
        assert.ok(index >= 0, needle);
        return index;
    };
    const lifeline = at('stroke-width="1"/>');
    const edge = at(graph.edges[0].path);
    const note = at(">Waits for email</text>");
    const participant = at('<g data-element-id="mermaid:Customer">');
    assert.ok(lifeline < edge, "lifelines behind the messages");
    assert.ok(edge < note, "notes in front of them");
    assert.ok(note < participant, "participants on top");
    assert.match(svg, />Place order<\/text>/, "message labels as text");
    assert.match(svg, />1<\/text>/, "sequence numbers");
    assert.doesNotMatch(svg, /data-sequence/, "no page hooks in the file");
});

test("an export with descriptions off leaves the notes out", () => {
    const graph = buildGraph(
        new WorkspaceModel(FIXTURE),
        "checkout",
        "light",
        { ...LABELS, descriptions: false },
        measure,
    );
    const { svg } = exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: "Checkout",
            description: "",
            user: "Unknown",
            modified: "10/16/2026",
        },
        text: {
            measure,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    });
    assert.doesNotMatch(svg, />Waits for email<\/text>/);
    assert.match(svg, />Place order<\/text>/);
});

/* ------------------------------------------------- styling from the source */

const init = (config) => `%%{init: ${JSON.stringify(config)}}%%\n`;

/** Every part a palette colors: participants, a bar, a note, a loop, a rect and numbers. */
const STYLED =
    "sequenceDiagram\n  autonumber\n  A->>+B: hi\n  Note over A: n\n  loop L\n    B-->>-A: bye\n  end\n  rect\n    A->>B: c\n  end\n";

/** The shape `offset` places after `shape` in `layer`. */
const after = (layer, shape, offset) => layer[layer.indexOf(shape) + offset];

const paletteOf = (model) => model.findViewByKey("seq").mermaid.palette;

test("a themed source colors every part from its palette, over the workspace's styles", () => {
    const json = mermaidWorkspace([
        mermaidView("seq", `${init({ theme: "forest" })}${STYLED}`),
    ]);
    json.views.configuration.styles = {
        elements: [{ tag: "Mermaid", background: "#008800", fontSize: 20 }],
        relationships: [{ tag: "Mermaid", color: "#880000" }],
    };
    readMermaidDiagrams(json);
    const model = new WorkspaceModel(json);
    const { colors } = paletteOf(model);
    const graph = graphOf(model);
    const a = graph.elements.find((e) => e.id === "mermaid:A");
    assert.equal(
        a.background,
        colors.actorBkg,
        "the config over the workspace",
    );
    assert.equal(a.stroke, colors.actorBorder);
    assert.equal(a.color, colors.actorTextColor);
    assert.equal(a.fontSize, 20, "what the palette leaves alone");
    assert.equal(graph.edges[0].color, colors.signalColor);
    assert.equal(graph.edges[0].labelColor, colors.signalTextColor);
    const { back, front } = graph.sequence;
    assert.equal(
        shapes(back, "lifeline")[0].attrs.stroke,
        colors.actorLineColor,
    );
    const [bar] = shapes(back, "activation");
    assert.equal(bar.attrs.fill, colors.activationBkgColor);
    assert.equal(bar.attrs.stroke, colors.activationBorderColor);
    const [note] = shapes(front, "note");
    assert.equal(note.attrs.fill, colors.noteBkgColor);
    assert.equal(note.attrs.stroke, colors.noteBorderColor);
    assert.equal(after(front, note, 1).attrs.fill, colors.noteTextColor);
    const [loop] = shapes(back, "fragment loop");
    assert.equal(loop.attrs.stroke, colors.labelBoxBorderColor);
    assert.equal(after(back, loop, 1).attrs.fill, colors.labelBoxBkgColor);
    assert.equal(after(back, loop, 2).attrs.fill, colors.labelTextColor);
    assert.equal(after(back, loop, 3).attrs.fill, colors.loopTextColor);
    const [rect] = shapes(back, "fragment rect");
    assert.equal(rect.attrs.fill, colors.rectBkgColor);
    assert.equal(rect.attrs["fill-opacity"], undefined);
    const [number] = shapes(marks(graph), "number");
    assert.equal(number.attrs.fill, colors.signalColor);
    assert.equal(
        after(marks(graph), number, 1).attrs.fill,
        colors.sequenceNumberColor,
    );
});

test("in dark mode a light palette keeps its fills, and what draws on the canvas follows the scheme", () => {
    const model = modelOf(`${init({ theme: "forest" })}${STYLED}`);
    const { colors } = paletteOf(model);
    const silent = graphOf(modelOf(STYLED), "dark");
    const graph = graphOf(model, "dark");
    const a = graph.elements.find((e) => e.id === "mermaid:A");
    assert.equal(a.background, colors.actorBkg, "fills keep the source's");
    const { back, front } = graph.sequence;
    assert.equal(shapes(front, "note")[0].attrs.fill, colors.noteBkgColor);
    assert.equal(
        shapes(back, "activation")[0].attrs.fill,
        colors.activationBkgColor,
    );
    assert.equal(graph.edges[0].color, silent.edges[0].color, "messages");
    assert.equal(graph.edges[0].labelColor, undefined);
    const [loop] = shapes(back, "fragment loop");
    assert.equal(loop.attrs.stroke, graph.edges[0].color, "fragment lines");
    assert.equal(after(back, loop, 3).attrs.fill, "#cccccc", "their titles");
    assert.equal(
        shapes(back, "lifeline")[0].attrs.stroke,
        colors.actorBkg,
        "lifelines in the participant's fill",
    );
    const [number] = shapes(marks(graph), "number");
    assert.equal(number.attrs.fill, graph.edges[0].color);
    assert.equal(after(marks(graph), number, 1).attrs.fill, "#111111");
    const [rect] = shapes(back, "fragment rect");
    assert.equal(rect.attrs.fill, colors.rectBkgColor);
    assert.equal(rect.attrs["fill-opacity"], 0.2, "a sourced rect fades");
});

test("a dark palette draws its own canvas colors in both schemes", () => {
    const model = modelOf(`${init({ theme: "dark" })}${STYLED}`);
    const { colors } = paletteOf(model);
    for (const scheme of ["light", "dark"]) {
        const graph = graphOf(model, scheme);
        assert.equal(graph.edges[0].color, colors.signalColor, scheme);
        const [rect] = shapes(graph.sequence.back, "fragment rect");
        assert.equal(rect.attrs["fill-opacity"], undefined, scheme);
    }
});

test("a rect's own color fades to 20 percent in dark mode only, on a silent source too", () => {
    const model = modelOf(
        "sequenceDiagram\n  rect rgb(1, 2, 3)\n    A->>B: c\n  end\n  rect\n    A->>B: d\n  end\n",
    );
    const [light] = shapes(graphOf(model).sequence.back, "fragment rect");
    assert.equal(light.attrs["fill-opacity"], undefined);
    const [colored, plain] = shapes(
        graphOf(model, "dark").sequence.back,
        "fragment rect",
    );
    assert.equal(colored.attrs.fill, "rgb(1, 2, 3)");
    assert.equal(colored.attrs["fill-opacity"], 0.2);
    assert.equal(plain.attrs["fill-opacity"], undefined, "a tint doesn't");
});

test("redux-color fills and outlines each participant and its bars in its own color", () => {
    const body = "sequenceDiagram\n  A->>+B: hi\n  B-->>-A: bye\n";
    const model = modelOf(`${init({ theme: "redux-color" })}${body}`);
    const { participants } = paletteOf(model);
    for (const scheme of ["light", "dark"]) {
        const graph = graphOf(model, scheme);
        const [a, b] = ["A", "B"].map((id) =>
            graph.elements.find((e) => e.id === `mermaid:${id}`),
        );
        assert.equal(a.background, participants[0].background, scheme);
        assert.equal(a.stroke, participants[0].stroke);
        assert.equal(b.background, participants[1].background);
        const [bar] = shapes(graph.sequence.back, "activation");
        assert.equal(bar.attrs.fill, participants[1].background);
        assert.equal(bar.attrs.stroke, participants[1].stroke);
    }
    const dark = modelOf(`${init({ theme: "redux-dark-color" })}${body}`);
    const palette = paletteOf(dark);
    const a = graphOf(dark).elements.find((e) => e.id === "mermaid:A");
    assert.equal(a.background, palette.colors.actorBkg, "no fill of its own");
    assert.equal(a.stroke, palette.participants[0].stroke);
});

test("the source's fontSize scales every sequence text from Mermaid's 16 px", () => {
    const graph = graphOf(
        modelOf(
            `${init({ themeVariables: { fontSize: "24px" } })}sequenceDiagram\n  A->>B: hi\n`,
        ),
    );
    const a = graph.elements.find((e) => e.id === "mermaid:A");
    assert.equal(a.fontSize, 21);
    assert.equal(graph.edges[0].fontSize, 30);
});

test("the source's fontSize replaces the workspace's font sizes", () => {
    const json = mermaidWorkspace([
        mermaidView(
            "seq",
            `${init({ themeVariables: { fontSize: "24px" } })}sequenceDiagram\n  A->>B: hi\n`,
        ),
    ]);
    json.views.configuration.styles = {
        elements: [{ tag: "Mermaid", fontSize: 20 }],
        relationships: [{ tag: "Mermaid", fontSize: 40 }],
    };
    readMermaidDiagrams(json);
    const graph = graphOf(new WorkspaceModel(json));
    const a = graph.elements.find((e) => e.id === "mermaid:A");
    assert.equal(a.fontSize, 21);
    assert.equal(graph.edges[0].fontSize, 30);
});

test("the fixture draws one source themed, in redux-color and silent, in both schemes", () => {
    const model = new WorkspaceModel(FIXTURE);
    const fill = (graph, id) =>
        graph.elements.find((e) => e.id === `mermaid:${id}`).background;
    const themed = model.findViewByKey("themed").mermaid.palette;
    const redux = model.findViewByKey("redux").mermaid.palette;
    assert.equal(model.findViewByKey("silent").mermaid.palette, undefined);
    for (const [scheme, primary] of [
        ["light", "#145b9e"],
        ["dark", "#1168bd"],
    ]) {
        const draw = (key) => buildGraph(model, key, scheme, LABELS, measure);
        assert.equal(fill(draw("themed"), "Web"), themed.colors.actorBkg);
        assert.deepEqual(
            ["Customer", "Web", "Orders", "Stock"].map((id) =>
                fill(draw("redux"), id),
            ),
            redux.participants.map((p) => p.background),
            scheme,
        );
        assert.equal(fill(draw("silent"), "Web"), primary, scheme);
        for (const key of ["themed", "redux", "silent"]) {
            const { back } = draw(key).sequence;
            const [rect] = shapes(back, "fragment rect");
            const [box] = shapes(back, "box");
            assert.equal(rect.attrs.fill, "rgb(255, 230, 200)", key);
            assert.equal(box.attrs.fill, "rgb(230, 240, 255)", key);
            for (const shape of [rect, box])
                assert.equal(
                    shape.attrs["fill-opacity"],
                    scheme === "dark" ? 0.2 : undefined,
                    `${key} ${scheme}: a source's backdrop fades in dark mode`,
                );
        }
    }
});

/* ---------------------------------------------------- descriptions toggle */

test("descriptions off hides the notes, lays out without them and keeps a notes-only fragment", () => {
    const model = modelOf(
        "sequenceDiagram\n  A->>B: a\n  Note right of B: beside\n  opt Only a note\n    Note over A: n\n  end\n  A->>B: b\n",
    );
    const on = graphOf(model);
    const off = buildGraph(
        model,
        "seq",
        "light",
        { ...LABELS, descriptions: false },
        measure,
    );
    assert.equal(shapes(on.sequence.front, "note").length, 2);
    assert.equal(shapes(off.sequence.front, "note").length, 0);
    assert.ok(off.bounds.height < on.bounds.height, "the gaps close");
    assert.equal(shapes(off.sequence.back, "fragment opt").length, 1);
    assert.ok(
        off.sequence.back.some((s) => s.text === "[Only a note]"),
        "with its title",
    );
    assert.deepEqual(
        off.edges.map((e) => e.description),
        ["a", "b"],
        "message labels always draw",
    );
});

/* -------------------------------------------------------------- animation */

/**
 * Every unit a step fades: a bar its first message opens, a note before a
 * message and one after the last, a loop, and an alt whose middle section
 * holds only a note.
 */
const STEPPED = [
    "  A->>+B: one",
    "  Note over A: before two",
    "  B->>C: two",
    "  loop L",
    "    C->>B: three",
    "  end",
    "  alt yes",
    "    B-->>-A: four",
    "  else no",
    "    Note over A: only a note",
    "  else maybe",
    "    A->>B: five",
    "  end",
    "  Note over B: after the last",
].join("\n");

const stepped = () => graphOf(modelOf(`sequenceDiagram\n${STEPPED}\n`));

test("the layout records each bar's, note's, fragment's and section's message range as it places them", () => {
    const { activations, notes, fragments } = layout(STEPPED);
    assert.deepEqual(
        activations.map((bar) => bar.messages),
        [{ from: 0, to: 4 }],
        "a bar holds the message that opens it and the one that closes it",
    );
    assert.deepEqual(
        notes.map((note) => note.messages),
        [
            { from: 0, to: 2 },
            { from: 3, to: 5 },
            { from: 4, to: 5 },
        ],
        "a note steps with the messages on both sides of it, or with the one beside it at either end, even in a section with no messages",
    );
    const [loop, alt] = fragments;
    assert.deepEqual(loop.messages, { from: 2, to: 3 });
    assert.deepEqual(alt.messages, { from: 3, to: 5 });
    assert.deepEqual(
        alt.sections.map((section) => section.messages),
        [
            { from: 4, to: 4 },
            { from: 4, to: 5 },
        ],
        "a section of notes only holds no message",
    );
});

test("a nested fragment's range sits inside its parent's", () => {
    const { fragments } = layout(
        "  A->>B: a\n  loop L\n    alt x\n      A->>B: b\n    else y\n      A->>B: c\n    end\n  end",
    );
    const loop = fragments.find((f) => f.fragment === "loop");
    const alt = fragments.find((f) => f.fragment === "alt");
    assert.deepEqual(loop.messages, { from: 1, to: 3 });
    assert.deepEqual(alt.messages, { from: 1, to: 3 });
    assert.deepEqual(alt.sections[0].messages, { from: 2, to: 3 });
});

test("a sequence diagram steps once per message in source order, and one with no messages doesn't animate", () => {
    const graph = stepped();
    assert.equal(graph.animation.kind, "dynamic");
    assert.deepEqual(
        graph.animation.steps.map((step) => step.relationships),
        graph.edges.map((edge) => [edge.id]),
    );
    assert.deepEqual(graph.animation.steps[1].elements, [
        "mermaid:B",
        "mermaid:C",
    ]);
    assert.equal(graph.animation.zoom, false);
    const quiet = graphOf(
        modelOf("sequenceDiagram\n  participant A\n  Note over A: alone\n"),
    );
    assert.equal(quiet.animation, undefined);
});

/** The unit key of the `index`th shape that `name` hooks, in either layer. */
const unitOf = (graph, name, index = 0) => {
    const { unit } = [...graph.sequence.back, ...graph.sequence.front].filter(
        (shape) => shape.attrs["data-sequence"] === name,
    )[index];
    return unit && unitKey(unit);
};

/** The unit key of the text shape that reads `text`, in either layer. */
const unitOfText = (graph, text) => {
    const { unit } = [...graph.sequence.back, ...graph.sequence.front].find(
        (shape) => shape.text === text,
    );
    return unit && unitKey(unit);
};

test("a step shows its message, its two participants and what holds it, and fades the rest", () => {
    const graph = stepped();
    const second = stepStateOf(graph, 2);
    assert.deepEqual(Object.values(second.edges), [
        "faded",
        "shown",
        "faded",
        "faded",
        "faded",
    ]);
    assert.deepEqual(second.elements, {
        "mermaid:A": "faded",
        "mermaid:A#footer": "faded",
        "mermaid:B": "shown",
        "mermaid:B#footer": "shown",
        "mermaid:C": "shown",
        "mermaid:C#footer": "shown",
    });
    const units = second.sequence;
    assert.equal(units[unitOf(graph, "lifeline", 0)], "faded");
    assert.equal(units[unitOf(graph, "lifeline", 2)], "shown");
    assert.equal(units[unitOf(graph, "activation")], "shown");
    assert.equal(units[unitOf(graph, "note", 0)], "shown", "before two");
    assert.equal(units[unitOf(graph, "note", 2)], "faded");
    assert.equal(
        stepStateOf(graph, 1).sequence[unitOf(graph, "note", 0)],
        "shown",
        "and after one",
    );
    assert.equal(
        stepStateOf(graph, 3).sequence[unitOf(graph, "note", 0)],
        "faded",
    );
    assert.equal(units[unitOf(graph, "fragment loop")], "faded");
    assert.equal(units["message:1"], "shown");
    assert.equal(units["message:0"], "faded");

    const fourth = stepStateOf(graph, 4).sequence;
    assert.equal(fourth[unitOf(graph, "fragment alt")], "shown");
    assert.equal(fourth[unitOf(graph, "section", 1)], "faded");
    const fifth = stepStateOf(graph, 5).sequence;
    assert.equal(fifth[unitOf(graph, "activation")], "faded", "closed at four");
    assert.equal(fifth[unitOf(graph, "note", 2)], "shown", "after the last");
    assert.equal(fifth[unitOf(graph, "fragment alt")], "shown");
    assert.equal(fifth[unitOf(graph, "section", 1)], "shown");
    for (let step = 1; step <= 5; step++) {
        const units = stepStateOf(graph, step).sequence;
        assert.equal(
            units[unitOf(graph, "section", 0)],
            "faded",
            `a section with no messages stays faded at step ${step}`,
        );
        assert.equal(
            units[unitOf(graph, "note", 1)],
            step === 4 || step === 5 ? "shown" : "faded",
            `its note shows with four and five only, at step ${step}`,
        );
    }
    assert.equal(stepStateOf(graph, null).sequence, undefined, "Stop");
});

test("box groupings never fade, and a created participant fades until a message involves it", () => {
    const graph = graphOf(
        modelOf(
            "sequenceDiagram\n  box Group\n    participant A\n  end\n  participant B\n  A->>B: hi\n  create participant S\n  B->>S: start\n  destroy S\n  B-xS: stop\n",
        ),
    );
    assert.equal(
        graph.sequence.back.find((s) => s.attrs["data-sequence"] === "box")
            .unit,
        undefined,
    );
    assert.equal(stepStateOf(graph, 1).elements["mermaid:S"], "faded");
    assert.equal(stepStateOf(graph, 2).elements["mermaid:S"], "shown");
    assert.equal(stepStateOf(graph, 3).elements["mermaid:S#footer"], "shown");
});

test("a unit's shapes sit next to each other, so each draws under one opacity", () => {
    const graph = graphOf(new WorkspaceModel(FIXTURE), "light", "retry");
    for (const layer of [graph.sequence.back, graph.sequence.front]) {
        const groups = sequenceGroups(layer);
        const units = groups.flatMap((g) => (g.key ? [g.key] : []));
        assert.equal(new Set(units).size, units.length, "one group per unit");
        assert.equal(
            groups.reduce((n, g) => n + g.shapes.length, 0),
            layer.length,
            "no shape is left out",
        );
    }
    const group = (name) =>
        sequenceGroups(graph.sequence.back).find(
            (g) => g.key === unitOf(graph, name),
        );
    assert.deepEqual(
        group("fragment alt").shapes.map((s) => s.tag),
        ["rect", "polygon", "text"],
        "a frame with sections: border, tab and keyword",
    );
    assert.deepEqual(
        group("fragment loop").shapes.map((s) => s.tag),
        ["rect", "polygon", "text", "text"],
        "a frame with no sections: border, tab, keyword and title",
    );
});

test("the first section's condition steps with its section, and the frame with all of them", () => {
    const graph = stepped();
    const condition = unitOfText(graph, "[yes]");
    const frame = unitOf(graph, "fragment alt");
    assert.notEqual(condition, frame);
    assert.equal(
        condition,
        unitKey({
            kind: "section",
            fragment: 1,
            index: 0,
            messages: { from: 3, to: 4 },
        }),
    );
    const at = (step) => stepStateOf(graph, step).sequence;
    assert.equal(at(4)[condition], "shown", "four is in the first section");
    assert.equal(at(4)[frame], "shown");
    assert.equal(at(5)[condition], "faded", "five is in the last");
    assert.equal(at(5)[frame], "shown");
    assert.equal(at(5)[unitOfText(graph, "[maybe]")], "shown");
    assert.equal(at(4)[unitOfText(graph, "[maybe]")], "faded");
    assert.equal(
        unitOfText(graph, "[L]"),
        unitOf(graph, "fragment loop"),
        "a loop's title stays with its frame",
    );
});

test("a note in a section with no messages, however deep, holds the messages on both sides of it, and their focus boxes take it in", () => {
    const { notes } = layout(
        "  A->>B: a\n  loop L\n    Note over A: only a note\n  end\n  opt O\n    alt x\n      A->>B: b\n    else y\n      Note over B: nested\n    end\n  end\n  A->>B: c",
    );
    assert.deepEqual(
        notes.map((note) => note.messages),
        [
            { from: 0, to: 2 },
            { from: 1, to: 3 },
        ],
    );
    const graph = stepped();
    const note = shapes(graph.sequence.front, "note")[1];
    for (let step = 1; step <= 5; step++) {
        const { focus } = stepStateOf(graph, step);
        const inside =
            focus.y <= note.attrs.y &&
            focus.y + focus.height >= note.attrs.y + note.attrs.height;
        const outside =
            focus.y > note.attrs.y + note.attrs.height ||
            focus.y + focus.height < note.attrs.y;
        assert.ok(
            step === 4 || step === 5 ? inside : outside,
            `step ${step}'s focus box ${step >= 4 ? "takes in" : "leaves out"} the note`,
        );
    }
});

test("a run of notes between two messages shows at both their steps, one at either end with the message beside it", () => {
    const { notes } = layout(
        "  Note over A: first\n  A->>B: a\n  Note over A: one\n  Note over B: two\n  A->>B: b\n  Note over B: last",
    );
    assert.deepEqual(
        notes.map((note) => note.messages),
        [
            { from: 0, to: 1 },
            { from: 0, to: 2 },
            { from: 0, to: 2 },
            { from: 1, to: 2 },
        ],
    );
    const only = layout(
        "  Note over A: before\n  A->>B: a\n  Note over B: after",
    );
    assert.deepEqual(
        only.notes.map((note) => note.messages),
        [
            { from: 0, to: 1 },
            { from: 0, to: 1 },
        ],
        "with one message, both notes step with it",
    );
});

test("the fixture's notes show at the steps on both sides of them", () => {
    const model = new WorkspaceModel(FIXTURE);
    const at = (key, text) => {
        const graph = buildGraph(model, key, "light", LABELS, measure);
        const unit = unitOfText(graph, text);
        return graph.edges.map(
            (_, i) => stepStateOf(graph, i + 1).sequence[unit],
        );
    };
    assert.deepEqual(
        at("steps", "Nothing to resume"),
        ["faded", "faded", "shown", "shown", "faded", "faded"],
        "with Resume and Locked",
    );
    for (const key of ["redux", "themed", "silent"])
        assert.deepEqual(
            at(key, "Waits on the confirmation page").slice(0, 3),
            ["shown", "shown", "faded"],
            `${key}: with Place order and Create order`,
        );
});

test("a step's focus box is its message's row with its notes, as wide as its two participants' columns", () => {
    const graph = stepped();
    const { focus } = stepStateOf(graph, 2);
    const head = (id) => graph.elements.find((e) => e.id === id);
    const c = head("mermaid:C");
    const note = graph.sequence.front.find(
        (s) => s.attrs["data-sequence"] === "note",
    );
    const line = graph.edges[1].route[0].y;
    assert.equal(focus.x, note.attrs.x - 15, "with the note over A");
    assert.equal(focus.y, note.attrs.y - 15, "above it");
    assert.equal(focus.x + focus.width, c.x + c.width + 15, "to C's column");
    const bottom = focus.y + focus.height;
    assert.ok(bottom > line && bottom < line + 30, "down to its line");
    const first = stepStateOf(graph, 1).focus;
    assert.equal(
        first.y + first.height,
        note.attrs.y + note.attrs.height + 15,
        "step one takes in the note after it",
    );
    assert.equal(first.x, note.attrs.x - 15);
    const third = stepStateOf(graph, 3).focus;
    const b = head("mermaid:B");
    assert.equal(third.x, b.x - 15, "a step with no note: B's column");
    assert.equal(third.x + third.width, c.x + c.width + 15, "to C's");
});

test("zoomOnAnimation applies to a sequence diagram, read from the view, then the view set", () => {
    const zoomOf = (properties, set = {}) => {
        const json = mermaidWorkspace(
            [
                mermaidView("seq", "sequenceDiagram\n  A->>B: hi\n", {
                    properties,
                }),
            ],
            set,
        );
        readMermaidDiagrams(json);
        return graphOf(new WorkspaceModel(json)).animation.zoom;
    };
    const on = { "structurizr.zoomOnAnimation": "true" };
    const off = { "structurizr.zoomOnAnimation": "false" };
    assert.equal(zoomOf(on), true);
    assert.equal(zoomOf({}, on), true);
    assert.equal(zoomOf(off, on), false);
});

test("with descriptions off a step keeps its units, and its focus box loses the notes", () => {
    const model = modelOf(`sequenceDiagram\n${STEPPED}\n`);
    const on = graphOf(model);
    const off = buildGraph(
        model,
        "seq",
        "light",
        { ...LABELS, descriptions: false },
        measure,
    );
    assert.equal(off.animation.steps.length, on.animation.steps.length);
    const [a, b] = [stepStateOf(on, 2), stepStateOf(off, 2)];
    assert.deepEqual(b.edges, a.edges);
    assert.deepEqual(b.elements, a.elements);
    for (const name of ["fragment loop", "fragment alt", "activation"])
        assert.equal(
            b.sequence[unitOf(off, name)],
            a.sequence[unitOf(on, name)],
        );
    assert.ok(b.focus.height < a.focus.height, "the row shrinks");
});

test("every fixture view steps once per message, and the steps view fits each step", () => {
    const model = new WorkspaceModel(FIXTURE);
    for (const key of FIXTURE.views.imageViews.map((v) => v.key))
        for (const scheme of ["light", "dark"]) {
            const graph = buildGraph(model, key, scheme, LABELS, measure);
            assert.equal(
                graph.animation.steps.length,
                graph.edges.length,
                `${key} ${scheme}`,
            );
            for (let step = 1; step <= graph.edges.length; step++)
                assert.ok(stepStateOf(graph, step).focus, `${key} ${step}`);
        }
    const steps = buildGraph(model, "steps", "light", LABELS, measure);
    assert.equal(steps.animation.zoom, true);
    assert.equal(
        buildGraph(model, "checkout", "light", LABELS, measure).animation.zoom,
        false,
    );
    const empty = unitOf(steps, "section", 0);
    for (let step = 1; step <= steps.edges.length; step++)
        assert.equal(stepStateOf(steps, step).sequence[empty], "faded");
});

/** An export of `graph` at `step`, framed as the page frames it. */
const exportAt = (graph, step) =>
    exportSvg({
        graph,
        step: step === null ? undefined : stepStateOf(graph, step),
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: graph.title,
            description: "",
            user: "Unknown",
            modified: "10/16/2026",
        },
        text: {
            measure,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    }).svg;

test("an export at a step draws each faded unit inside one group, and leaves no shape out", () => {
    const graph = stepped();
    const full = exportAt(graph, null);
    const svg = exportAt(graph, 2);
    assert.doesNotMatch(full, /<g opacity="0\.2">/);
    assert.match(
        svg,
        /<g opacity="0\.2"><rect [^>]*\/><text [^>]*>after the last<\/text><\/g>/,
        "a faded note's box and text in one group",
    );
    assert.match(
        svg,
        /<g opacity="0\.2"><rect [^>]*\/><polygon [^>]*\/><text [^>]*>loop<\/text><text [^>]*>\[L\]<\/text><\/g>/,
        "a faded frame's border, tab, keyword and title in one group",
    );
    assert.doesNotMatch(
        svg,
        /<g opacity="0\.2"><rect [^>]*\/><text [^>]*>before two</,
        "the step's own note shows",
    );
    const texts = (doc) =>
        [...doc.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    assert.deepEqual(texts(svg), texts(full), "every shape draws, in order");
});

test("a faded message draws its arrow, number and dots inside one group, and its label in front", () => {
    const graph = graphOf(
        modelOf(
            "sequenceDiagram\n  autonumber\n  A->>B: one\n  B->>()C: two\n",
        ),
    );
    const [, two] = graph.edges;
    assert.deepEqual(
        two.marks.map((s) => s.attrs["data-sequence"] ?? s.tag),
        ["dot", "number", "text"],
        "its dot and number draw with its arrow",
    );
    assert.deepEqual(
        graph.sequence.front
            .filter((s) => s.unit && unitKey(s.unit) === "message:1")
            .map((s) => s.text),
        ["two"],
        "only its label stays in front",
    );
    const svg = exportAt(graph, 1);
    assert.match(
        svg,
        /<g opacity="0\.2"><g opacity="1"><path [^>]*\/><path [^>]*\/><\/g><circle [^>]*\/><circle [^>]*\/><text [^>]*>2<\/text><\/g>/,
        "arrow, dot and number in one group",
    );
    assert.match(svg, /<g opacity="0\.2"><text [^>]*>two<\/text><\/g>/);
    assert.doesNotMatch(
        exportAt(graph, 2),
        /<g opacity="0\.2"><g opacity="1"><path [^>]*\/><path [^>]*\/><\/g><circle [^>]*\/><circle /,
        "at its own step it shows",
    );
});

test("a destroy arrowhead fades and shows with its message", () => {
    const graph = graphOf(
        modelOf(
            "sequenceDiagram\n  A->>B: hi\n  create participant S\n  B->>S: start\n  destroy S\n  B-xS: stop\n",
        ),
    );
    const stop = graph.edges[2];
    assert.ok(stop.markerStroke, "the cross is a stroked marker");
    const cross = `d="${stop.markerStroke}"`;
    const faded = (step) => {
        const svg = exportAt(graph, step);
        const group = svg.indexOf(
            `<g opacity="0.2"><g opacity="1"><path d="${stop.path}"`,
        );
        return group >= 0 && svg.indexOf(cross) > group;
    };
    assert.equal(stepStateOf(graph, 1).edges[stop.key], "faded");
    assert.equal(stepStateOf(graph, 3).edges[stop.key], "shown");
    assert.ok(faded(1), "the cross fades inside its message's group");
    assert.ok(!faded(3), "and shows at its step");
    assert.ok(exportAt(graph, 3).includes(cross));
});
