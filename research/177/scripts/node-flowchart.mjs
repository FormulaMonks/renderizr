// Tries the flowchart parse in plain Node two ways: with securityLevel "loose" (skips DOMPurify hooks), and with a jsdom window.
// Usage: node node-flowchart.mjs loose | jsdom
import * as samples from "./samples.mjs";

const mode = process.argv[2] ?? "loose";
if (mode === "jsdom") {
    const { JSDOM } = await import("jsdom");
    const { window } = new JSDOM("");
    globalThis.window = window;
    globalThis.document = window.document;
}
const { default: mermaid } = await import("mermaid");
const { default: DOMPurify } = await import("dompurify");
console.log(
    "DOMPurify.isSupported",
    DOMPurify.isSupported,
    "has sanitize",
    typeof DOMPurify.sanitize,
    "has addHook",
    typeof DOMPurify.addHook,
);
if (mode === "loose") mermaid.initialize({ securityLevel: "loose" });

const show = (o) =>
    JSON.stringify(
        o,
        (_k, v) =>
            v instanceof Map
                ? Object.fromEntries(v)
                : v instanceof Set
                  ? [...v]
                  : v,
        1,
    )?.slice(0, 2500) ?? String(o);

console.log(
    "parse() config",
    show((await mermaid.parse(samples.flowchart)).config),
);
const t0 = performance.now();
const diagram = await mermaid.mermaidAPI.getDiagramFromText(samples.flowchart);
console.log("parsed in", Math.round(performance.now() - t0), "ms");
const db = diagram.db;
console.log(
    "db getters:",
    Object.getOwnPropertyNames(Object.getPrototypeOf(db))
        .filter((m) => m.startsWith("get"))
        .join(" "),
);
console.log("vertices", show(db.getVertices()));
console.log("edges", show(db.getEdges()));
console.log("subgraphs", show(db.getSubGraphs()));
console.log("classes", show(db.getClasses()));
console.log("direction", db.getDirection());
console.log("title", db.getDiagramTitle());
console.log("tooltips", show(db.getTooltip?.("A")));
