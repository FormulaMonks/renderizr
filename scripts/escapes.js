import { parseAst } from "vite";

/**
 * Rewrites the two things a Claude artifact upload refuses to carry.
 *
 * The deploy API scans the raw text of an uploaded file and turns it away if it
 * finds either a literal U+FFFD or an escape sequence that decodes to an
 * unpaired surrogate. Both turn up in the bundle as ordinary library data,
 * nothing corrupt:
 *
 *   - `mdurl` returns runs of U+FFFD for invalid UTF-8, `markdown-it` maps NUL
 *     to it, and jQuery's selector escaping does the same. Minification turns
 *     the `'�'` those are written as into the character itself.
 *   - `uc.micro`'s Unicode tables are regular expressions full of
 *     `[\uD800-\uDBFF]`, which is valid JavaScript but reads as an unpaired
 *     surrogate to anything decoding the text rather than parsing it.
 *
 * Both become expressions that evaluate to exactly the same value while
 * spelling out neither: strings gain a `String.fromCharCode` term, and the
 * affected regular expressions become `RegExp("…")`, where the escape is
 * written with two backslashes and is therefore only ever text.
 */

const REPLACEMENT_CHARACTER = 0xfffd;

const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Whether the code unit at `at` is half of a surrogate pair with no other half
 * — the thing a decoder cannot make a character out of. A matched pair is an
 * ordinary character above the BMP, an emoji in a workspace for instance, and
 * is left exactly as it is.
 */
function isLoneSurrogate(text, at) {
    const code = text.charCodeAt(at);
    if (isHighSurrogate(code)) return !isLowSurrogate(text.charCodeAt(at + 1));
    if (isLowSurrogate(code)) return !isHighSurrogate(text.charCodeAt(at - 1));
    return false;
}

/** A code unit the payload may not spell out. */
const isUnspellable = (text, at) =>
    text.charCodeAt(at) === REPLACEMENT_CHARACTER || isLoneSurrogate(text, at);

function hasUnspellable(text) {
    for (let at = 0; at < text.length; at++) {
        if (isUnspellable(text, at)) return true;
    }
    return false;
}

function hasLoneSurrogate(text) {
    for (let at = 0; at < text.length; at++) {
        if (isLoneSurrogate(text, at)) return true;
    }
    return false;
}

/** A `\uD83D`-style escape, however many backslashes precede it. */
const SURROGATE_ESCAPE = /\\+u[dD][89abAB][0-9a-fA-F]{2}/g;

/**
 * Whether the text spells out a surrogate escape that a decoder would act on.
 * An even number of backslashes escapes the backslash itself, which leaves the
 * `u` as text — that form is what this whole module produces.
 */
function hasLiveSurrogateEscape(text) {
    for (const hit of text.matchAll(SURROGATE_ESCAPE)) {
        const backslashes = /^\\+/.exec(hit[0])[0].length;
        if (backslashes % 2 === 1) return true;
    }
    return false;
}

/** Keys that hold positions and bookkeeping rather than child nodes. */
const NOT_A_CHILD = new Set(["type", "start", "end", "loc", "range", "parent"]);

/**
 * Join the pieces of a rewritten literal into one expression, parenthesised so
 * that no operator the literal used to sit next to can pull it apart.
 */
const concatenate = (parts) =>
    parts.length === 0
        ? '""'
        : parts.length === 1
          ? parts[0]
          : `(${parts.join("+")})`;

/**
 * A JavaScript expression evaluating to `value`, with every unspellable code
 * unit lifted out into a `String.fromCharCode` call. For text this build
 * produces itself, where there is no source form to preserve.
 */
function quote(value) {
    const parts = [];
    let text = "";
    let codes = [];

    const flushText = () => {
        if (!text) return;
        parts.push(JSON.stringify(text));
        text = "";
    };

    const flushCodes = () => {
        if (!codes.length) return;
        parts.push(`String.fromCharCode(${codes.join(",")})`);
        codes = [];
    };

    for (let at = 0; at < value.length; at++) {
        if (isUnspellable(value, at)) {
            flushText();
            codes.push(value.charCodeAt(at));
        } else {
            flushCodes();
            text += value[at];
        }
    }

    flushText();
    flushCodes();

    return concatenate(parts);
}

