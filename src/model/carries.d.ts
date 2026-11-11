/**
 * The types of `carries.js`, whether documentation scopes carry documents.
 * The walk stays plain JavaScript so the build scripts in `scripts/` run
 * the same copy as the page; this file lets the page's TypeScript import
 * it.
 */

/** The lists of documents a documentation scope carries. */
export type DocumentList = "sections" | "decisions";

/** Whether `documentation` holds any document of `lists`. */
export declare const carries: (
    documentation:
        | { sections?: readonly unknown[]; decisions?: readonly unknown[] }
        | undefined,
    lists?: readonly DocumentList[],
) => boolean;

/** Whether any documentation scope of `workspace` carries documents. */
export declare function anyScopeCarries(
    workspace: object | undefined,
    lists?: readonly DocumentList[],
): boolean;
