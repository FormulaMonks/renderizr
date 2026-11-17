import { full as emojiPlugin } from "markdown-it-emoji";

/**
 * GitHub's emoji shortcodes: `:+1:` and every Unicode shortcode render as
 * the Unicode emoji, through markdown-it-emoji's full list. GitHub's image
 * emoji (`:shipit:`, `:octocat:`) are not in it, so they stay as text, and
 * so do text smileys (`:)`, `<3`), which GitHub leaves alone too.
 *
 * @param {import("markdown-it").default} md
 */
export function emoji(md) {
    md.use(emojiPlugin, { shortcuts: {} });
}
