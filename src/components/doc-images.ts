import type { DocumentationImage } from "../types/structurizr-documentation";

/** The embedded source for an image path, or `undefined` to leave it. */
export type ImageResolver = (src: string) => string | undefined;

// `https:`, `data:`… — anything with a scheme is somewhere else.
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

const decode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

/**
 * Resolve the relative image paths authors write in their documentation and
 * decisions (`![Edit mode](edit-mode.png)`) to the copy Structurizr embedded
 * in the workspace.
 *
 * Structurizr's importers read every image a file references into
 * `documentation.images`. The page has no folder beside it to load the file
 * from, and a single-file build makes no requests at all, so the image only
 * shows as the embedded copy.
 */
export function createImageResolver(
    images: DocumentationImage[] | undefined,
): ImageResolver {
    const sources = new Map(
        (images ?? []).map(({ name, type, content }) => [
            name,
            content.startsWith("data:")
                ? content
                : `data:${type};base64,${content}`,
        ]),
    );

    return (src) => {
        if (!src || src.startsWith("/") || HAS_SCHEME.test(src)) return;
        return sources.get(decode(src).replace(/^(\.\/)+/, ""));
    };
}
