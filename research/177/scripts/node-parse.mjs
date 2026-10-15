// Runs mermaid's own parse path in plain Node, with no DOM, and prints what each diagram's db exposes.
import mermaid from "mermaid";
import * as samples from "./samples.mjs";

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
    )?.slice(0, 1500) ?? String(o);

for (const [name, text] of Object.entries(samples)) {
    console.log(`\n===== ${name}`);
    try {
        const result = await mermaid.parse(text);
        console.log("parse ->", show(result));
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
        const db = diagram.db;
        const getters = Object.getOwnPropertyNames(
            Object.getPrototypeOf(db),
        ).filter((m) => m.startsWith("get"));
        console.log("type", diagram.type, "db getters:", getters.join(" "));
        if (name === "flowchart") {
            console.log("vertices", show(db.getVertices()));
            console.log("edges", show(db.getEdges()));
            console.log("subgraphs", show(db.getSubGraphs()));
            console.log("classes", show(db.getClasses()));
            console.log("direction", db.getDirection?.());
        }
        if (name === "erd") {
            console.log("entities", show(db.getEntities()));
            console.log("relationships", show(db.getRelationships()));
        }
        if (name === "sequence") {
            console.log("actors", show(db.getActors()));
            console.log("messages", show(db.getMessages()));
        }
        console.log("diagramTitle", db.getDiagramTitle?.());
        console.log("db.getConfig", show(db.getConfig?.())?.slice(0, 300));
    } catch (e) {
        console.log(
            "ERROR",
            e.constructor.name,
            String(e.message).slice(0, 400),
            "hash:",
            show(e.hash),
        );
    }
}
