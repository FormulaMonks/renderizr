/**
 * The author's warning of sibling slug collisions (ADR 30): when two
 * siblings that reach a documentation scope slug the same, the later one's
 * documents take `-2`, and `pnpm dev` and edit mode say so in a toast. A
 * built site never warns.
 */

import {
    type DocumentedWorkspace,
    slugCollisions,
    slugCollisionWarning,
} from "../model/documentation";
import { showNotice } from "./toast";

/**
 * A function that tells the author, through `notify`, of the collisions in
 * each workspace it is given, once until they change.
 */
export function createSlugCollisionWarner(
    notify: (text: string) => void = showNotice,
) {
    let told: string | null = null;
    return (workspace: DocumentedWorkspace) => {
        const warning = slugCollisionWarning(slugCollisions(workspace));
        if (warning && warning !== told) notify(warning);
        told = warning;
    };
}
