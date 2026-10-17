import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { findUnspellable, makeArtifactSafe } from "./escapes.js";

const FFFD = String.fromCharCode(65533);

/**
 * Each case is a JavaScript expression. Rewriting it must not change what it
 * evaluates to, and must leave nothing an artifact upload would reject.
 */
const PRESERVED = [
    // The literals the bundle actually carries: mdurl's runs of U+FFFD,
    // markdown-it's NUL replacement, jQuery's selector escaping.
    `"x${FFFD}y"`,
    `"${FFFD}${FFFD}${FFFD}${FFFD}"`,
    `1 + "${FFFD}".length`,
    `\`a${FFFD}b\``,

    // uc.micro's Unicode tables.
    String.raw`/[\uD800-\uDBFF][\uDC00-\uDFFF]/.source`,
    String.raw`/[\uD800-\uDBFF]/gi.flags`,
    String.raw`/[\uD800-\uDBFF]/.test(String.fromCharCode(0xd800))`,
    String.raw`"a\uD800b"`,

    // Anything else is left alone, characters above the BMP included: a
    // surrogate with a partner is an ordinary character, not a broken escape.
    String.raw`"hi 😀 there"`,
    String.raw`String(/[!-#%-\*,-\/:;\?@\[-\]_\{\}𐄀]/)`,
    String.raw`"tab\there \"q\" \\ \x41 \u{1F600} end"`,
    String.raw`"\\uD800 is already text"`,
    `({ok: 1, "k": 2}).ok`,
    `"'"`,
    `'"'`,
    `""`,
];

for (const source of PRESERVED) {
    test(`preserves ${source}`, () => {
        const rewritten = makeArtifactSafe(`(${source})`);

        assert.deepEqual(
            findUnspellable(rewritten),
            [],
            "rewritten code still says something the upload rejects",
        );
        assert.deepEqual(
            // biome-ignore lint/security/noGlobalEval: comparing results is the test
            String(eval(rewritten)),
            // biome-ignore lint/security/noGlobalEval: same
            String(eval(source)),
            "rewriting changed what the expression evaluates to",
        );
    });
}

test("finds what it cannot fix", () => {
    assert.equal(findUnspellable(`const a = "${FFFD}"`).length, 1);
    assert.equal(findUnspellable(String.raw`const a = /\uD800/`).length, 1);
    assert.equal(findUnspellable(String.raw`const a = "\\uD800"`).length, 0);
    assert.equal(findUnspellable(`const a = "😀"`).length, 0);
});

test("leaves code with nothing to fix untouched", () => {
    const code = `const a = "plain", b = /[a-z]/g;`;
    assert.equal(makeArtifactSafe(code), code);
});

/* ----------------------------------------------------------- brace escapes */

/**
 * `\u{...}` is the one escape that can name a code point above the BMP, so it
 * is the one the unit reader has to treat specially. It is only ever read when
 * the literal around it needs rewriting for some other reason, which is why
 * both cases below carry a lone surrogate as well.
 */
test("a brace escape above the BMP is carried through untouched", () => {
    const rewritten = makeArtifactSafe(String.raw`("\u{1F600}\uD800")`);

    assert.ok(
        rewritten.includes(String.raw`\u{1F600}`),
        `the astral escape should survive verbatim: ${rewritten}`,
    );
    assert.deepEqual(findUnspellable(rewritten), []);
    // biome-ignore lint/security/noGlobalEval: comparing results is the test
    assert.equal(eval(rewritten), "\u{1F600}\uD800");
});

test("a brace escape inside the BMP is carried through too", () => {
    const rewritten = makeArtifactSafe(String.raw`("\u{41}\uD800")`);

    assert.ok(rewritten.includes(String.raw`\u{41}`), rewritten);
    // biome-ignore lint/security/noGlobalEval: same
    assert.equal(eval(rewritten), "A\uD800");
});

/* ------------------------------------------------------------- the refusal */

/**
 * The whole point of this module is that it never ships a bundle it could not
 * make safe. Where a literal cannot be replaced by an expression there is no
 * rewrite to make, and the build has to stop rather than emit an artifact the
 * upload will reject — so the throw is asserted for every position that can
 * actually produce one.
 */
const REFUSED = {
    "an import binding named by a string": String.raw`import { "\uD800" as x } from "y";`,
    "an export binding named by a string": String.raw`const x = 1; export { x as "\uD800" };`,
    "a property key": `({ "${FFFD}": 1 })`,
    "a destructured key": `const { "${FFFD}": a } = o;`,
};

