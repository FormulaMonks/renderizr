import getStructurizr from "../structurizr-runtime";
import DiagramsPage from "../pages/diagrams";
import type { EngineEntry } from "./entry";

/** The default engine: Structurizr's own renderer, vendored. */
export async function loadEngine(): Promise<EngineEntry> {
    const structurizr = await getStructurizr();
    structurizr.workspace = new structurizr.Workspace(workspaceData);

    return {
        workspace: structurizr.workspace,
        DiagramsPage,
        credit: '<a href="https://structurizr.com/" target="_blank">Structurizr</a>',
    };
}
