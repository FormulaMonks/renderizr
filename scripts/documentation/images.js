/**
 * The image resolver the build renders documentation with (ADR 31): a
 * relative image path an author writes becomes the copy the workspace
 * embeds, since the page has no folder beside it to load the file from.
 */

import { decodeAddress, HAS_SCHEME } from "./addresses.js";

/**
 * The embedded source for an image path, or `undefined` to leave it.
 *
 * @typedef {(src: string) => string | undefined} ImageResolver
 */

/**
 * Resolve the relative image paths authors write in their documentation and
 * decisions (`![Edit mode](edit-mode.png)`) to the copy Structurizr embedded
 * in the workspace.
 *
 * Structurizr's importers read every image a file references into
 * `documentation.images`. The page has no folder beside it to load the file
 * from, and a single-file build makes no requests at all, so the image only
 * shows as the embedded copy.
 *
 * An element's documentation scope passes its own images, then the workspace's as
 * `fallback`: an image its own documentation lacks comes from the
 * workspace's.
 *
 * @param {{ name: string, type: string, content: string }[] | undefined} images
 * @param {{ name: string, type: string, content: string }[]} [fallback]
 * @returns {ImageResolver}
 */
export function createImageResolver(images, fallback = []) {
    const sources = new Map(
        [...fallback, ...(images ?? [])].map(({ name, type, content }) => [
            name,
            content.startsWith("data:")
                ? content
                : `data:${type};base64,${content}`,
        ]),
    );

    return (src) => {
        if (!src || src.startsWith("/") || HAS_SCHEME.test(src)) return;
        // A fragment (`#gh-dark-mode-only`) stays on the embedded copy.
        const hash = src.indexOf("#");
        const path = hash < 0 ? src : src.slice(0, hash);
        const source = sources.get(decodeAddress(path).replace(/^(\.\/)+/, ""));
        if (source === undefined) return;
        return hash < 0 ? source : `${source}${src.slice(hash)}`;
    };
}
