/**
 * End markers on Mermaid edges (spec: End markers): the marker set's
 * geometry in `src/engine/geometry/markers.ts`, the router's fit for them
 * (straight ends, line insets, jump-overs, spreading), the flowchart edges
 * that carry them, and their export. C4 edges keep their one arrowhead,
 * which `test/edge-routing.test.js` and `test/export-parity.test.js` hold.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    mermaidView,
    mermaidWorkspace,
} from "../scripts/__fixtures__/mermaid.js";
import { readFlowchart } from "../scripts/mermaid/flowchart.js";
import { readMermaidDiagrams } from "../scripts/mermaid/index.js";
import { Ignored } from "../scripts/mermaid/warnings.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    END_MARKERS,
    edgeMarkers,
    endFit,
    isEndMarker,
    markerInset,
    markerLength,
    markerPaths,
    markerWidth,
    straightEnd,
} = await importSrc("engine/geometry/markers");
const { arrowheadPath, arrowheadSize } = await importSrc(
    "engine/geometry/line",
);
const { shapeGeometry } = await importSrc("engine/geometry/shapes/index");
const { fitRoom, spreadEnds } = await importSrc(
    "engine/geometry/routing/sides",
);
const { routeView } = await importSrc("engine/geometry/routing/route-view");
const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { estimateText } = await importSrc("engine/geometry/boundary");
const { exportSvg } = await importSrc("engine/react-flow/export-svg");
const { exportFrame } = await importSrc("engine/geometry/canvas");

/** The SVG file export writes for `graph`. */
const exported = (graph) =>
    exportSvg({
        graph,
        frame: exportFrame(undefined, graph.bounds),
        titleBlock: {
            view: graph.title,
            description: "",
            user: "Unknown",
            modified: "10/16/2026",
        },
        text: {
            measure: estimateText,
            ascent: 0.9,
            descent: 0.22,
            family: "Helvetica, Arial, sans-serif",
            fontFaces: "",
        },
    }).svg;

const EPSILON = 1e-3;
const THICKNESSES = [1, 2, 3, 5, 10];
const MARKERS = END_MARKERS.filter((marker) => marker !== "none");

/* ------------------------------------------------------------ path reading */

