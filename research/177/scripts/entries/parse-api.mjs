// Parse only, through mermaid's public API: mermaid.parse for the type and config, getDiagramFromText for the db.
import mermaid from "mermaid";

export async function read(text) {
    const { diagramType, config } = await mermaid.parse(text);
    const { db } = await mermaid.mermaidAPI.getDiagramFromText(text);
    return { diagramType, config, db };
}
