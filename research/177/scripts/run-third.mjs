// Runs the third-party parse-only packages on the samples in plain Node, to see what each returns, how each treats
// frontmatter and %%{init}%%, and what a parse error looks like.
import * as samples from "./samples.mjs";

const root = "../third/node_modules";
const bundle = await import(`${root}/mermaid-parser-bundle/dist/index.mjs`);
const ast = await import(`${root}/mermaid-ast/dist/parser/index.js`);
const zombie = await import(
    `${root}/@zombie-mermaid/mermaid-parser/dist/index.js`
);

const show = (o) =>
    JSON.stringify(o, (_k, v) =>
        v instanceof Map
            ? Object.fromEntries(v)
            : v instanceof Set
              ? [...v]
              : v,
    )?.slice(0, Number(process.env.WIDTH ?? 700));
const attempt = async (label, fn) => {
    try {
        console.log(`  ${label}:`, show(await fn()));
    } catch (e) {
        console.log(
            `  ${label}: ERROR ${e.constructor.name}: ${String(e.message).split("\n")[0].slice(0, 200)} ${show(e.hash?.loc ?? e.line ?? e.details ?? "")}`,
        );
    }
};

// BODY=1 strips frontmatter and directives first, the way a reader of our own would before handing over the body.
const body = (text) =>
    text
        .replace(/^---\n[\s\S]*?\n---\n/, "")
        .replace(/%%\{[\s\S]*?\}%%\n?/g, "");

for (const [name, raw] of Object.entries(samples)) {
    const text = process.env.BODY ? body(raw) : raw;
    console.log(`\n== ${name}${process.env.BODY ? " (body only)" : ""}`);
    await attempt("mermaid-parser-bundle", async () => {
        const r = await bundle.parse(text);
        const db = r.db;
        const pick = db.getVertices
            ? { v: db.getVertices(), e: db.getEdges().length }
            : db.getEntities
              ? { ent: Object.keys(db.getEntities()) }
              : { msgs: db.getMessages().length };
        return {
            type: r.type,
            keys: Object.keys(r),
            config: r.config,
            title: r.title ?? db.getDiagramTitle?.(),
            ...pick,
        };
    });
    await attempt("mermaid-ast", () => ast.parse(text));
    await attempt("zombie", () => zombie.parseMermaid(text));
}
