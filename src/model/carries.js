/**
 * Whether a documentation scope carries documents, and whether any scope of
 * a workspace does: the one walk over the workspace, its software systems,
 * their containers and their components that the page and the build share.
 * Plain JavaScript, so the page, the set loader (`scripts/workspace-set.js`)
 * and the documentation runtime's gate (`scripts/artifact.js`) run this one
 * copy; `carries.d.ts` types it for the page.
 */

/** The lists of documents a documentation scope carries. */
const DOCUMENT_LISTS = Object.freeze(["sections", "decisions"]);

/**
 * Whether `documentation` holds any document of `lists`: by default,
 * sections or decisions.
 *
 * @param {{ sections?: unknown[], decisions?: unknown[] } | undefined} documentation
 * @param {readonly ("sections" | "decisions")[]} [lists]
 * @returns {boolean}
 */
export const carries = (documentation, lists = DOCUMENT_LISTS) =>
    lists.some((list) => (documentation?.[list]?.length ?? 0) > 0);

/**
 * Whether any documentation scope of `workspace` carries documents of
 * `lists`: the workspace, or any software system, container or component.
 *
 * @param {object | undefined} workspace
 * @param {readonly ("sections" | "decisions")[]} [lists]
 * @returns {boolean}
 */
export function anyScopeCarries(workspace, lists = DOCUMENT_LISTS) {
    const elements = (workspace?.model?.softwareSystems ?? []).flatMap(
        (system) => [
            system,
            ...(system.containers ?? []).flatMap((container) => [
                container,
                ...(container.components ?? []),
            ]),
        ],
    );
    return [workspace, ...elements].some((documented) =>
        carries(documented?.documentation, lists),
    );
}
