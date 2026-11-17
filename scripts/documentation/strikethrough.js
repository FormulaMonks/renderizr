/**
 * GitHub's single-tilde strikethrough: `~one~` draws a line through the text,
 * as `~~two~~` does. markdown-it knows only double tildes, so this small
 * inline rule of Renderizr's own reads a lone tilde as a delimiter and pairs
 * it the way markdown-it pairs emphasis: a tilde opens when text follows it
 * and closes when text comes before it. A run of two is markdown-it's own
 * strikethrough, and a run of three or more stays text, as on GitHub.
 */

const TILDE = 0x7e;

/**
 * The marker this rule's delimiters carry. It differs from the tilde's own
 * code, so markdown-it never pairs a lone tilde with half of a `~~`.
 */
const MARKER = -TILDE;

/** Push a lone tilde as a delimiter. */
function tokenize(state, silent) {
    if (silent || state.src.charCodeAt(state.pos) !== TILDE) return false;

    const scanned = state.scanDelims(state.pos, true);
    if (scanned.length !== 1) return false;

    const token = state.push("text", "", 0);
    token.content = "~";
    state.delimiters.push({
        marker: MARKER,
        length: 0,
        token: state.tokens.length - 1,
        end: -1,
        open: scanned.can_open,
        close: scanned.can_close,
    });
    state.pos += 1;
    return true;
}

/** Turn each paired lone tilde into `<s>` and `</s>`. */
function pair(state, delimiters) {
    for (const start of delimiters) {
        if (start.marker !== MARKER || start.end === -1) continue;
        const end = delimiters[start.end];
        for (const [index, type, nesting] of [
            [start.token, "s_open", 1],
            [end.token, "s_close", -1],
        ]) {
            const token = state.tokens[index];
            token.type = type;
            token.tag = "s";
            token.nesting = nesting;
            token.markup = "~";
            token.content = "";
        }
    }
}

function postProcess(state) {
    pair(state, state.delimiters);
    for (const meta of state.tokens_meta) {
        if (meta?.delimiters) pair(state, meta.delimiters);
    }
}

/**
 * The markdown-it plugin for single-tilde strikethrough.
 *
 * @param {import("markdown-it").default} md
 */
export function singleTildeStrikethrough(md) {
    md.inline.ruler.after("strikethrough", "single_tilde", tokenize);
    md.inline.ruler2.after("strikethrough", "single_tilde", postProcess);
}
