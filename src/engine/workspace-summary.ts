import type { WorkspaceSummary } from "../components/navigation";

/**
 * The header and documentation summary of a workspace JSON, with the defaults
 * Structurizr's `Workspace` fills in, and empty text where it would leave
 * `undefined`.
 */
export function summarizeWorkspace(
    json: Record<string, unknown> & {
        documentation?: Partial<WorkspaceSummary["documentation"]>;
    },
): WorkspaceSummary {
    const documentation = json.documentation ?? {};
    return {
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
    };
}