for (const [position, source] of Object.entries(REFUSED)) {
    test(`refuses to rewrite ${position}`, () => {
        assert.throws(() => makeArtifactSafe(source), {
            message:
                /Cannot make this bundle artifact-safe: a string sits where an expression cannot/,
        });
    });
}

/**
 * A directive prologue belongs in the list above — it is a string in a position
 * no expression can occupy — but it never reaches that check, because rollup's
 * native parser panics on it first: `"\uD800";` as source text makes it unwrap
 * a `None`. Verified across rollup 4.59 to 4.62, and narrower than it sounds —
 * it needs the escape *sequence*, in a directive, holding a lone surrogate. A
 * raw surrogate parses, and the same escape parses everywhere else.
 *
 * What matters is the guarantee, which is unchanged: the build stops rather
 * than emit an artifact the upload would reject. So this asserts the refusal
 * and the fail-closed behavior, not which of the two produced it.
 */
test("refuses to rewrite a directive prologue, whoever gives up first", () => {
    assert.throws(
        () => makeArtifactSafe(String.raw`"\uD800";`),
        /Cannot make this bundle artifact-safe:/,
    );
});

test("a bundle the parser cannot read is refused, never passed through", () => {
    // Fail closed. Returning unparseable input unchanged would hand back
    // exactly the artifact the caller asked to have made safe.
    assert.throws(
        () => makeArtifactSafe("const = ;"),
        /Cannot make this bundle artifact-safe: it could not be parsed/,
    );
});

test("the refusal says where in the bundle it gave up", () => {
    // A megabyte of minified code needs more than "it failed": the offset and
    // the snippet are how someone finds the literal.
    assert.throws(
        () => makeArtifactSafe(`({ "${FFFD}": 1 })`),
        (error) => {
            assert.match(error.message, /at offset \d+:/);
            assert.match(error.message, new RegExp(FFFD));
            return true;
        },
    );
});

/**
 * The tagged-template refusal fires, and it has to.
 *
 * Rewriting a quasi moves text out of the tag function's `raw` and into a
 * substitution, changing both what the tag receives and how many arguments it
 * gets. That is harmless for `String.raw` and wrong for a tag that reads `raw`
 * or counts its arguments, so `makeArtifactSafe` refuses rather than guess.
 *
 * It used to be unreachable: `walk` gave a `TemplateElement` its
 * `TemplateLiteral` as parent, never the `TaggedTemplateExpression` a level
 * above, so the guard never matched and every tagged template was quietly
 * rewritten. `walk` now carries the grandparent for exactly this check.
 */
test("a tagged template holding an unspellable unit is refused", () => {
    const source = `String.raw\`a${FFFD}b\``;

    assert.throws(
        () => makeArtifactSafe(source),
        /a tagged template holds an unspellable unit/,
        "the quasi was rewritten instead of refused",
    );
});

test("an untagged template with the same content is rewritten, not refused", () => {
    // The refusal is about what a tag function would receive, so it must not
    // fire on an ordinary template literal — those are the common case and
    // rewriting them is exactly what makeArtifactSafe is for.
    const source = `\`a${FFFD}b\``;
    const rewritten = makeArtifactSafe(source);

    assert.ok(
        rewritten.includes("${String.fromCharCode(65533)}"),
        `expected an interpolation, got: ${rewritten}`,
    );
    assert.deepEqual(findUnspellable(rewritten), []);
    assert.equal(
        // biome-ignore lint/security/noGlobalEval: comparing results is the test
        eval(rewritten),
        // biome-ignore lint/security/noGlobalEval: same
        eval(source),
    );
});

/**
 * The regular-expression refusal is unreachable for a different reason: no
 * parseable JavaScript puts a regex literal in any of the positions
 * `isValuePosition` rejects — they are property keys, module specifiers and
 * directive prologues, all of which are strings by grammar. Every position a
 * regex can actually occupy is rewritten, which is what this asserts.
 */
test("a regex in every position it can occupy is rewritten, never refused", () => {
    for (const source of [
        String.raw`({ re: /[\uD800-\uDBFF]/ })`,
        String.raw`({ [/[\uD800-\uDBFF]/.source]: 1 })`,
        String.raw`class A { static re = /[\uD800-\uDBFF]/; }`,
        String.raw`(function () { return /[\uD800-\uDBFF]/; })()`,
    ]) {
        const rewritten = makeArtifactSafe(source);

        assert.ok(rewritten.includes("RegExp("), rewritten);
        assert.deepEqual(findUnspellable(rewritten), [], source);
    }
});

