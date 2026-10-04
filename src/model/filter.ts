/*
 * Portions derived from Structurizr
 * (https://github.com/structurizr/structurizr), file
 * structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js
 * (includeElementOnDiagram, includeRelationshipOnDiagram, includeOnDiagram).
 *
 * Copyright Structurizr. Licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Modified by Renderizr: ported to typed TypeScript as pure predicates over
 * the model, with the element's tags trimmed as well as the filter's, and the
 * check for a filtered view whose base is filtered added (spec 12, 13).
 */

import { findOrderError } from "./animation";
import type { ModelElement, ModelRelationship, ModelView } from "./types";
import type { WorkspaceModel } from "./workspace";

/** A filtered view's tag filter: Include keeps any match, Exclude drops it. */
export type ViewFilter = {
    baseViewKey: string;
    mode: "Include" | "Exclude";
    tags: string[];
};

/** The tag filter a filtered view applies to its base. */
export function filterOf(view: ModelView): ViewFilter {
    return {
        baseViewKey: view.baseViewKey ?? "",
        mode: view.mode === "Include" ? "Include" : "Exclude",
        tags: Array.isArray(view.tags) ? view.tags : [],
    };
}

/**
 * Whether something carrying `tags` passes `filter` (spec 12): Include
 * keeps it when it carries at least one of the filter's tags, Exclude drops
 * it then. Both sides are compared trimmed.
 */
function passes(filter: ViewFilter, tags: string[]): boolean {
    const carried = new Set(tags.map((tag) => tag.trim()));
    const matches = filter.tags.some((tag) => carried.has(tag.trim()));
    return filter.mode === "Include" ? matches : !matches;
}

/** Whether an element passes, matched on all its tags, inherited ones included. */
export const elementPasses = (
    model: WorkspaceModel,
    filter: ViewFilter,
    element: ModelElement,
) => passes(filter, model.getAllTagsForElement(element));

/**
 * Whether a relationship passes, matched on all its tags: its own and those
 * of each relationship its `linkedRelationshipId` chain leads to.
 */
export const relationshipPasses = (
    model: WorkspaceModel,
    filter: ViewFilter,
    relationship: ModelRelationship,
) => passes(filter, model.getAllTagsForRelationship(relationship));

/**
 * Why the view under `key` cannot be drawn, or `undefined` when it can: a
 * filtered view whose base is itself filtered, or a dynamic view (or the
 * dynamic base of a filtered view) with an order that isn't an integer.
 * Checked by the build too, in `scripts/assets.js` (`validateWorkspace`),
 * with the same messages; `test/view-types.test.js` and
 * `test/animation.test.js` hold the two to them (spec 13).
 */
export function findViewError(
    model: WorkspaceModel,
    key: string,
): string | undefined {
    const view = model.findViewByKey(key);
    if (!view) return undefined;
    if (view.type !== "Filtered") return findOrderError(model, view);
    const base = model.findViewByKey(view.baseViewKey);
    if (!base) return undefined;
    if (base.type === "Filtered") {
        return `Filtered view "${view.key}" has filtered view "${base.key}" as its base; the base of a filtered view must not be filtered.`;
    }
    return findOrderError(model, base);
}
