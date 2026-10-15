/**
 * A view's description as Structurizr writes it: what the view is about,
 * then, after "Author: ", who wrote it. The toolbar shows the two apart and
 * the export's title block gives the first only, so both read it here.
 */

/** What a view's description says, and who wrote it when it names them. */
export type SplitDescription = { description: string; author?: string };

/** The marker Structurizr puts before a view's author. */
const AUTHOR_MARKER = "Author: ";

/** `stored`, a view's description, split at the author it names. */
export function splitAuthor(stored: string): SplitDescription {
    const [description, author] = stored.split(AUTHOR_MARKER);
    return { description: description.trim(), author: author?.trim() };
}
