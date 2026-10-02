import type { WorkspaceSummary } from "../components/navigation";
import DiagramsPage from "../pages/diagrams-react-flow";
import type { EngineEntry } from "./entry";

/**
 * The React Flow engine (`--engine react-flow`). The header and the
 * documentation pages read the workspace JSON directly, with the defaults
 * Structurizr's `Workspace` fills in, and empty text where it would leave
 * `undefined`.
 */
export async function loadEngine(): Promise<EngineEntry> {
    const json = workspaceData as Record<string, unknown> & {
        documentation?: Partial<WorkspaceSummary["documentation"]>;
    };
    const documentation = json.documentation ?? {};

    return {
        workspace: {
            ...(json as unknown as WorkspaceSummary),
            name: typeof json.name === "string" ? json.name : "",
            description:
                typeof json.description === "string" ? json.description : "",
            // Typed as a `Date`, but Structurizr hands the JSON's ISO string through.
            lastModifiedDate: (json.lastModifiedDate ??
                new Date().toISOString()) as WorkspaceSummary["lastModifiedDate"],
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
