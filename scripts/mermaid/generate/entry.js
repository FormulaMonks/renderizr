/**
 * The entry of the generated parser: Mermaid's own frontmatter reader and
 * regexes, a directive reader built on Mermaid's `directiveRegex`, then the
 * grammar and db for the type the source names, and Mermaid's theme code for
 * the palette a source's `theme` and `themeVariables` make (spec: Parsing in
 * the build).
 *
 * The generator copies this file into its work folder, beside a checkout of
 * Mermaid at the pinned tag, and bundles it with `plugins.js`. The imports
 * below resolve from there.
 */

import { cleanupComments } from "../mermaid/packages/mermaid/src/diagram-api/comments.ts";
import { extractFrontMatter } from "../mermaid/packages/mermaid/src/diagram-api/frontmatter.ts";
import { directiveRegex } from "../mermaid/packages/mermaid/src/diagram-api/regexes.ts";
import { ErDB } from "../mermaid/packages/mermaid/src/diagrams/er/erDb.ts";
import erParser from "../mermaid/packages/mermaid/src/diagrams/er/parser/erDiagram.jison";
import { FlowDB } from "../mermaid/packages/mermaid/src/diagrams/flowchart/flowDb.ts";
import flowParser from "../mermaid/packages/mermaid/src/diagrams/flowchart/parser/flowParser.ts";
import { SequenceDB } from "../mermaid/packages/mermaid/src/diagrams/sequence/sequenceDb.ts";
import sequenceParser from "../mermaid/packages/mermaid/src/diagrams/sequence/parser/sequenceDiagram.jison";
import themes from "../mermaid/packages/mermaid/src/themes/index.js";
import { useConfig } from "./stub.js";

export { themes };

/** The types Renderizr reads, by the keyword their source opens with. */
const TYPES = [
    [/^\s*(flowchart|graph)\b/, "flowchart", flowParser, FlowDB],
    [/^\s*erDiagram\b/, "er", erParser, ErDB],
    [/^\s*sequenceDiagram\b/, "sequence", sequenceParser, SequenceDB],
];

/** `%%{init: …}%%` and `%%{initialize: …}%%`, read the way Mermaid's `utils.detectInit` reads them, without sanitizing. */
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

/**
 * Reads one Mermaid source: `{ kind, config, title, db }`, where `kind` is
 * `flowchart`, `er`, `sequence` or `unsupported` (with no `db`) and `db` is
 * Mermaid's own `FlowDB`, `ErDB` or `SequenceDB` after parsing. Throws the
 * parser's own error on a source it can't parse.
 */
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
    const type = TYPES.find(([re]) => re.test(text));
    if (!type)
        return { kind: "unsupported", config, title: front.metadata.title };
    const [, kind, parser, DB] = type;
    // biome-ignore lint/correctness/useHookAtTopLevel: mermaid's useConfig is no React hook
    useConfig(config);
    const db = new DB();
    parser.parser.yy = db;
    parser.parse(text);
    if (front.metadata.title) db.setDiagramTitle?.(front.metadata.title);
    return { kind, config, title: db.getDiagramTitle?.() || undefined, db };
}
