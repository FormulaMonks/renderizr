import type { WorkspaceSummary } from "../components/navigation";

/**
 * The header and documentation summary of a workspace JSON: empty text for a
 * missing name or description, now for a missing date, and empty lists for
 * missing documentation.
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
        lastModifiedDate:
            typeof json.lastModifiedDate === "string"
                ? json.lastModifiedDate
                : new Date().toISOString(),
        documentation: {
            sections: documentation.sections ?? [],
            decisions: documentation.decisions ?? [],
            images: documentation.images ?? [],
        },
    };
}