/* ------------------------------------------------- regression: escapes read whole */

/**
 * Each case once came out of `makeArtifactSafe` wrong, and the properties
 * below cover all three. A template kept a surrogate escape the upload
 * rejects; a string kept an escaped U+FFFD; and a template lifted the U+FFFD
 * out from behind its backslash, which then escaped the `$` of the
 * interpolation and turned the value into the text `${String.fromCharCode(…)}`.
 */
const BACKTICK = "`";
const ESCAPED = {
    "a surrogate escape in a template": `(${BACKTICK}a\\uD800b${BACKTICK})`,
    "an escaped U+FFFD in a string": `("a\\${FFFD}b")`,
    "an escaped U+FFFD in a template": `(${BACKTICK}a\\${FFFD}b${BACKTICK})`,
};

for (const [what, source] of Object.entries(ESCAPED)) {
    test(`rewrites ${what} and keeps its value`, () => {
        const rewritten = makeArtifactSafe(source);

        assert.deepEqual(
            findUnspellable(rewritten),
            [],
            `rewritten code still says something the upload rejects: ${rewritten}`,
        );
        assert.equal(
            // biome-ignore lint/security/noGlobalEval: comparing results is the test
            eval(rewritten),
            // biome-ignore lint/security/noGlobalEval: same
            eval(source),
            `rewriting changed what the expression evaluates to: ${rewritten}`,
        );
    });
}

/* -------------------------------------------------------------- properties */

/**
 * The tables above hold the literals the bundle is known to carry. These run
 * `makeArtifactSafe` over literals fast-check builds from any code unit, each
 * spelled the ways JavaScript allows: as itself, as `\uXXXX` in either case,
 * as `\u{X}`, or behind a backslash that only stands for it. Lone surrogates
 * and U+FFFD come up often on purpose, as do the characters a literal has to
 * escape. A surrogate is never spelled as itself without its partner: source
 * holding one cannot be written to a file, and `makeArtifactSafe` refuses it.
 */

/** Characters `\` turns into something else, or into nothing at all. */
const NOT_AN_IDENTITY_ESCAPE = new Set([
    ..."bfnrtvux0123456789",
    "\n",
    "\r",
    " ",
    " ",
]);

const isSurrogate = (code) => code >= 0xd800 && code <= 0xdfff;
const hex = (code, upper) => {
    const digits = code.toString(16).padStart(4, "0");
    return upper ? digits.toUpperCase() : digits;
};

const codeUnit = fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 0x20, max: 0x7e }) },
    { weight: 2, arbitrary: fc.integer({ min: 0, max: 0xffff }) },
    {
        weight: 3,
        arbitrary: fc.constantFrom(
            0xfffd,
            0xd800,
            0xdbff,
            0xdc00,
            0xdfff,
            ..."\\\"'`${\n".split("").map((c) => c.charCodeAt(0)),
        ),
    },
);

/** One code unit, or one character above the BMP, with how to spell it. */
const token = fc.oneof(
    {
        weight: 5,
        arbitrary: fc.record({
            code: codeUnit,
            spelling: fc.constantFrom("itself", "u", "U", "brace", "identity"),
        }),
    },
    {
        weight: 1,
        arbitrary: fc.record({
            point: fc.integer({ min: 0x10000, max: 0x10ffff }),
            spelling: fc.constantFrom("itself", "brace", "pair"),
        }),
    },
);

/** `token` written inside a literal quoted with `quote`. */
function spell({ code, point, spelling }, quote) {
    if (point !== undefined) {
        if (spelling === "itself") return String.fromCodePoint(point);
        if (spelling === "brace") return `\\u{${point.toString(16)}}`;
        const pair = String.fromCodePoint(point);
        return `\\u${hex(pair.charCodeAt(0))}\\u${hex(pair.charCodeAt(1))}`;
    }

    const character = String.fromCharCode(code);
    const special =
        isSurrogate(code) ||
        code < 0x20 ||
        code === 0x2028 ||
        code === 0x2029 ||
        character === "\\" ||
        character === quote ||
        (quote === "`" && character === "$");
    if (spelling === "itself" && !special) return character;
    if (
        spelling === "identity" &&
        !isSurrogate(code) &&
        !NOT_AN_IDENTITY_ESCAPE.has(character)
    )
        return `\\${character}`;
    if (spelling === "brace") return `\\u{${code.toString(16)}}`;
    return `\\u${hex(code, spelling === "U")}`;
}

