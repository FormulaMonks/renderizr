// Parse only, from mermaid's source at the 12.2.0 tag: the three Jison grammars and their db classes, with no
// renderer and no diagram registry. This is the smallest slice of mermaid core that still runs mermaid's own parse.
import flowParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/flowchart/parser/flowParser.ts";
import { FlowDB } from "../../mermaid-src/repo/packages/mermaid/src/diagrams/flowchart/flowDb.ts";
import erParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/er/parser/erDiagram.jison";
import { ErDB } from "../../mermaid-src/repo/packages/mermaid/src/diagrams/er/erDb.ts";
import sequenceParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/sequence/parser/sequenceDiagram.jison";
import { SequenceDB } from "../../mermaid-src/repo/packages/mermaid/src/diagrams/sequence/sequenceDb.ts";

const kinds = {
    flowchart: [flowParser, FlowDB],
    er: [erParser, ErDB],
    sequence: [sequenceParser, SequenceDB],
};

export function read(kind, text) {
    const [parser, DB] = kinds[kind];
    const db = new DB();
    parser.parser.yy = db;
    parser.parse(text);
    return db;
}