/**
 * The code units a string literal's body spells out, each keeping the source
 * text that produced it.
 *
 * Only `\uXXXX` and `\u{X}` can name a surrogate or U+FFFD, so every other
 * escape is taken as opaque: it is classified as nothing in particular and
 * copied through untouched, which is all this needs of it. Splitting an escape
 * like `\x41` across entries is harmless for the same reason — the pieces are
 * re-emitted in order and none of them is ever lifted out.
 */
function unitsOf(body) {
    const units = [];

    for (let at = 0; at < body.length; ) {
        if (body[at] !== "\\") {
            units.push({ text: body[at], code: body.charCodeAt(at) });
            at += 1;
            continue;
        }

        if (body[at + 1] === "u" && body[at + 2] === "{") {
            const close = body.indexOf("}", at + 3);
            const text = body.slice(at, close + 1);
            const point = Number.parseInt(text.slice(3, -1), 16);
            // Anything above the BMP is a pair, so never a lone surrogate.
            units.push({
                text,
                code: point <= 0xffff ? point : undefined,
                escaped: true,
            });
            at += text.length;
            continue;
        }

        if (body[at + 1] === "u") {
            const text = body.slice(at, at + 6);
            units.push({
                text,
                code: Number.parseInt(text.slice(2), 16),
                escaped: true,
            });
            at += 6;
            continue;
        }

        units.push({ text: body.slice(at, at + 2) });
        at += 2;
    }

    return units;
}

/**
 * A JavaScript expression evaluating to whatever the string literal `raw`
 * evaluates to, with nothing left in it that a Claude artifact upload rejects.
 *
 * Built from the literal's own source rather than from its value: a value the
 * parser hands back has been through UTF-8, which no lone surrogate survives.
 * Every run this does not have to touch is copied through exactly as it was
 * written.
 */
function quoteLiteral(raw) {
    const quoteCharacter = raw[0];
    const units = unitsOf(raw.slice(1, -1));

    const codeAt = (at) => units[at]?.code;
    // An escape is a spelling, and a spelling is what the upload objects to,
    // so all of those go — paired or not. A surrogate written as itself is
    // only a problem when it has no partner to make a character with.
    const mustGo = (unit, at) =>
        unit.code === REPLACEMENT_CHARACTER ||
        (unit.escaped &&
            (isHighSurrogate(unit.code) || isLowSurrogate(unit.code))) ||
        (isHighSurrogate(unit.code) && !isLowSurrogate(codeAt(at + 1))) ||
        (isLowSurrogate(unit.code) && !isHighSurrogate(codeAt(at - 1)));

    const parts = [];
    let text = "";
    let codes = [];

    const flushText = () => {
        if (!text) return;
        parts.push(`${quoteCharacter}${text}${quoteCharacter}`);
        text = "";
    };

    const flushCodes = () => {
        if (!codes.length) return;
        parts.push(`String.fromCharCode(${codes.join(",")})`);
        codes = [];
    };

    units.forEach((unit, at) => {
        if (mustGo(unit, at)) {
            flushText();
            codes.push(unit.code);
        } else {
            flushCodes();
            text += unit.text;
        }
    });

    flushText();
    flushCodes();

    return concatenate(parts);
}

/**
 * Whether an expression may stand where this node stands.
 *
 * A string is not always a value: it is also how property names, module
 * specifiers and import attributes are written, and none of those can be
 * replaced by a call.
 */
function isValuePosition(node, parent) {
    if (!parent) return true;

    switch (parent.type) {
        case "Property":
        case "PropertyDefinition":
        case "MethodDefinition":
            return !(parent.key === node && !parent.computed);
        case "ImportDeclaration":
        case "ExportNamedDeclaration":
        case "ExportAllDeclaration":
            return parent.source !== node;
        case "ImportAttribute":
        case "ImportSpecifier":
        case "ExportSpecifier":
            return false;
        // A directive prologue is text, not an expression: rewriting it would
        // turn "use strict" into a statement that does nothing.
        case "ExpressionStatement":
            return parent.directive === undefined;
        default:
            return true;
    }
}

