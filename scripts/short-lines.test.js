import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { breakLongPatterns, LINE_LIMIT } from "./short-lines.js";

/** Text longer than the limit, built from `unit`. */
const long = (unit) => unit.repeat(Math.ceil((LINE_LIMIT * 2) / unit.length));

/** The longest line of `code`. */
const longest = (code) =>
    Math.max(...code.split("\n").map((line) => line.length));

/**
 * Each case is a JavaScript expression with a regular expression literal
 * past the limit. Breaking it must not change what it evaluates to, and must
 * leave no line longer than the limit.
 */
const BROKEN = [
    // uc.micro's Unicode tables.
    `/[${long("\\u02C2-\\u02C5\\uD804\\/")}]/.source`,
    `/[${long("\\xA2-\\xA6")}]/gu.flags`,
    `/^(?:${long("a|")}b)$/.test("b")`,
    `/^(?:${long("😀|")}x)$/u.test("😀")`,
    `/${long('"q"\\\\')}/.source`,
];

for (const source of BROKEN) {
    test(`breaks ${source.slice(0, 40)}… and keeps its value`, () => {
        const broken = breakLongPatterns(`(${source})`);

        assert.ok(
            longest(broken) <= LINE_LIMIT,
            `a line of ${longest(broken)} characters is left`,
        );
        assert.deepEqual(
            // biome-ignore lint/security/noGlobalEval: comparing results is the test
            String(eval(broken)),
            // biome-ignore lint/security/noGlobalEval: same
            String(eval(source)),
            "breaking changed what the expression evaluates to",
        );
    });
}

test("leaves a short pattern and a long string as they are", () => {
    const code = `({a: "${long("k")}", b: /short/})`;
    assert.equal(breakLongPatterns(code), code);
});

/** `text` escaped to match itself as a regular expression. */
const escaped = (text) => text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");

test("breaking any long pattern keeps its source", () => {
    fc.assert(
        fc.property(
            fc.string({ unit: "grapheme-ascii", minLength: LINE_LIMIT + 1 }),
            (text) => {
                const source = `/${escaped(text)}/`;
                const broken = breakLongPatterns(`(${source})`);
                // biome-ignore lint/security/noGlobalEval: comparing results is the test
                assert.equal(eval(broken).source, eval(source).source);
            },
        ),
    );
});
