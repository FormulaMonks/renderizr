/**
 * `scripts/documentation/math.js` — math in documentation, written as
 * MathML by Temml in the build (ADR 31).
 *
 * These are input -> HTML tests: feed Markdown or AsciiDoc in, assert the
 * markup out. An expression that renders shows up as a `<math>` element; one
 * that stays text does not.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    createAsciiDoc,
    renderAsciiDoc,
} from "../scripts/documentation/asciidoc.js";
import { CLASSES } from "../scripts/documentation/classes.js";
import {
    createMarkdown,
    renderMarkdown,
} from "../scripts/documentation/markdown.js";

const md = createMarkdown();
const asciidoc = createAsciiDoc();

/** `markdown` as the build renders it. */
const markdown = (source) => renderMarkdown(md, source);

/** `source` as the build renders it from AsciiDoc. */
const adoc = (source) => renderAsciiDoc(asciidoc, source);

/** The `<math>` elements of `html`. */
const maths = (html) => html.match(/<math\b[\s\S]*?<\/math>/g) ?? [];

/**
 * What the build writes to standard error while `run` runs, with standard
 * error itself left quiet.
 */
async function stderrOf(run) {
    const written = [];
    const write = process.stderr.write;
    process.stderr.write = (chunk) => {
        written.push(String(chunk));
        return true;
    };
    try {
        await run();
    } finally {
        process.stderr.write = write;
    }
    return written.join("");
}

/* ---------------------------------------------------------- GitHub's syntax */

test("$…$ renders inline math as MathML inside the paragraph", () => {
    const html = markdown("Inline: $\\sqrt{3x-1}+(1+x)^2$ here.");

    assert.equal(maths(html).length, 1);
    assert.match(html, /^<p>Inline: <math><mrow><msqrt>/);
    assert.match(html, /<\/math> here\.<\/p>/);
    assert.doesNotMatch(html, /\$/);
});

