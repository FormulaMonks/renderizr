/**
 * What markdown-it plugins share about paragraphs: a block of Renderizr's
 * own (a display expression, a diagram card) that an author writes on a
 * line of its own reads inside a paragraph, and stands as the block alone,
 * with no `<p>` around it.
 */

/**
 * Hide the paragraph around the inline token at `index` of `state.tokens`
 * when it holds nothing but one token `accepts`, line breaks and blank text
 * aside, and leave the inline token holding that token alone.
 *
 * @param {any} state markdown-it's core state.
 * @param {number} index
 * @param {(token: any) => boolean} accepts
 * @returns {any} The token that stands alone, or `null`.
 */
export function unwrapLoneToken(state, index, accepts) {
    const block = state.tokens[index];
    const open = state.tokens[index - 1];
    const close = state.tokens[index + 1];
    if (open?.type !== "paragraph_open" || close?.type !== "paragraph_close")
        return null;

    const content = (block.children ?? []).filter(
        (token) =>
            token.type !== "softbreak" &&
            token.type !== "hardbreak" &&
            !(token.type === "text" && !token.content.trim()),
    );
    if (content.length !== 1 || !accepts(content[0])) return null;

    open.hidden = true;
    close.hidden = true;
    block.children = content;
    return content[0];
}
