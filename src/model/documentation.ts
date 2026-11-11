/**
 * How the workspace's documentation is addressed. The model lists the ids a
 * link may lead to, and the docs page and its links address the same
 * sections, so the rule lives here where all of them can reach it.
 */

import type {
    Decision,
    DocumentationImage,
    DocumentationSection,
} from "../types/structurizr-documentation";
import { siblingSlugs, slugOf } from "./slug.js";

export { siblingSlugs, slugOf };

/**
 * The id a documentation section is addressed by in the URL. Shared by the
 * docs page, its links and the activation targets, so none of them can
 * disagree about it.
 */
export const sectionId = (section: DocumentationSection): string =>
    section.id ?? section.filename.replace(/\.md$/, "");

/**
 * The id a document of the documentation scope at slug path `path` is
 * addressed by: the slug path rides in front of the document's own id, and
 * the workspace scope (`""`) adds nothing (ADR 30).
 */
export const scopedId = (path: string, id: string): string =>
    path ? `${path}/${id}` : id;

/**
 * The query string of `params`, keeping the `/` of a slug path as it is:
 * `section=internet-banking-system/01-context` reads better than `%2F`, and
 * a query may hold a `/` unencoded.
 */
export const searchOf = (params: URLSearchParams | Record<string, string>) =>
    new URLSearchParams(params).toString().replace(/%2F/gi, "/");

/* ---------------------------------------------------- documentation scopes */

/** What a documentation scope is: the workspace or the element it belongs to. */
export type DocumentationScopeType =
    | "Workspace"
    | "Software System"
    | "Container"
    | "Component";

/**
 * A documentation scope (see `GLOSSARY.md`): the workspace, a software
 * system, a container or a component, with the sections and decisions it
 * carries.
 */
export type DocumentationScope = {
    type: DocumentationScopeType;
    /** The element's name, or the workspace's. */
    name: string;
    /** The element's id; `null` for the workspace. */
    elementId: string | null;
    /**
     * Structurizr's name path, one name per element from the software
     * system down; empty for the workspace.
     */
    names: string[];
    /**
     * The slug path its documents are addressed by (ADR 30), one segment
     * per element from the software system down; `""` for the workspace.
     */
    path: string;
    /**
     * The path of the scope it nests under: the nearest ancestor element
     * that is a documentation scope. `null` at the top level, where the
     * workspace and each software system sit.
     */
    parent: string | null;
    /** How many scopes it nests under. */
    depth: number;
    sections: DocumentationSection[];
    decisions: Decision[];
    images: DocumentationImage[];
};

/**
 * Two or more siblings whose names slug the same, where it reaches a
 * documentation scope: the later ones in model order take `-2`, `-3`.
 */
export type SlugCollision = {
    /** The slug path of the element they sit under; `""` at the top. */
    parent: string;
    /** The slug they share. */
    slug: string;
    /** Their names, in model order. */
    names: string[];
    /** The slug path each one takes, in the same order. */
    paths: string[];
};

type Documentation = {
    sections?: DocumentationSection[];
    decisions?: Decision[];
    images?: DocumentationImage[];
};

type DocumentedElement = {
    id?: string;
    name?: string;
    documentation?: Documentation;
    containers?: DocumentedElement[];
    components?: DocumentedElement[];
};

/** The part of a workspace JSON that documentation scopes read. */
export type DocumentedWorkspace = {
    name?: string;
    documentation?: Documentation;
    model?: { softwareSystems?: DocumentedElement[] };
};

type ElementScopeType = Exclude<DocumentationScopeType, "Workspace">;

/** A software system, container or component with its slug path. */
type Placed = {
    type: ElementScopeType;
    element: DocumentedElement;
    names: string[];
    path: string;
    /** The path of each element above it, nearest first. */
    ancestors: string[];
};

/** What an element of each type holds, and as what. */
const CHILDREN: Record<
    ElementScopeType,
    | { type: ElementScopeType; of: (element: DocumentedElement) => unknown }
    | undefined
> = {
    "Software System": {
        type: "Container",
        of: (element) => element.containers,
    },
    Container: { type: "Component", of: (element) => element.components },
    Component: undefined,
};

const carries = (documentation: Documentation | undefined) =>
    Boolean(
        documentation?.sections?.length || documentation?.decisions?.length,
    );

