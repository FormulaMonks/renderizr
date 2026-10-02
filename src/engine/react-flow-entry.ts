import type { WorkspaceSummary } from "../components/navigation";
import DiagramsPage from "../pages/diagrams-react-flow";
import type { EngineEntry } from "./entry";

/**
 * The React Flow engine (`--engine react-flow`). The header and the
 * documentation pages read the workspace JSON directly, with the same empty
 * defaults Structurizr's `Workspace` fills in.
 */
export async function loadEngine(): Promise<EngineEntry> {
    const json = workspaceData as Record<string, unknown> & {
        documentation?: Partial<WorkspaceSummary["documentation"]>;
    };
    const documentation = json.documentation ?? {};

    return {
        workspace: {
            ...(json as unknown as WorkspaceSummary),
            documentation: {
                sections: documentation.sections ?? [],
                decisions: documentation.decisions ?? [],
                images: documentation.images ?? [],
            },
        },
        DiagramsPage,
        credit: '<a href="https://reactflow.dev/" target="_blank">React Flow</a>',
    };
}