/** The points of SVG path data: every end point and control point. */
function pointsOf(d) {
    const tokens = d.match(/[MLQCAZ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) ?? [];
    const points = [];
    let command = "";
    let i = 0;
    while (i < tokens.length) {
        if (/^[A-Z]$/i.test(tokens[i])) {
            command = tokens[i++].toUpperCase();
            if (command === "Z") continue;
        }
        if (command === "A") {
            // rx ry rotation large sweep x y: only the end point is a point.
            points.push({ x: +tokens[i + 5], y: +tokens[i + 6] });
            i += 7;
        } else {
            points.push({ x: +tokens[i], y: +tokens[i + 1] });
            i += 2;
        }
    }
    return points;
}

/** How many subpaths path data has. */
const subpaths = (d) => (d.match(/M/g) ?? []).length;

/* ------------------------------------------------------------ the set */

test("the set holds every End marker the spec names", () => {
    assert.deepEqual(
        [...END_MARKERS],
        [
            "none",
            "arrow",
            "openArrow",
            "circle",
            "cross",
            "zeroOrOne",
            "one",
            "zeroOrMore",
            "oneOrMore",
        ],
    );
    assert.ok(END_MARKERS.every(isEndMarker));
    assert.equal(isEndMarker("arrow_barb"), false);
});

test("none draws nothing, takes no room and leaves the line whole", () => {
    for (const t of THICKNESSES) {
        assert.deepEqual(
            markerPaths("none", { x: 5, y: 5 }, { x: 1, y: 0 }, t),
            {
                fill: "",
                stroke: "",
            },
        );
        assert.equal(markerLength("none", t), 0);
        assert.equal(markerInset("none", t), 0);
        assert.equal(markerWidth("none", t), 0);
        assert.equal(straightEnd("none", t), 0);
    }
});

test("the arrow is the C4 arrowhead: filled, arrowheadSize long and wide, the line one thickness short", () => {
    const tip = { x: 40, y: 12 };
    const heading = { x: 0, y: 1 };
    for (const t of THICKNESSES) {
        assert.deepEqual(markerPaths("arrow", tip, heading, t), {
            fill: arrowheadPath(tip, heading, t),
            stroke: "",
        });
        assert.equal(markerLength("arrow", t), arrowheadSize(t));
        assert.equal(markerWidth("arrow", t), arrowheadSize(t));
        assert.equal(markerInset("arrow", t), t);
    }
});

test("every marker scales with the arrow, so its proportions hold at every thickness, the cap included", () => {
    for (const marker of MARKERS) {
        const ratio = markerLength(marker, 1) / arrowheadSize(1);
        const across = markerWidth(marker, 1) / arrowheadSize(1);
        for (const t of THICKNESSES) {
            assert.ok(
                Math.abs(markerLength(marker, t) / arrowheadSize(t) - ratio) <
                    EPSILON,
                `${marker} length at ${t}`,
            );
            assert.ok(
                Math.abs(markerWidth(marker, t) / arrowheadSize(t) - across) <
                    EPSILON,
                `${marker} width at ${t}`,
            );
        }
    }
});

test("each marker sits behind its tip, within its length along the line and its width across it", () => {
    const tip = { x: 0, y: 0 };
    for (const marker of MARKERS) {
        for (const t of THICKNESSES) {
            const { fill, stroke } = markerPaths(
                marker,
                tip,
                { x: 1, y: 0 },
                t,
            );
            const length = markerLength(marker, t);
            const half = markerWidth(marker, t) / 2;
            for (const { x, y } of pointsOf(`${fill} ${stroke}`)) {
                assert.ok(
                    x <= EPSILON && x >= -length - EPSILON,
                    `${marker} at ${t}: ${x} along`,
                );
                assert.ok(
                    Math.abs(y) <= half + EPSILON,
                    `${marker} at ${t}: ${y} across`,
                );
            }
        }
    }
});

test("a marker turns with its heading", () => {
    for (const marker of MARKERS) {
        const right = markerPaths(marker, { x: 0, y: 0 }, { x: 1, y: 0 }, 2);
        const down = markerPaths(marker, { x: 0, y: 0 }, { x: 0, y: 1 }, 2);
        const turned = pointsOf(`${right.fill} ${right.stroke}`).map(
            ({ x, y }) => ({ x: -y, y: x }),
        );
        const drawn = pointsOf(`${down.fill} ${down.stroke}`);
        assert.equal(drawn.length, turned.length, marker);
        for (const [i, point] of drawn.entries()) {
            assert.ok(
                Math.abs(point.x - turned[i].x) < EPSILON &&
                    Math.abs(point.y - turned[i].y) < EPSILON,
                `${marker} point ${i}`,
            );
        }
    }
});

test("arrows and flowchart circles fill; open arrows, crosses and cardinalities stroke", () => {
    const at = (marker) =>
        markerPaths(marker, { x: 0, y: 0 }, { x: 1, y: 0 }, 2);
    for (const marker of ["arrow", "circle"]) {
        assert.notEqual(at(marker).fill, "", marker);
        assert.equal(at(marker).stroke, "", marker);
    }
    for (const marker of [
        "openArrow",
        "cross",
        "zeroOrOne",
        "one",
        "zeroOrMore",
        "oneOrMore",
    ]) {
        assert.equal(at(marker).fill, "", marker);
        assert.notEqual(at(marker).stroke, "", marker);
    }
    assert.equal(subpaths(at("cross").stroke), 2, "a cross is two strokes");
    assert.equal(subpaths(at("one").stroke), 2, "exactly one is two bars");
});

test("a cross and a crow's foot let the line run to the tip; a circle ends it at its center", () => {
    for (const t of THICKNESSES) {
        assert.equal(markerInset("cross", t), 0);
        assert.equal(markerInset("one", t), 0);
        assert.equal(markerInset("oneOrMore", t), 0);
        // Mermaid's circle: radius 5.5 of its 8 px arrow, its center 6.6 back.
        const k = arrowheadSize(t) / 8;
        assert.ok(Math.abs(markerInset("circle", t) - 6.6 * k) < EPSILON);
        assert.ok(Math.abs(markerWidth("circle", t) - 11 * k) < EPSILON);
    }
});

test("a hollow circle breaks the line: the line ends at its far edge and the marker draws the piece inside", () => {
    const t = 2;
    const k = arrowheadSize(t) / 8;
    // Mermaid's ERD circles: radius 6, centered 21 back (zero or one) and
    // 30 back (zero or more).
    for (const [marker, center] of [
        ["zeroOrOne", 21],
        ["zeroOrMore", 30],
    ]) {
        assert.ok(
            Math.abs(markerInset(marker, t) - (center + 6) * k) < EPSILON,
            marker,
        );
        const { stroke } = markerPaths(
            marker,
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            t,
        );
        // The piece of line from the circle's near edge up to the tip.
        assert.match(
            stroke,
            new RegExp(`M ${-(center - 6) * k} 0 L 0 0`),
            marker,
        );
        assert.ok(stroke.includes(" A "), `${marker} draws its circle as arcs`);
    }
});

test("an end with a marker runs straight a little longer than the marker", () => {
    for (const marker of MARKERS) {
        for (const t of THICKNESSES) {
            assert.ok(straightEnd(marker, t) > markerLength(marker, t));
            assert.ok(straightEnd(marker, t) < markerLength(marker, t) + 30);
        }
    }
});

test("endFit gives each end of an edge the longest marker's straight end, its own inset and width", () => {
    const fit = endFit("none", "cross", 2);
    assert.deepEqual(fit.source, { room: 0, length: 0, inset: 0, width: 0 });
    assert.deepEqual(fit.target, {
        room: straightEnd("cross", 2),
        length: markerLength("cross", 2),
        inset: 0,
        width: markerWidth("cross", 2),
    });
    const both = endFit("arrow", "zeroOrMore", 2);
    assert.equal(both.source.room, straightEnd("zeroOrMore", 2));
    assert.equal(both.target.room, straightEnd("zeroOrMore", 2));
    assert.equal(both.source.inset, 2);
});

test("edgeMarkers draws the start marker at the route's first point, heading back out of it", () => {
    const route = [
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 80, y: 50 },
    ];
    const paths = edgeMarkers("arrow", "cross", route, 2);
    assert.equal(paths.fill, arrowheadPath({ x: 0, y: 0 }, { x: 0, y: -1 }, 2));
    assert.equal(
        paths.stroke,
        markerPaths("cross", { x: 80, y: 50 }, { x: 1, y: 0 }, 2).stroke,
    );
    const both = edgeMarkers("circle", "circle", route, 2);
    assert.equal(subpaths(both.fill), 2);
});

