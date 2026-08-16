/**
 * `src/components/asciidoc.ts` — the AsciiDoc-to-Markdown pass that
 * `src/pages/docs.ts` runs over any documentation section whose filename ends
 * in `.adoc` before handing it to the markdown renderer.
 *
 * It is a pure `string -> string` function, so these are exact-output tests.
 * It is deliberately not a conformant AsciiDoc processor: what it does not
 * recognize has to pass through unharmed, and there are tests for that too.
 *
 * The file lives in `scripts/` because `pnpm test` globs `scripts/*.test.js`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { asciidocToMarkdown, isAsciiDoc } = await importSrc(
    "components/asciidoc",
);

/* --------------------------------------------------------------- detection */

test("only a .adoc extension selects the AsciiDoc path", () => {
    assert.equal(isAsciiDoc("architecture.adoc"), true);
    assert.equal(isAsciiDoc("ARCHITECTURE.ADOC"), true);
    assert.equal(isAsciiDoc("nested/dir/notes.AdOc"), true);

    assert.equal(isAsciiDoc("architecture.md"), false);
    assert.equal(isAsciiDoc("adoc"), false);
    assert.equal(isAsciiDoc("a.adoc.md"), false);
    assert.equal(isAsciiDoc(""), false);
    assert.equal(isAsciiDoc(), false);
});

/* ---------------------------------------------------------------- headings */

test("`=` levels map one for one onto `#` levels", () => {
    assert.equal(
        asciidocToMarkdown("= Doc\n== Sec\n====== Six\n"),
        "# Doc\n## Sec\n###### Six\n",
    );
});

test("seven `=` is not a heading and is left alone", () => {
    assert.equal(asciidocToMarkdown("======= Seven\n"), "======= Seven\n");
});

/* -------------------------------------------------------- attributes, macros */

test("document attributes and the toc macro carry no content and are dropped", () => {
    assert.equal(
        asciidocToMarkdown(
            ":toc: macro\ntoc::[]\n:author: Ada\n:!sectnums:\nbody\n",
        ),
        "body\n",
    );
});

/* ------------------------------------------------------------ code, literal */

test("a source block becomes a fence tagged with its language", () => {
    assert.equal(
        asciidocToMarkdown('[source,json]\n----\n{"a":1}\n----\n'),
        '```json\n{"a":1}\n```\n',
    );
});

test("a listing block with no language becomes a bare fence", () => {
    assert.equal(asciidocToMarkdown("----\ncode\n----\n"), "```\ncode\n```\n");
});

test("literal and sidebar delimiters also become fences", () => {
    assert.equal(
        asciidocToMarkdown("....\nliteral\n....\n"),
        "```\nliteral\n```\n",
    );
    assert.equal(asciidocToMarkdown("****\nside\n****\n"), "```\nside\n```\n");
});

test("a delimiter of a different kind inside a block is content, not a close", () => {
    assert.equal(
        asciidocToMarkdown("----\nsome ==== inside\n----\n"),
        "```\nsome ==== inside\n```\n",
    );
});

test("the language attribute applies to the next block only", () => {
    assert.equal(
        asciidocToMarkdown(
            "[source,sql]\n----\nSELECT 1\n----\n----\nplain\n----\n",
        ),
        "```sql\nSELECT 1\n```\n```\nplain\n```\n",
    );
});

/* ------------------------------------------------------------- admonitions */

test("an inline admonition becomes a bold-led blockquote", () => {
    assert.equal(
        asciidocToMarkdown("NOTE: be careful\n"),
        "> **NOTE** be careful\n",
    );
});

test("a word that is not an admonition keeps its colon", () => {
    assert.equal(asciidocToMarkdown("WARN: not one\n"), "WARN: not one\n");
    assert.equal(asciidocToMarkdown("Note: not one\n"), "Note: not one\n");
});

test("every admonition label is recognized", () => {
    for (const label of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
        assert.equal(
            asciidocToMarkdown(`${label}: text\n`),
            `> **${label}** text\n`,
        );
        assert.equal(
            asciidocToMarkdown(`[${label}]\ntext\n`),
            `> **${label}**\n>\ntext\n`,
        );
    }
});

test("a quote block attribute becomes an attribution line", () => {
    assert.equal(
        asciidocToMarkdown("[quote, Ann, Book]\nsaid it\n"),
        "> *Ann, Book*\n>\nsaid it\n",
    );
});

/* ------------------------------------------------------------------ tables */

