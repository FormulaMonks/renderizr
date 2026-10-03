import DiagramsPage from "../pages/diagrams-react-flow";
import type { EngineEntry } from "./entry";
import { summarizeWorkspace } from "./workspace-summary";

/**
 * The React Flow engine (`--engine react-flow`). The header and the
 * documentation pages read the workspace JSON directly, through
 * `summarizeWorkspace`.
 */
export async function loadEngine(): Promise<EngineEntry> {
    return {
        workspace: summarizeWorkspace(workspaceData),
        DiagramsPage,
        credit: '<a href="https://reactflow.dev/" target="_blank">React Flow</a>',
    };
}
