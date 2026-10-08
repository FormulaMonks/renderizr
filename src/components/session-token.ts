/**
 * The edit-mode session token (spec 4.5). `renderizr edit` puts a random
 * token in the URL it prints and opens; the page keeps it for the tab in
 * session storage and drops it from the address bar, so it never lands in a
 * bookmark or a screenshot. Every save carries it in a header.
 *
 * The page takes the token once, as it starts, and keeps it in memory, so a
 * page without session storage still saves.
 */

/** Where the tab keeps the token. */
export const SESSION_TOKEN_KEY = "renderizr:session-token";

/** The search parameter the server puts the token in. */
const TOKEN_PARAM = "token";

/** What `takeSessionToken` reads and changes, the page's own by default. */
export type TokenWindow = {
    location: Pick<Location, "search" | "pathname" | "hash">;
    storage: Pick<Storage, "getItem" | "setItem">;
    replaceUrl(url: string): void;
};

const pageWindow = (): TokenWindow => ({
    location: window.location,
    storage: window.sessionStorage,
    replaceUrl: (url) =>
        window.history.replaceState(window.history.state, "", url),
});

/** The token the page took as it started, or `undefined` before then. */
let taken: string | null | undefined;

/**
 * The session token: taken from the URL when it carries one, which also
 * stores it and drops it from the address bar, otherwise the one the tab
 * kept. `null` when neither has one; to reopen edit mode, the author uses
 * the URL the terminal printed.
 */
export function takeSessionToken(
    page: TokenWindow = pageWindow(),
): string | null {
    const { location, storage } = page;
    const search = new URLSearchParams(location.search);
    const fromUrl = search.get(TOKEN_PARAM);

    if (fromUrl) {
        taken = fromUrl;
        try {
            storage.setItem(SESSION_TOKEN_KEY, fromUrl);
        } catch {
            // Without session storage the token lasts until a reload.
        }
        search.delete(TOKEN_PARAM);
        const rest = search.toString();
        page.replaceUrl(
            `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`,
        );
        return fromUrl;
    }

    try {
        taken = storage.getItem(SESSION_TOKEN_KEY);
    } catch {
        taken = null;
    }
    return taken;
}

/** The token the page took as it started, taking it now if it hasn't. */
export const sessionToken = () =>
    taken === undefined ? takeSessionToken() : taken;