/* ------------------------------------------------------------ the router */

const element = (id, x, y, width = 160, height = 100) => ({
    id,
    x,
    y,
    geometry: shapeGeometry("Box", width, height),
});

const fitted = (key, sourceId, targetId, routing, start, end, extra = {}) => ({
    key,
    sourceId,
    targetId,
    routing,
    vertices: [],
    jump: false,
    thickness: 2,
    centered: true,
    ends: endFit(start, end, 2),
    ...extra,
});

/**
 * How far `route` runs from its `end` (`first` or `last`) along one straight
 * line, perpendicular to the box side it leaves.
 */
function straightRun(route, end) {
    const points = end === "first" ? route : [...route].reverse();
    const [a, b] = points;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    let run = 0;
    for (const point of points.slice(1)) {
        const dx = point.x - a.x;
        const dy = point.y - a.y;
        if (Math.abs(dx * uy - dy * ux) > EPSILON) break;
        run = dx * ux + dy * uy;
    }
    // The straight run leaves along a box axis.
    assert.ok(Math.abs(ux) < EPSILON || Math.abs(uy) < EPSILON);
    return run;
}

const LAYOUTS = {
    diagonal: [element("a", 0, 0), element("b", 400, 300)],
    "side by side": [element("a", 0, 0), element("b", 360, 40)],
    "stacked close": [element("a", 0, 0), element("b", 60, 150)],
    behind: [element("a", 400, 0), element("b", 0, 200)],
};