test("$`…`$ renders inline math, the backticks only delimiting it", () => {
    const html = markdown("Inline: $`\\sqrt{3x-1}+(1+x)^2`$ here.");

    assert.equal(maths(html).length, 1);
    assert.doesNotMatch(html, /<code>|\$|`/);
});

test("$$…$$ on its own renders a display block that scrolls on its own", () => {
    const html = markdown("$$\\left( \\sum_{k=1}^n a_k b_k \\right)^2$$");

    assert.match(
        html,
        new RegExp(
            `^<div class="${CLASSES.mathDisplay}"><math display="block"`,
        ),
    );
    assert.doesNotMatch(html, /<p>/);
});

test("$$…$$ may span lines of its paragraph", () => {
    const html = markdown("$$\na^2 + b^2\n= c^2\n$$");

    assert.equal(maths(html).length, 1);
    assert.match(html, /display="block"/);
});

test("$$…$$ inside a sentence renders a display block where it stands", () => {
    const html = markdown("Before $$x^2$$ after.");

    assert.match(
        html,
        new RegExp(
            `^<p>Before <span class="${CLASSES.mathDisplay}"><math display="block"`,
        ),
    );
    assert.match(html, / after\.<\/p>/);
});

test("a ```math fence renders a display block", () => {
    const html = markdown("```math\na^2 + b^2 = c^2\n```\n");

    assert.match(
        html,
        new RegExp(
            `^<div class="${CLASSES.mathDisplay}"><math display="block"`,
        ),
    );
    assert.doesNotMatch(html, /<pre>|<code/);
});

/* ------------------------------------------------------ Structurizr's syntax */

test("Structurizr's `$…$` code span renders inline math", () => {
    const html = markdown("Energy: `$E = mc^2$`.");

    assert.equal(maths(html).length, 1);
    assert.doesNotMatch(html, /<code>|\$/);
});

test("Structurizr's ```katex fence renders a display block", () => {
    const html = markdown(
        "```katex\nf(x) = \\int_{-\\infty}^\\infty \\hat f(\\xi)\\,d\\xi\n```\n",
    );

    assert.match(
        html,
        new RegExp(
            `^<div class="${CLASSES.mathDisplay}"><math display="block"`,
        ),
    );
});

/* --------------------------------------------------- Pandoc's dollar rule */

test("prices stay text: no math between $5 and $50", () => {
    const html = markdown("It costs $5 a month, or $50 a year.");

    assert.equal(maths(html).length, 0);
    assert.equal(html, "<p>It costs $5 a month, or $50 a year.</p>\n");
});

test("a range of prices stays text: a digit right after the closing dollar", () => {
    const html = markdown("The upgrade runs $5-$10.");

    assert.equal(maths(html).length, 0);
    assert.equal(html, "<p>The upgrade runs $5-$10.</p>\n");
});

test("a space just inside either dollar keeps the dollars text", () => {
    assert.equal(maths(markdown("Pay $ x$ now.")).length, 0);
    assert.equal(maths(markdown("Pay $x $ now.")).length, 0);
});

test("math starting with a digit renders when its closing dollar is followed by no digit", () => {
    assert.equal(maths(markdown("we calculate $100/2$")).length, 1);
});

/* ---------------------------------------------------- escaped dollars */

test("\\$ stays a literal dollar, and the math after it still renders", () => {
    const html = markdown("To split \\$100 in half, we calculate $100/2$");

    assert.match(html, /^<p>To split \$100 in half, we calculate <math>/);
    assert.equal(maths(html).length, 1);
});

test("\\$ inside an expression is a dollar in the math", () => {
    const html = markdown("Cost: $`\\sqrt{\\$4}`$ and $a \\$ b$.");

    assert.equal(maths(html).length, 2);
    assert.match(maths(html)[0], /<mi>\$<\/mi>/);
    assert.match(maths(html)[1], /<mi>\$<\/mi>/);
});

/* ---------------------------------------------------------- dollars in code */

test("dollars in a code span stay code", () => {
    const html = markdown("Run `echo $HOME and $PATH` now.");

    assert.equal(maths(html).length, 0);
    assert.match(html, /<code>echo \$HOME and \$PATH<\/code>/);
});

test("dollars in a fence stay code", () => {
    const html = markdown('```bash\necho "$HOME" && total=$((5 * 2))$\n```\n');

    assert.equal(maths(html).length, 0);
    assert.match(html, /<pre><code class="language-bash">/);
});

test("dollars in an indented code block stay code", () => {
    const html = markdown("Text.\n\n    $x^2$ and $$y$$\n");

    assert.equal(maths(html).length, 0);
    assert.match(html, /<pre><code>\$x\^2\$ and \$\$y\$\$\n<\/code><\/pre>/);
});

test("a code span between two dollars keeps them apart", () => {
    const html = markdown("From $a `b$` to c$.");

    assert.equal(maths(html).length, 0);
    assert.match(html, /<code>b\$<\/code>/);
});

/* ------------------------------------------------- what Markdown would read */

test("stars, underscores, quotes and dashes inside math stay math", () => {
    const html = markdown(
        'See $a_1 * b_1 = a^* \\cdot b_*$ and $a--b$ and $f\'(x) = "y"$, with "quotes" -- here.',
    );

    assert.equal(maths(html).length, 3);
    assert.doesNotMatch(html, /<em>|<strong>/);
    assert.match(html, /“quotes” – here/);
});

test("a heading keeps its slug with math in it", () => {
    const html = markdown("## The $x^2$ rule");

    assert.match(html, /^<h3 id="the-x2-rule" tabindex="-1">The <math>/);
});

/* ----------------------------------------------- a formula that fails to parse */

test("inline math that fails to parse reads as prose, and the build warns", async () => {
    let html = "";
    const warnings = await stderrOf(() => {
        html = markdown("The expression $\\frac{1}{$ stays.");
    });

    assert.equal(maths(html).length, 0);
    assert.equal(html, "<p>The expression $\\frac{1}{$ stays.</p>\n");
    assert.match(warnings, /^warning: .*\\frac\{1\}\{/);
});

test("a math fence that fails to parse stays a code block", async () => {
    let html = "";
    const warnings = await stderrOf(() => {
        html = markdown("```math\n\\left( y\n```\n");
    });

    assert.equal(maths(html).length, 0);
    assert.equal(
        html,
        '<pre><code class="language-math">\\left( y\n</code></pre>\n',
    );
    assert.match(warnings, /\\left\( y/);
});

test("the build warns once per expression that fails to parse", async () => {
    const warnings = await stderrOf(() => {
        markdown("Twice: $\\frac{2}{$ and");
        markdown("$\\frac{2}{$ again.");
    });

    assert.equal(warnings.split("\n").filter(Boolean).length, 1);
});

test("Structurizr's `$…$` that fails to parse stays code", async () => {
    let html = "";
    await stderrOf(() => {
        html = markdown("See `$\\frac{3}{$`.");
    });

    assert.match(html, /<code>\$\\frac\{3\}\{\$<\/code>/);
});

/* -------------------------------------------------------------- AsciiDoc */

test("AsciiDoc's latexmath:[…] renders inline math", async () => {
    const html = await adoc("Inline latexmath:[a < b] here.");

    assert.equal(maths(html).length, 1);
    assert.match(html, /<mo>&lt;<\/mo>/);
    assert.doesNotMatch(html, /\\\(/);
});

test("AsciiDoc's stem:[…] reads LaTeX when the document sets :stem: latexmath", async () => {
    const html = await adoc(":stem: latexmath\n\nInline stem:[\\sqrt{x}].");

    assert.equal(maths(html).length, 1);
    assert.match(html, /<msqrt>/);
});

test("AsciiDoc's stem:[…] reads AsciiMath by default, through LaTeX", async () => {
    const html = await adoc("Inline stem:[sqrt(x) < 2] here.");

    assert.equal(maths(html).length, 1);
    assert.match(html, /<msqrt>/);
    assert.doesNotMatch(html, /\\\$/);
});

test("AsciiDoc's asciimath:[…] renders inline math", async () => {
    const html = await adoc("Inline asciimath:[sum_(k=1)^n a_k] here.");

    assert.equal(maths(html).length, 1);
    assert.match(html, /<munderover>|<msubsup>/);
});

test("AsciiDoc's [stem] block reads LaTeX under :stem: latexmath, as a display block", async () => {
    const html = await adoc(
        ":stem: latexmath\n\n[stem]\n++++\n\\left( \\sum_{k=1}^n a_k \\right)^2 < x\n++++\n",
    );

    assert.match(
        html,
        new RegExp(`<div class="${CLASSES.mathDisplay}"><math display="block"`),
    );
    assert.doesNotMatch(html, /stemblock/);
});

test("AsciiDoc's [stem] block reads AsciiMath by default", async () => {
    const html = await adoc("[stem]\n++++\nsqrt(4) = 2\n++++\n");

    assert.equal(maths(html).length, 1);
    assert.match(html, /display="block"/);
    assert.match(html, /<msqrt>/);
});

test("AsciiDoc's [latexmath] block renders a display block", async () => {
    const html = await adoc("[latexmath]\n++++\nx^2\n++++\n");

    assert.match(html, /display="block"/);
});

test("AsciiDoc math that fails to parse stays as written, and the build warns", async () => {
    let inline = "";
    let block = "";
    const warnings = await stderrOf(async () => {
        inline = await adoc("Inline latexmath:[\\frac{4}{] here.");
        block = await adoc("[latexmath]\n++++\n\\left( z < 1\n++++\n");
    });

    assert.equal(maths(inline).length, 0);
    assert.match(inline, /<p>Inline \\frac\{4\}\{ here\.<\/p>/);
    assert.equal(maths(block).length, 0);
    assert.match(block, /<pre><code>\\left\( z &lt; 1<\/code><\/pre>/);
    assert.match(warnings, /\\frac\{4\}\{/);
    assert.match(warnings, /\\left\( z < 1/);
});
