import type { WorkspaceSummary } from "../components/navigation";
import {
    type DocumentedWorkspace,
    documentationScopes,
} from "../model/documentation";

/**
 * The header and documentation summary of a workspace JSON: empty text for a
 * missing name or description, now for a missing date, and empty lists for
 * missing documentation. `documentation` holds the workspace's own, and
 * `offers` says whether any documentation scope carries sections or
 * decisions.
 */
export function summarizeWorkspace(
    json: Record<string, unknown> & {
        documentation?: Partial<WorkspaceSummary["documentation"]>;
    },
): WorkspaceSummary {
    const documentation = json.documentation ?? {};
    const scopes = documentationScopes(json as DocumentedWorkspace);
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
        offers: {
            sections: scopes.some((scope) => scope.sections.length > 0),
            decisions: scopes.some((scope) => scope.decisions.length > 0),
        },
    };
}