test("every end with a marker runs straight out of its side before the route bends, in every routing mode", () => {
    for (const routing of ["Orthogonal", "Direct", "Curved"]) {
        for (const [name, elements] of Object.entries(LAYOUTS)) {
            for (const [start, end] of [
                ["none", "arrow"],
                ["arrow", "arrow"],
                ["circle", "cross"],
                ["zeroOrMore", "one"],
            ]) {
                const edge = fitted("e", "a", "b", routing, start, end);
                const [{ route }] = routeView(elements, [edge]);
                const where = `${routing}, ${name}, ${start}–${end}`;
                if (start !== "none") {
                    assert.ok(
                        straightRun(route, "first") >=
                            edge.ends.source.length - EPSILON,
                        `${where}: source`,
                    );
                }
                assert.ok(
                    straightRun(route, "last") >=
                        edge.ends.target.length - EPSILON,
                    `${where}: target`,
                );
            }
        }
    }
});

test("a self-relationship's legs run straight for its markers too", () => {
    for (const routing of ["Orthogonal", "Direct", "Curved"]) {
        const edge = fitted("loop", "a", "a", routing, "zeroOrMore", "arrow");
        const [{ route }] = routeView([element("a", 0, 0)], [edge]);
        assert.ok(
            straightRun(route, "first") >= edge.ends.source.room - EPSILON,
            `${routing}: leaving`,
        );
        assert.ok(
            straightRun(route, "last") >= edge.ends.target.room - EPSILON,
            `${routing}: entering`,
        );
    }
});

test("the line stops each marker's inset short of its end", () => {
    const elements = LAYOUTS["side by side"];
    for (const routing of ["Orthogonal", "Direct", "Curved"]) {
        const edge = fitted("e", "a", "b", routing, "circle", "zeroOrOne");
        const [{ route, path }] = routeView(elements, [edge]);
        const points = pointsOf(path);
        const first = points[0];
        const last = points[points.length - 1];
        const start = route[0];
        const end = route[route.length - 1];
        assert.ok(
            Math.abs(
                Math.hypot(first.x - start.x, first.y - start.y) -
                    edge.ends.source.inset,
            ) < EPSILON,
            `${routing}: start`,
        );
        assert.ok(
            Math.abs(
                Math.hypot(last.x - end.x, last.y - end.y) -
                    edge.ends.target.inset,
            ) < EPSILON,
            `${routing}: end`,
        );
    }
});

/**
 * Two edges that cross 20 units in front of `b`: `a`→`b` straight across,
 * and `c`→`d` straight down through its vertices.
 */
function crossing(ends, jumps) {
    const elements = [
        element("a", 0, 0, 100, 60),
        element("b", 400, 0, 100, 60),
        element("c", 330, -300, 100, 60),
        element("d", 330, 300, 100, 60),
    ];
    const across = {
        key: "across",
        sourceId: "a",
        targetId: "b",
        routing: "Direct",
        vertices: [],
        jump: jumps.across,
        thickness: 2,
        ...(ends && { centered: true, ends: endFit("none", "cross", 2) }),
    };
    const down = {
        key: "down",
        sourceId: "c",
        targetId: "d",
        routing: "Direct",
        vertices: [
            { x: 380, y: -200 },
            { x: 380, y: 200 },
        ],
        jump: jumps.down,
        thickness: 2,
    };
    return routeView(elements, [across, down]);
}

test("jump-overs skip a crossing inside a straight end, on either edge", () => {
    const [plainAcross] = crossing(false, { across: true, down: false });
    assert.match(plainAcross.path, / A /, "a C4 edge jumps there");
    const [across] = crossing(true, { across: true, down: false });
    assert.doesNotMatch(across.path, / A /);
    const [, plainDown] = crossing(false, { across: false, down: true });
    assert.match(plainDown.path, / A /);
    const [, down] = crossing(true, { across: false, down: true });
    assert.doesNotMatch(down.path, / A /, "nor over another's straight end");
});

