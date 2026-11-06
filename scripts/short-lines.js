import { parseAst, transformWithEsbuild } from "vite";
import { isValuePosition, walk } from "./escapes.js";

/**
 * Keeps every line a build writes short, so Claude can read any file a range
 * of lines at a time (spec 296).
 *
 * esbuild's `lineLimit` does most of it: `scripts/config.js` hands it to the
 * script minifier, which breaks a line at the first place it can once the
 * line passes the limit, inside a string too, with a line continuation.
 * Three things get past it. Vite minifies the stylesheet onto one line and
 * passes no `lineLimit` to that minifier. A regular expression literal is
 * one token that cannot be continued: `uc.micro`'s Unicode tables run to
 * about 3 KB each. And a line runs past the limit by the token esbuild was
 * in when it reached it.
 */

/**
 * The line length esbuild aims for. 400 costs about 0.25% more bytes than one
 * line per chunk.
 */
export const LINE_LIMIT = 400;

/** The most a piece of a broken literal holds, so its line stays short. */
const PIECE = LINE_LIMIT / 2;

/** `text` in pieces of at most `PIECE` code units, never inside a pair. */
function piecesOf(text) {
    const pieces = [];
    let at = 0;
    while (at < text.length) {
        let end = Math.min(at + PIECE, text.length);
        const code = text.charCodeAt(end - 1);
        if (end < text.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
        pieces.push(text.slice(at, end));
        at = end;
    }
    return pieces;
}

/**
 * `code` with every regular expression literal longer than `LINE_LIMIT`
 * written as a `RegExp(…)` call, as `makeArtifactSafe` writes one, on a
 * pattern built from short strings, one per line. The pattern's escapes
 * are text in a string, so a piece may end anywhere.
 */
export function breakLongPatterns(code) {
    const edits = [];
    walk(parseAst(code), null, (node, parent) => {
        if (!node.regex || node.end - node.start <= LINE_LIMIT) return;
        if (!isValuePosition(node, parent)) return;
        const { pattern, flags } = node.regex;
        const pieces = piecesOf(pattern).map((piece) => JSON.stringify(piece));
        edits.push({
            start: node.start,
            end: node.end,
            text: `RegExp(${pieces.join("+\n")}${flags ? `,${JSON.stringify(flags)}` : ""})`,
        });
    });

    let out = code;
    // Back to front, so that an earlier edit cannot move a later one's offsets.
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }
    return out;
}

/**
 * The Vite plugin that keeps each chunk's literals and the stylesheet's
 * lines short. It runs before anything inlines either, which
 * `--single-file` and `--artifact` do.
 */
export function shortLines() {
    return {
        name: "renderizr:short-lines",
        enforce: "post",
        async generateBundle(_options, bundle) {
            for (const output of Object.values(bundle)) {
                if (output.type === "chunk") {
                    output.code = breakLongPatterns(output.code);
                } else if (output.fileName.endsWith(".css")) {
                    const { code } = await transformWithEsbuild(
                        String(output.source),
                        output.fileName,
                        { loader: "css", minify: true, lineLimit: LINE_LIMIT },
                    );
                    output.source = code;
                }
            }
        },
    };
}