test("a table becomes a Markdown table with a generated header rule", () => {
    assert.equal(
        asciidocToMarkdown(
            "|===\n|Name |Description\n\n|a\n|b\n\n|c\n|d\n|===\n",
        ),
        "\n| Name | Description |\n| --- | --- |\n| a | b |\n| c | d |\n\n",
    );
});

test("the header rule is emitted once per table, not once per document", () => {
    const out = asciidocToMarkdown(
        "|===\n|A\n\n|1\n|===\n\ntext\n\n|===\n|B\n\n|2\n|===\n",
    );

    assert.equal((out.match(/\| --- \|/g) ?? []).length, 2);
    assert.ok(out.includes("| A |"), out);
    assert.ok(out.includes("| B |"), out);
    assert.ok(out.includes("\ntext\n"), out);
});

test("a blank line is what ends a row, so a table written without one is a single row", () => {
    // AsciiDoc's own convention separates rows by blank lines. A table written
    // with one line per row and no separators has no row boundary to find, and
    // the converter says so by producing one wide row rather than guessing.
    assert.equal(
        asciidocToMarkdown("|===\n| H1 | H2\n| r1 | r2\n|===\n"),
        "\n| H1 | H2 | r1 | r2 |\n| --- | --- | --- | --- |\n\n",
    );
});

test("an unterminated table still flushes its last row", () => {
    assert.equal(
        asciidocToMarkdown("|===\n|A |B\n"),
        "\n| A | B |\n| --- | --- |",
    );
});

/* ------------------------------------------------------------------ images */

test("a block image becomes a Markdown image, alt text first attribute only", () => {
    assert.equal(
        asciidocToMarkdown("image::embed:SystemContext[System Context, 600]\n"),
        "![System Context](embed:SystemContext)\n",
    );
});

test("quotes around the alt text are stripped", () => {
    assert.equal(
        asciidocToMarkdown('image::diagram.png["A diagram", 400]\n'),
        "![A diagram](diagram.png)\n",
    );
});

test("an image with no attributes gets an empty alt", () => {
    assert.equal(
        asciidocToMarkdown("image::diagram.png[]\n"),
        "![](diagram.png)\n",
    );
});

/* ------------------------------------------------------------------- lists */

test("repeated list markers become indentation", () => {
    assert.equal(
        asciidocToMarkdown("* one\n** two\n*** three\n"),
        "* one\n  * two\n    * three\n",
    );
    assert.equal(
        asciidocToMarkdown(". first\n.. second\n... third\n"),
        "1. first\n  1. second\n    1. third\n",
    );
});

/* ------------------------------------------------------------------ inline */

test("the doubled monospace form and attribute references are unwrapped", () => {
    assert.equal(
        asciidocToMarkdown("Use `+literal+` and {some-attr} here\n"),
        "Use `literal` and some-attr here\n",
    );
});

/* ------------------------------------------------------------ pass-through */

test("anything unrecognized survives verbatim", () => {
    const source = "some ((weird)) asciidoc\nwith <<a cross reference>>\n";
    assert.equal(asciidocToMarkdown(source), source);
});

test("CRLF input is normalized to LF", () => {
    assert.equal(asciidocToMarkdown("= A\r\n\r\nb\r\n"), "# A\n\nb\n");
});

test("empty input converts to empty output", () => {
    assert.equal(asciidocToMarkdown(""), "");
});

/* ------------------------------------------------------------- a whole file */

test("a realistic section converts end to end", () => {
    const source = [
        "= Deployment",
        ":toc: macro",
        "toc::[]",
        "",
        "== Overview",
        "",
        "NOTE: The pipeline runs on every push.",
        "",
        "[source,bash]",
        "----",
        "pnpm build",
        "----",
        "",
        "|===",
        "|Stage |Runs on",
        "",
        "|build",
        "|ubuntu-latest",
        "|===",
        "",
        "image::embed:Deployment[Deployment view]",
        "",
    ].join("\n");

    assert.equal(
        asciidocToMarkdown(source),
        [
            "# Deployment",
            "",
            "## Overview",
            "",
            "> **NOTE** The pipeline runs on every push.",
            "",
            "```bash",
            "pnpm build",
            "```",
            "",
            "",
            "| Stage | Runs on |",
            "| --- | --- |",
            "| build | ubuntu-latest |",
            "",
            "",
            "![Deployment view](embed:Deployment)",
            "",
        ].join("\n"),
    );
});
