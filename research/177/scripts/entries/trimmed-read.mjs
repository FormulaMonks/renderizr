// The "vendor and trim" reader end to end: mermaid's own frontmatter extraction and regexes, a directive reader
// built on mermaid's directiveRegex, then the grammar and db for the detected type. Bundle with trim-plugin.mjs.
import { extractFrontMatter } from "../../mermaid-src/repo/packages/mermaid/src/diagram-api/frontmatter.ts";
import { directiveRegex } from "../../mermaid-src/repo/packages/mermaid/src/diagram-api/regexes.ts";
import { cleanupComments } from "../../mermaid-src/repo/packages/mermaid/src/diagram-api/comments.ts";
import flowParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/flowchart/parser/flowParser.ts";
import { FlowDB } from "../../mermaid-src/repo/packages/mermaid/src/diagrams/flowchart/flowDb.ts";
import erParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/er/parser/erDiagram.jison";
import { ErDB } from "../../mermaid-src/repo/packages/mermaid/src/diagrams/er/erDb.ts";
import sequenceParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/sequence/parser/sequenceDiagram.jison";
import { SequenceDB } from "../../mermaid-src/repo/packages/mermaid/src/diagrams/sequence/sequenceDb.ts";
import { setConfig } from "../stubs/mermaid-core.mjs";

const types = [
    [/^\s*(flowchart|graph)\b/, "flowchart", flowParser, FlowDB],
    [/^\s*erDiagram\b/, "er", erParser, ErDB],
    [/^\s*sequenceDiagram\b/, "sequence", sequenceParser, SequenceDB],
];

/** Reads %%{init: …}%% (and %%{initialize: …}%%) directives the way mermaid's utils.detectInit does, minus sanitizing. */
function readDirectives(text) {
    const config = {};
    for (const m of text.matchAll(new RegExp(directiveRegex.source, "gi"))) {
        const type = m[1] ?? m[2];
        if ((type === "init" || type === "initialize") && m[4])
            Object.assign(config, JSON.parse(m[4].trim().replace(/'/g, '"')));
        if (type === "wrap") config.wrap = true;
    }
    return {
        config,
        text: text.replace(new RegExp(directiveRegex.source, "gi"), ""),
    };
}

export function read(source) {
    const front = extractFrontMatter(source.replace(/\r\n?/g, "\n"));
    const directives = readDirectives(front.text);
    const config = { ...(front.metadata.config ?? {}), ...directives.config };
    for (const key of ["flowchart", "er", "sequence", "themeVariables"])
        if (front.metadata.config?.[key] && directives.config[key])
            config[key] = {
                ...front.metadata.config[key],
                ...directives.config[key],
            };
    const text = cleanupComments(directives.text);
    const type = types.find(([re]) => re.test(text));
    if (!type)
        return { kind: "unsupported", config, title: front.metadata.title };
    const [, kind, parser, DB] = type;
    setConfig(config);
    const db = new DB();
    parser.parser.yy = db;
    parser.parse(text);
    if (front.metadata.title) db.setDiagramTitle?.(front.metadata.title);
    return { kind, config, title: db.getDiagramTitle?.(), db };
}