test("straight ends between close facing sides shrink to meet, never below their markers", () => {
    const from = { x: 0, y: 0, width: 100, height: 60 };
    const to = { x: 160, y: 0, width: 100, height: 60 };
    const facing = { source: "right", target: "left" };
    const least = { source: 30, target: 20 };
    assert.deepEqual(
        fitRoom(from, to, facing, { source: 40, target: 40, least }),
        { source: 30, target: 30, least, fitted: true },
    );
    const room = { source: 40, target: 40, least: { source: 35, target: 0 } };
    assert.equal(
        fitRoom(from, to, facing, room),
        room,
        "a marker that won't fit keeps its room",
    );
    const wide = { source: 20, target: 20, least };
    assert.equal(fitRoom(from, to, facing, wide), wide);
    const turned = { source: "bottom", target: "left" };
    assert.equal(fitRoom(from, to, turned, room), room);
});

/* ------------------------------------------------------------ spreading */

const box = { x: 0, y: 0, width: 200, height: 100 };
const spans = { top: { from: 0, to: 200 } };
const ends = (count, apart) =>
    Array.from({ length: count }, (_, i) => ({
        id: String(i),
        side: "top",
        far: { x: i * 50, y: -300 },
        order: i,
        centered: true,
        apart,
    }));
const placed = (count, apart) => [
    ...spreadEnds(ends(count, apart), spans, box).values(),
];

test("ends spread evenly around their side's middle, span/(n+1) apart when that clears their markers", () => {
    assert.deepEqual(placed(3, 20), [50, 100, 150]);
    assert.deepEqual(placed(1, 20), [100]);
});

test("ends keep at least one marker width apart where the side allows, centered on its middle", () => {
    assert.deepEqual(placed(3, 80), [20, 100, 180]);
    assert.deepEqual(placed(2, 90), [55, 145]);
});

test("ends fall back to span/(n+1) when a marker width each doesn't fit", () => {
    const at = placed(5, 60);
    const gap = 200 / 6;
    for (const [i, position] of at.entries()) {
        assert.ok(Math.abs(position - (i + 1) * gap) < EPSILON);
    }
});

/* ------------------------------------------------------------ flowcharts */

const LABELS = { descriptions: true, technologies: true };

function graphOf(source, scheme = "light") {
    const json = mermaidWorkspace([mermaidView("flow", source)]);
    readMermaidDiagrams(json);
    return buildGraph(
        new WorkspaceModel(json),
        "flow",
        scheme,
        LABELS,
        estimateText,
    );
}

const FLOW =
    "flowchart LR\n  A --> B\n  C <--> D\n  E --o F\n  G o--o H\n  I --x J\n  K x--x L\n  M --- N\n";

test("a flowchart edge draws the markers its arrow syntax names, at both ends", () => {
    const graph = graphOf(FLOW);
    const [arrow, both, circle, circles, cross, crosses, none] = graph.edges;
    for (const edge of [arrow, both, circle, circles, cross, crosses, none]) {
        assert.equal(edge.centered, true);
    }
    assert.equal(subpaths(arrow.arrowhead), 1);
    assert.equal(arrow.markerStroke, undefined);
    assert.equal(
        subpaths(both.arrowhead),
        2,
        "<--> fills an arrow at each end",
    );
    assert.equal(subpaths(circle.arrowhead), 1);
    assert.equal(subpaths(circles.arrowhead), 2);
    assert.equal(cross.arrowhead, "");
    assert.equal(subpaths(cross.markerStroke), 2);
    assert.equal(subpaths(crosses.markerStroke), 4);
    assert.equal(none.arrowhead, "");
    assert.equal(none.markerStroke, undefined);
    assert.equal(
        both.arrowhead,
        edgeMarkers("arrow", "arrow", both.route, both.thickness).fill,
    );
});

test("no flowchart route bends inside a marker's straight end", () => {
    const graph = graphOf(
        "flowchart TB\n  A <--> B\n  A o--o C\n  B x--x C\n  C --> A\n  D --o A\n  D x--x B\n",
    );
    const starts = ["arrow", "circle", "cross", "none", "none", "cross"];
    for (const [i, edge] of graph.edges.entries()) {
        const room = straightEnd("arrow", edge.thickness);
        assert.ok(straightRun(edge.route, "last") >= room - EPSILON, edge.id);
        if (starts[i] !== "none") {
            assert.ok(
                straightRun(edge.route, "first") >= room - EPSILON,
                edge.id,
            );
        }
    }
});

