/**
 * How the workspace's documentation is addressed. The model lists the ids a
 * link may lead to, and the docs page and its links address the same
 * sections, so the rule lives here where all of them can reach it.
 */

import type { DocumentationSection } from "../types/structurizr-documentation";

/**
 * The id a documentation section is addressed by in the URL. Shared by the
 * docs page, its links and the activation targets, so none of them can
 * disagree about it.
 */
export const sectionId = (section: DocumentationSection): string =>
    section.id ?? section.filename.replace(/\.md$/, "");

/**
 * PROTOTYPE (#309): one documentation scope, the workspace's or an element's.
 * `key` is Structurizr's name path ("" for the workspace), `parent` the key
 * of the scope above it in the model.
 */
export type DocScope = {
    key: string;
    name: string;
    type: "Workspace" | "Software System" | "Container" | "Component";
    depth: number;
    parent: string | null;
    sections: DocumentationSection[];
    decisions: unknown[];
};

type Documented = {
    name: string;
    documentation?: {
        sections?: DocumentationSection[];
        decisions?: unknown[];
    };
    containers?: Documented[];
    components?: Documented[];
};

/** PROTOTYPE (#309): every scope with documentation, in model order. */
export function documentationScopes(json: {
    name?: string;
    documentation?: Documented["documentation"];
    model?: { softwareSystems?: Documented[] };
}): DocScope[] {
    const scopes: DocScope[] = [];
    const add = (
        key: string,
        name: string,
        type: DocScope["type"],
        depth: number,
        parent: string | null,
        docs: Documented["documentation"],
    ) => {
        const sections = docs?.sections ?? [];
        const decisions = docs?.decisions ?? [];
        if (sections.length || decisions.length) {
            scopes.push({
                key,
                name,
                type,
                depth,
                parent,
                sections,
                decisions,
            });
        }
    };
    add("", json.name ?? "Workspace", "Workspace", 0, null, json.documentation);
    for (const system of json.model?.softwareSystems ?? []) {
        add(
            system.name,
            system.name,
            "Software System",
            0,
            null,
            system.documentation,
        );
        for (const container of system.containers ?? []) {
            const ck = `${system.name}/${container.name}`;
            add(
                ck,
                container.name,
                "Container",
                1,
                system.name,
                container.documentation,
            );
            for (const component of container.components ?? []) {
                add(
                    `${ck}/${component.name}`,
                    component.name,
                    "Component",
                    2,
                    ck,
                    component.documentation,
                );
            }
        }
    }
    // A scope whose parent has no documentation hangs from the nearest one that does.
    const keys = new Set(scopes.map((s) => s.key));
    for (const scope of scopes) {
        let parent = scope.parent;
        while (parent !== null && !keys.has(parent)) {
            const at = parent.lastIndexOf("/");
            parent = at < 0 ? null : parent.slice(0, at);
        }
        scope.parent = parent;
    }
    return scopes;
}
