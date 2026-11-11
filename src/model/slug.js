/**
 * The one slug rule (ADR 30) that names every element in an address: a
 * documentation scope's segments and a workspace trail's. Plain JavaScript,
 * so the page and the set loader (`scripts/workspace-set.js`) share this one
 * copy; `slug.d.ts` types it for the page.
 */

/**
 * The slug of `name`: normalized to NFKD, combining marks dropped,
 * lowercased, every run of characters other than Unicode letters and numbers
 * turned into `-`, and `-` trimmed from both ends. The letters of every
 * script stay (`Straße` gives `straße`, `日本` stays `日本`).
 *
 * @param {unknown} name
 * @returns {string}
 */
export const slugOf = (name) =>
    String(name)
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "");

/**
 * The slugs of `names`, siblings in model order: each one's slug, with the
 * later of two that slug the same taking `-2`, the next `-3`, and a suffix
 * never landing on a slug an earlier sibling holds.
 *
 * @param {readonly unknown[]} names
 * @returns {string[]}
 */
export function siblingSlugs(names) {
    const taken = new Set();
    return names.map((name) => {
        const slug = slugOf(name);
        let unique = slug;
        for (let n = 2; taken.has(unique); n++) unique = `${slug}-${n}`;
        taken.add(unique);
        return unique;
    });
}
