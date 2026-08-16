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
