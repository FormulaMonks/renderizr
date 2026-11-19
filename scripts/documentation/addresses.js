/**
 * What the link, image and embed resolvers share about the addresses an
 * author writes in documentation (ADR 31): whether one points somewhere
 * else, and its path as the author's file system spells it.
 */

/** An address with a scheme (`https:`, `mailto:`, `data:`…) is somewhere else. */
export const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * `value` with its percent escapes decoded, or as written when one of them
 * is broken (`100%.png`), so a bad escape leaves the address alone rather
 * than failing the build.
 *
 * @param {string} value
 * @returns {string}
 */
export function decodeAddress(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
