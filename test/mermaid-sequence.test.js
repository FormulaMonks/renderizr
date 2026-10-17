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
const { mix } = await importSrc("engine/react-flow/sequence-graph");
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

test("a sequence diagram draws no animation, and only its technologies toggle hides", () => {
    const model = new WorkspaceModel(FIXTURE);
    assert.deepEqual(inertToggles(model.findViewByKey("checkout")), {
        descriptions: false,
        technologies: true,
    });
    const graph = buildGraph(model, "checkout", "light", LABELS, measure);
    assert.equal(graph.animation, undefined);
});

test("every fixture view draws in both schemes, every construct on the constructs view", () => {
    const model = new WorkspaceModel(FIXTURE);
    for (const key of ["checkout", "retry", "sign-in", "shapes", "constructs"])
        for (const scheme of ["light", "dark"]) {
            const graph = buildGraph(model, key, scheme, LABELS, measure);
            assert.equal(graph.error, undefined, `${key} ${scheme}`);
            assert.ok(graph.elements.length && graph.edges.length);
        }
    const graph = buildGraph(model, "constructs", "light", LABELS, measure);
    assert.equal(shapes(graph.sequence.front, "dot").length, 4);
    assert.equal(shapes(graph.sequence.front, "dot")[0].attrs.r, DOT_RADIUS);
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
