// Only the three compiled Jison grammars, with no db: the floor for any option that keeps mermaid's grammars.
import flowParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/flowchart/parser/flow.jison";
import erParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/er/parser/erDiagram.jison";
import sequenceParser from "../../mermaid-src/repo/packages/mermaid/src/diagrams/sequence/parser/sequenceDiagram.jison";

export { flowParser, erParser, sequenceParser };
