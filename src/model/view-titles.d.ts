/**
 * The types of `view-titles.js`, what a view is called. The rule stays
 * plain JavaScript so the build's diagram cards run the same copy as the
 * page; this file lets the page's TypeScript import it.
 */

import type { ModelElement, ModelView } from "./types";

/** How a caller finds the elements and views a title names. */
export type TitleLookups = {
    element: (id: string | undefined) => ModelElement | undefined;
    view: (key: string | undefined) => ModelView | undefined;
    enterprise?: { name: string } | undefined;
};

/** A view's own title, else one made from its type and its subject. */
export declare function viewTitle(
    view: ModelView,
    lookups: TitleLookups,
): string;

/** The name Structurizr makes for a view from its type and its subject. */
export declare function defaultViewName(
    view: ModelView,
    lookups: TitleLookups,
): string;