function walk(node, parent, visit) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
        for (const child of node) walk(child, parent, visit);
        return;
    }

    if (typeof node.type !== "string") return;
    visit(node, parent);

    for (const key of Object.keys(node)) {
        if (NOT_A_CHILD.has(key)) continue;
        walk(node[key], node, visit);
    }
}

/** Every rewrite `code` needs, in the order the parser found them. */
function collectEdits(code) {
    const edits = [];

    const refuse = (node, why) => {
        const snippet = code.slice(
            node.start,
            Math.min(node.end, node.start + 80),
        );
        throw new Error(
            `Cannot make this bundle artifact-safe: ${why}.\n  at offset ${node.start}: ${snippet}`,
        );
    };

    walk(parseAst(code), null, (node, parent) => {
        if (node.type === "TemplateElement") {
            const raw = node.value.raw;
            if (!hasUnspellable(raw)) return;
            if (parent?.type === "TaggedTemplateExpression") {
                refuse(node, "a tagged template holds an unspellable unit");
            }

            // A quasi cannot hold an expression, but the template around it
            // can: each unit becomes an interpolation and the text stays put.
            let text = "";
            for (let at = 0; at < raw.length; at++) {
                text += isUnspellable(raw, at)
                    ? `\${String.fromCharCode(${raw.charCodeAt(at)})}`
                    : raw[at];
            }

            edits.push({ start: node.start, end: node.end, text });
            return;
        }

        if (node.type !== "Literal") return;

        if (node.regex) {
            const { pattern, flags } = node.regex;
            if (!hasUnspellable(pattern) && !hasLiveSurrogateEscape(pattern))
                return;
            if (!isValuePosition(node, parent)) {
                refuse(node, "a regular expression sits where a call cannot");
            }

            edits.push({
                start: node.start,
                end: node.end,
                text: `RegExp(${quote(pattern)}${flags ? `,${JSON.stringify(flags)}` : ""})`,
            });
            return;
        }

        if (typeof node.value !== "string") return;
        if (!hasUnspellable(node.raw) && !hasLiveSurrogateEscape(node.raw))
            return;
        if (!isValuePosition(node, parent)) {
            refuse(node, "a string sits where an expression cannot");
        }

        edits.push({
            start: node.start,
            end: node.end,
            text: quoteLiteral(node.raw),
        });
    });

    return edits;
}

/**
 * Each place `text` still says something a Claude artifact upload rejects, as
 * `offset: excerpt`. Empty when there is nothing left to find — which is the
 * only thing this build trusts, since the alternative is a file that looks fine
 * and is turned away on upload.
 */
export function findUnspellable(text) {
    const found = [];
    const excerpt = (at) =>
        `${at}: …${text.slice(Math.max(0, at - 50), at + 50).replace(/\n/g, "⏎")}…`;

    for (let at = 0; at < text.length; at++) {
        if (isUnspellable(text, at)) found.push(excerpt(at));
    }

    for (const hit of text.matchAll(SURROGATE_ESCAPE)) {
        const backslashes = /^\\+/.exec(hit[0])[0].length;
        if (backslashes % 2 === 1) found.push(excerpt(hit.index));
    }

    return found;
}

/**
 * `code` with nothing left in it that a Claude artifact upload will reject.
 */
export function makeArtifactSafe(code) {
    // Nothing downstream can preserve one of these: the parser reads the AST
    // back through UTF-8 and writing the file encodes it, and both turn a lone
    // surrogate into U+FFFD. Minifiers escape them rather than emit them, so
    // this says a tool upstream has done something new, not that some input
    // needs handling.
    if (hasLoneSurrogate(code)) {
        throw new Error(
            "Cannot make this bundle artifact-safe: it holds a lone surrogate as a character rather than an escape, which cannot survive being written to a file.",
        );
    }

    const edits = collectEdits(code);
    if (!edits.length) return code;

    let out = code;
    // Back to front, so that an earlier edit cannot move a later one's offsets.
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }

    return out;
}