/**
 * Every software system, container and component of `workspace` in model
 * order with its slug path, and the siblings whose slugs collided.
 */
function placeElements(workspace: DocumentedWorkspace) {
    const placed: Placed[] = [];
    const collisions: SlugCollision[] = [];

    const place = (
        elements: readonly DocumentedElement[],
        type: ElementScopeType,
        above: Placed | null,
    ) => {
        const slugs = siblingSlugs(elements.map((element) => element.name));
        const children = elements.map(
            (element, index): Placed => ({
                type,
                element,
                names: [...(above?.names ?? []), String(element.name ?? "")],
                path: above ? `${above.path}/${slugs[index]}` : slugs[index],
                ancestors: above ? [above.path, ...above.ancestors] : [],
            }),
        );

        const bySlug = new Map<string, Placed[]>();
        for (const child of children) {
            const slug = slugOf(child.element.name);
            bySlug.set(slug, [...(bySlug.get(slug) ?? []), child]);
        }
        for (const [slug, siblings] of bySlug)
            if (siblings.length > 1)
                collisions.push({
                    parent: above?.path ?? "",
                    slug,
                    names: siblings.map((sibling) => sibling.names.at(-1)!),
                    paths: siblings.map((sibling) => sibling.path),
                });

        const next = CHILDREN[type];
        for (const child of children) {
            placed.push(child);
            const held = next?.of(child.element);
            if (next && Array.isArray(held)) place(held, next.type, child);
        }
    };

    place(workspace.model?.softwareSystems ?? [], "Software System", null);
    return { placed, collisions };
}

/**
 * The documentation scopes of `workspace` in model order: the workspace,
 * then each software system, its containers and their components, keeping
 * only those that carry sections or decisions. Every software system,
 * container and component counts. A scope whose parent carries nothing
 * hangs from the nearest ancestor that does. Each takes its slug path by the
 * one slug rule, the later of two siblings that slug the same taking `-2`,
 * the next `-3`, whether or not the siblings carry anything (ADR 30).
 */
export function documentationScopes(
    workspace: DocumentedWorkspace,
): DocumentationScope[] {
    const scopes: DocumentationScope[] = [];
    const own = workspace.documentation;
    if (carries(own))
        scopes.push({
            type: "Workspace",
            name: workspace.name ?? "",
            elementId: null,
            names: [],
            path: "",
            parent: null,
            depth: 0,
            sections: own?.sections ?? [],
            decisions: own?.decisions ?? [],
            images: own?.images ?? [],
        });

    const depthOf = new Map<string, number>();
    for (const { type, element, names, path, ancestors } of placeElements(
        workspace,
    ).placed) {
        const documentation = element.documentation;
        if (!carries(documentation)) continue;
        const parent = ancestors.find((above) => depthOf.has(above)) ?? null;
        const depth = parent === null ? 0 : depthOf.get(parent)! + 1;
        depthOf.set(path, depth);
        scopes.push({
            type,
            name: names.at(-1)!,
            elementId: element.id ?? null,
            names,
            path,
            parent,
            depth,
            sections: documentation?.sections ?? [],
            decisions: documentation?.decisions ?? [],
            images: documentation?.images ?? [],
        });
    }
    return scopes;
}

/**
 * The siblings of `workspace` whose slugs collide where it reaches a
 * documentation scope: one of them, or an element under one, carries
 * sections or decisions. `pnpm dev` and edit mode warn the author of each.
 */
export function slugCollisions(
    workspace: DocumentedWorkspace,
): SlugCollision[] {
    const { placed, collisions } = placeElements(workspace);
    const documented = placed
        .filter(({ element }) => carries(element.documentation))
        .map(({ path }) => path);
    const reaches = (path: string) =>
        documented.some(
            (scope) => scope === path || scope.startsWith(`${path}/`),
        );
    return collisions.filter(({ paths }) => paths.some(reaches));
}

/**
 * What the toast tells the author about `collisions`, or `null` when there
 * are none.
 */
export function slugCollisionWarning(
    collisions: readonly SlugCollision[],
): string | null {
    if (!collisions.length) return null;
    const each = collisions.map(
        ({ names, paths }) =>
            `${names.map((name) => `"${name}"`).join(", ")} share an address, so their documents take ${paths.join(", ")}`,
    );
    return `${each.join("; ")}. Rename one to give each its own address.`;
}
