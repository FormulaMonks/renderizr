// Prototype (#98): what one drag frame costs in geometry, headless.
import { readFileSync } from "node:fs";
import { importSrc } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { memoStats } = await importSrc("engine/geometry/routing/avoid");

const cases = [
    ["big-bank-plc-stored", "Containers"],
    ["big-bank-plc-stored", "LiveDeployment"],
    ["large-landscape", "LargeLandscapeStored"],
];
const labels = { descriptions: true, technologies: true };
for (const [file, key] of cases) {
    const ws = JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${file}.json`, import.meta.url),
            "utf8",
        ),
    );
    const model = new WorkspaceModel(ws);
    const first = buildGraph(model, key, "light", labels);
    const positions = new Map(
        first.elements.map((e) => [e.id, { x: e.x, y: e.y }]),
    );
    const id = first.elements[Math.floor(first.elements.length / 2)].id;
    const start = positions.get(id);
    const times = [];
    const misses = [];
    for (let i = 0; i < 60; i++) {
        positions.set(id, { x: start.x + i * 7, y: start.y + i * 3 });
        const t = performance.now();
        memoStats.misses = 0;
        buildGraph(model, key, "light", labels, undefined, new Map(positions));
        times.push(performance.now() - t);
        misses.push(memoStats.misses);
    }
    console.log(
        `  routes searched per frame (memo misses): p50 ${[...misses].sort((a, b) => a - b)[30]}`,
    );
    times.sort((a, b) => a - b);
    const p = (q) => times[Math.floor(q * (times.length - 1))].toFixed(1);
    console.log(
        `${file} ${key}: ${first.elements.length} elements, ${first.edges.length} edges, buildGraph per frame p50 ${p(0.5)} ms, p95 ${p(0.95)} ms, max ${p(1)} ms`,
    );
}

// The drag path: routes frozen but the dragged element's, one full route on drop.
for (const [file, key] of cases) {
    const ws = JSON.parse(
        readFileSync(
            new URL(`./__fixtures__/${file}.json`, import.meta.url),
            "utf8",
        ),
    );
    const model = new WorkspaceModel(ws);
    const first = buildGraph(model, key, "light", labels);
    const positions = new Map(
        first.elements.map((e) => [e.id, { x: e.x, y: e.y }]),
    );
    const id = first.elements[Math.floor(first.elements.length / 2)].id;
    const start = positions.get(id);
    const drag = { moved: new Set([id]), previous: first };
    const times = [];
    for (let i = 0; i < 60; i++) {
        positions.set(id, {
            x: start.x + 300 + i * 7,
            y: start.y + 200 + i * 3,
        });
        const t = performance.now();
        buildGraph(
            model,
            key,
            "light",
            labels,
            undefined,
            new Map(positions),
            drag,
        );
        times.push(performance.now() - t);
    }
    const t = performance.now();
    buildGraph(model, key, "light", labels, undefined, new Map(positions));
    const drop = performance.now() - t;
    times.sort((a, b) => a - b);
    const p = (q) => times[Math.floor(q * (times.length - 1))].toFixed(1);
    console.log(
        `drag path ${file} ${key}: per frame p50 ${p(0.5)} ms, p95 ${p(0.95)} ms, max ${p(1)} ms; drop ${drop.toFixed(0)} ms`,
    );
}
