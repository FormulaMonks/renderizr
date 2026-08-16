import assert from "node:assert/strict";
import { test } from "node:test";
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
    "a directive prologue": String.raw`"\uD800";`,
};

for (const [position, source] of Object.entries(REFUSED)) {
    test(`refuses to rewrite ${position}`, () => {
        assert.throws(() => makeArtifactSafe(source), {
            message:
                /Cannot make this bundle artifact-safe: a string sits where an expression cannot/,
        });
    });
}

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
