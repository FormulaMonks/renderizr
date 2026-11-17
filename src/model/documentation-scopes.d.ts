/**
 * The types of `documentation-scopes.js`, how documentation is addressed and
 * the documentation scopes that carry it. The walk stays plain JavaScript so
 * the build step in `scripts/documentation/` runs the same copy as the page;
 * this file lets the page's TypeScript import it.
 */

import type {
    DocumentationScope,
    DocumentationScopeType,
    DocumentedElement,
    DocumentedWorkspace,
    SlugCollision,
} from "./documentation";

/** The id a documentation section is addressed by in the URL. */
export declare const sectionId: (section: {
    id?: string;
    filename: string;
}) => string;

/** The id a document of the documentation scope at slug path `path` takes. */
export declare const scopedId: (path: string, id: string) => string;

/** The query string of `params`, keeping the `/` of a slug path. */
export declare const searchOf: (
    params: URLSearchParams | Record<string, string>,
) => string;

/** A software system, container or component with its slug path. */
export type Placed = {
    type: Exclude<DocumentationScopeType, "Workspace">;
    element: DocumentedElement;
    names: string[];
    path: string;
    /** The path of each element above it, nearest first. */
    ancestors: string[];
};

/** Every element of `workspace` with its slug path, and the collisions. */
export declare function placeElements(workspace: DocumentedWorkspace): {
    placed: Placed[];
    collisions: SlugCollision[];
};

/** The documentation scopes of `workspace` in model order. */
export declare function documentationScopes(
    workspace: DocumentedWorkspace,
): DocumentationScope[];
