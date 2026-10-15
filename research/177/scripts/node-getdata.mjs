// Prints db.getData() for the flowchart and ERD samples: the renderer-neutral LayoutData (nodes, edges, groups)
// that mermaid's unified renderer hands to its layout engines. Uses the same dompurify hook as node-stub.mjs.
import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, next) {
        if (specifier === "dompurify")
            return {
                url: "data:text/javascript,export default { sanitize: (s) => s, addHook() {} };",
                shortCircuit: true,
            };
        return next(specifier, context);
    },
});
const { default: mermaid } = await import("mermaid");
const samples = await import("./samples.mjs");

for (const name of ["flowchart", "erd"]) {
    await mermaid.parse(samples[name]);
    const { db } = await mermaid.mermaidAPI.getDiagramFromText(samples[name]);
    const { nodes, edges, ...rest } = db.getData();
    console.log(`\n== ${name}: getData keys ${Object.keys(rest).join(", ")}`);
    console.log("node[0]", JSON.stringify(nodes[0]));
    console.log(
        "groups",
        JSON.stringify(
            nodes
                .filter((n) => n.isGroup)
                .map(({ id, label, isGroup }) => ({ id, label, isGroup })),
        ),
    );
    console.log("edge[0]", JSON.stringify(edges[0]));
}