test("markers stay solid on a dotted line and take a thick line's thickness", () => {
    const graph = graphOf(
        "flowchart LR\n  A x-.-x B\n  C x==x D\n  E x--x F\n",
    );
    const [dotted, thick, solid] = graph.edges;
    assert.equal(dotted.style, "Dotted");
    assert.equal(thick.thickness, 2 * solid.thickness);
    assert.equal(
        thick.markerStroke,
        edgeMarkers("cross", "cross", thick.route, thick.thickness).stroke,
    );
});

test("export draws every marker as the canvas does: fills filled, strokes stroked in the edge color, never dashed", () => {
    const graph = graphOf(
        "flowchart LR\n  A x-.-x B\n  C <-.-> D\n  E o-.-o F\n",
    );
    const svg = exported(graph);
    for (const edge of graph.edges) {
        assert.ok(
            svg.includes(`d="${edge.arrowhead}"`) || edge.arrowhead === "",
        );
        if (!edge.markerStroke) continue;
        const tag = svg.match(
            new RegExp(
                `<path [^>]*d="${edge.markerStroke.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`,
            ),
        );
        assert.ok(tag, `edge ${edge.key} draws its marker strokes`);
        assert.match(tag[0], /fill="none"/);
        assert.match(tag[0], new RegExp(`stroke="${edge.color}"`));
        assert.match(tag[0], new RegExp(`stroke-width="${edge.thickness}"`));
        assert.doesNotMatch(tag[0], /stroke-dasharray/);
    }
});

test("the flowchart fixture's markers view draws every flowchart marker at both ends on solid, dotted and thick lines", () => {
    const json = JSON.parse(
        readFileSync(
            new URL("./__fixtures__/mermaid-flowchart.json", import.meta.url),
            "utf8",
        ),
    );
    readMermaidDiagrams(json);
    const model = new WorkspaceModel(json);
    const { edges } = json.views.imageViews.find(
        (view) => view.key === "markers",
    ).mermaid;
    const seen = new Set(
        edges.flatMap((edge) => [
            `${edge.line} start ${edge.start}`,
            `${edge.line} end ${edge.end}`,
        ]),
    );
    for (const line of ["normal", "dotted", "thick"]) {
        for (const marker of ["arrow", "circle", "cross"]) {
            assert.ok(
                seen.has(`${line} start ${marker}`),
                `${line} start ${marker}`,
            );
            assert.ok(
                seen.has(`${line} end ${marker}`),
                `${line} end ${marker}`,
            );
        }
        assert.ok(seen.has(`${line} end none`), `${line} end none`);
    }
    for (const scheme of ["light", "dark"]) {
        const graph = buildGraph(
            model,
            "markers",
            scheme,
            LABELS,
            estimateText,
        );
        assert.equal(graph.error, undefined);
        assert.ok(graph.edges.some((edge) => edge.markerStroke));
    }
});

/* ------------------------------------------------------------ C4 edges */

test("a C4 edge carries no marker fields and no straight ends", () => {
    const json = JSON.parse(
        readFileSync(
            new URL("./__fixtures__/mermaid-flowchart.json", import.meta.url),
            "utf8",
        ),
    );
    readMermaidDiagrams(json);
    const graph = buildGraph(
        new WorkspaceModel(json),
        "landscape",
        "light",
        LABELS,
        estimateText,
    );
    for (const edge of graph.edges) {
        assert.equal("markerStroke" in edge, false);
        assert.equal("ends" in edge, false);
    }
});

/* ------------------------------------------------------------ the build */

test("an arrow end Renderizr doesn't know fails the diagram as a construct not drawn yet", () => {
    const db = {
        getData: () => ({
            nodes: [
                { id: "A", shape: "squareRect", label: "A" },
                { id: "B", shape: "squareRect", label: "B" },
            ],
            edges: [
                {
                    start: "A",
                    end: "B",
                    arrowTypeStart: "none",
                    arrowTypeEnd: "arrow_barb",
                    label: "",
                    pattern: "solid",
                },
            ],
        }),
        getSubGraphs: () => [],
        getClasses: () => new Map(),
        getDirection: () => "LR",
    };
    assert.throws(() => readFlowchart(db, new Ignored()), {
        name: "NotDrawnYet",
        message: `the arrow end "arrow_barb" isn't something Renderizr draws yet`,
    });
});