/** The string `tokens` spell. */
const spelledValue = (tokens) =>
    tokens
        .map(({ code, point }) =>
            point === undefined
                ? String.fromCharCode(code)
                : String.fromCodePoint(point),
        )
        .join("");

/** A high-surrogate escape, as the last thing spelled so far. */
const ENDS_IN_HIGH_SURROGATE_ESCAPE = /\\u[dD][89abAB][0-9a-fA-F]{2}$/;

/**
 * `tokens` as a literal quoted with `quote`. A brace escape right after a
 * high-surrogate escape is spelled `\uXXXX` instead: Rollup's parser rejects
 * that pair, and the test after the properties pins the refusal.
 */
function literal(tokens, quote) {
    let body = "";
    for (const each of tokens) {
        const brace = each.spelling === "brace";
        const spelling =
            brace && ENDS_IN_HIGH_SURROGATE_ESCAPE.test(body)
                ? { ...each, spelling: each.point === undefined ? "u" : "pair" }
                : each;
        body += spell(spelling, quote);
    }
    return `(${quote}${body}${quote})`;
}

for (const quote of [`"`, `'`, "`"]) {
    test(`a ${quote}-quoted literal keeps its value and spells nothing the upload rejects`, () => {
        fc.assert(
            fc.property(fc.array(token, { maxLength: 16 }), (tokens) => {
                const source = literal(tokens, quote);
                const rewritten = makeArtifactSafe(source);

                assert.deepEqual(
                    findUnspellable(rewritten),
                    [],
                    `${source} became ${rewritten}`,
                );
                assert.equal(
                    // biome-ignore lint/security/noGlobalEval: comparing results is the test
                    eval(rewritten),
                    spelledValue(tokens),
                    `${source} became ${rewritten}`,
                );
            }),
        );
    });

    test(`rewriting a ${quote}-quoted literal twice changes nothing the second time`, () => {
        fc.assert(
            fc.property(fc.array(token, { maxLength: 16 }), (tokens) => {
                const once = makeArtifactSafe(literal(tokens, quote));
                assert.equal(makeArtifactSafe(once), once);
            }),
        );
    });
}

test("a regular expression keeps its source and flags and spells nothing the upload rejects", () => {
    const piece = fc.oneof(
        fc.constantFrom(..."abcxyz019"),
        fc
            .record({ code: codeUnit, upper: fc.boolean() })
            .map(({ code, upper }) => `\\u${hex(code, upper)}`),
    );
    const flags = fc
        .subarray(["g", "i", "m", "s", "y"])
        .map((each) => each.join(""));

    fc.assert(
        fc.property(
            fc.array(piece, { minLength: 1, maxLength: 12 }),
            flags,
            (pieces, flag) => {
                const source = `(/(?:${pieces.join("")})/${flag})`;
                const rewritten = makeArtifactSafe(source);

                assert.deepEqual(
                    findUnspellable(rewritten),
                    [],
                    `${source} became ${rewritten}`,
                );
                // biome-ignore lint/security/noGlobalEval: comparing results is the test
                const [before, after] = [eval(source), eval(rewritten)];
                assert.equal(after.source, before.source, rewritten);
                assert.equal(after.flags, before.flags, rewritten);
            },
        ),
    );
});

/**
 * Rollup's native parser rejects a high-surrogate escape followed directly by
 * a brace escape, `"\uD800\u{20}"`, with "expected 4 hex characters", though
 * the JavaScript is valid. fast-check found it, and it holds in strings and
 * templates. As with the directive prologue above, what matters is the
 * guarantee: the build stops rather than emit an artifact the upload would
 * reject.
 */
test("a high-surrogate escape before a brace escape is refused, never passed through", () => {
    for (const source of [
        String.raw`("\uD800\u{20}")`,
        `(${BACKTICK}\\uDBFF\\u{20}${BACKTICK})`,
    ]) {
        assert.throws(
            () => makeArtifactSafe(source),
            /Cannot make this bundle artifact-safe:/,
            source,
        );
    }
});
