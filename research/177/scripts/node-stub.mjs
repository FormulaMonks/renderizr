// Parses all three samples in plain Node with no DOM library: a module hook swaps dompurify for a stub, since
// the parse only calls DOMPurify to sanitize label text and React escapes text anyway.
import { registerHooks } from "node:module";

const stub =
    "data:text/javascript,export default { sanitize: (s) => s, addHook() {}, isSupported: false };";
registerHooks({
    resolve(specifier, context, next) {
        if (specifier === "dompurify") return { url: stub, shortCircuit: true };
        return next(specifier, context);
    },
});

const { default: mermaid } = await import("mermaid");
const samples = await import("./samples.mjs");
const count = (v) =>
    v instanceof Map
        ? v.size
        : Array.isArray(v)
          ? v.length
          : Object.keys(v ?? {}).length;

for (const [name, text] of Object.entries(samples)) {
    try {
        const t0 = performance.now();
        const { diagramType, config } = await mermaid.parse(text);
        const { db } = await mermaid.mermaidAPI.getDiagramFromText(text);
        const ms = (performance.now() - t0).toFixed(1);
        const summary =
            diagramType === "flowchart-v2"
                ? {
                      vertices: count(db.getVertices()),
                      edges: count(db.getEdges()),
                      subgraphs: count(db.getSubGraphs()),
                      link: db.getVertices().get("A")?.link,
                  }
                : diagramType === "er"
                  ? {
                        entities: count(db.getEntities()),
                        relationships: count(db.getRelationships()),
                    }
                  : {
                        actors: count(db.getActors()),
                        messages: count(db.getMessages()),
                    };
        console.log(
            name,
            diagramType,
            `${ms} ms`,
            JSON.stringify(summary),
            "config:",
            JSON.stringify(config),
        );
    } catch (e) {
        console.log(
            name,
            "ERROR",
            e.message.split("\n")[0],
            "| line",
            e.hash?.loc?.first_line,
            "col",
            e.hash?.loc?.first_column,
            "| expected",
            e.hash?.expected?.length,
        );
    }
}
