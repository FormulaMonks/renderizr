import assert from "node:assert/strict";
import { test } from "node:test";
import {
    drawnText,
    familyWarning,
    glyphWarning,
    offlineError,
    subsetsCovering,
    unloadableFamilies,
} from "./warnings.js";

const SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif">',
    "<title>Not drawn: ✓</title>",
    "<style>@font-face { font-family: 'Inter'; }</style>",
    '<text x="1" y="2">Tom &amp; Jerry &lt;3</text>',
    '<text x="1" y="3" font-family="Georgia, Helvetica, Arial, sans-serif">Привет</text>',
    "</svg>",
].join("");

test("the drawn text is every <text> element's content, decoded, and nothing from the title or the style", () => {
    assert.equal(drawnText(SVG), "Tom & Jerry <3\nПривет");
});

test("a family the run cannot load is the first family a font-family names, other than the run's", () => {
    assert.deepEqual(
        unloadableFamilies(SVG, { family: "Arimo", standIn: true }),
        ["Georgia"],
    );
    assert.deepEqual(
        unloadableFamilies(
            '<svg font-family="&quot;Inter&quot;, Helvetica, Arial, sans-serif"><text font-family="&quot;Courier New&quot;, &quot;Inter&quot;, Helvetica">a</text><text font-family="inter, Helvetica">b</text></svg>',
            { family: "Inter", standIn: false },
        ),
        ["Courier New"],
    );
});

test("Helvetica and Arial load when Arimo stands in for them, and not beside another font", () => {
    const svg = '<svg font-family="Arial, Helvetica, sans-serif"></svg>';
    assert.deepEqual(
        unloadableFamilies(svg, { family: "Arimo", standIn: true }),
        [],
    );
    assert.deepEqual(
        unloadableFamilies(svg, { family: "Inter", standIn: false }),
        ["Arial"],
    );
});

const RANGES = {
    latin: "U+0000-00FF, U+0131",
    cyrillic: "U+0301, U+0400-045F, U+0490-0491",
    greek: "U+0370-03FF",
    vietnamese: null,
};

test("the subsets that cover characters are the run's missing ones whose unicode-range holds them", () => {
    assert.deepEqual(subsetsCovering(["П", "Ω"], RANGES, ["latin"]), {
        subsets: ["cyrillic", "greek"],
        uncovered: [],
    });
    assert.deepEqual(subsetsCovering(["П", "日"], RANGES, ["latin"]), {
        subsets: ["cyrillic"],
        uncovered: ["日"],
    });
    // A subset the run already has is no suggestion: its face lacks them.
    assert.deepEqual(subsetsCovering(["é"], RANGES, ["latin"]), {
        subsets: [],
        uncovered: ["é"],
    });
});

const VIEW = { view: "Containers", workspace: "Shop", family: "Arimo" };

test("the missing-glyph warning names the workspace, the view and the characters, and suggests --font-subsets", () => {
    assert.equal(
        glyphWarning({
            ...VIEW,
            missing: ["П", "р"],
            ranges: RANGES,
            subsets: ["latin"],
        }),
        "warning: view Containers of Shop: Arimo has no glyph for П р, which draw in a system font. Add --font-subsets latin,cyrillic to fetch them.",
    );
});

test("the missing-glyph warning suggests --font when no subset of the family has them", () => {
    assert.equal(
        glyphWarning({
            ...VIEW,
            missing: ["日"],
            ranges: RANGES,
            subsets: ["latin"],
        }),
        "warning: view Containers of Shop: Arimo has no glyph for 日, which draw in a system font. Choose a family that has them with --font <family>.",
    );
});

test("the missing-glyph warning gives both suggestions when a subset has only some of them", () => {
    assert.equal(
        glyphWarning({
            ...VIEW,
            missing: ["П", "日"],
            ranges: RANGES,
            subsets: ["latin"],
        }),
        "warning: view Containers of Shop: Arimo has no glyph for П 日, which draw in a system font. Add --font-subsets latin,cyrillic to fetch П, and choose a family that has 日 with --font <family>.",
    );
});

test("the missing-glyph warning spells out characters that do not show, and leaves out a workspace with no name", () => {
    assert.match(
        glyphWarning({
            ...VIEW,
            workspace: undefined,
            missing: ["‍", "́"],
            ranges: {},
            subsets: ["latin"],
        }),
        /^warning: view Containers: Arimo has no glyph for U\+200D U\+0301,/,
    );
});

test("the Mermaid font warning names the families and the font the view draws in", () => {
    assert.equal(
        familyWarning({ ...VIEW, families: ["Georgia", "Courier New"] }),
        "warning: view Containers of Shop: the export cannot load Georgia and Courier New, so the text measures and draws in Arimo.",
    );
});

test("a font fetch that cannot reach the network fails the run with a message naming the font and Google Fonts", () => {
    const unreachable = new TypeError("fetch failed", {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), {
            code: "ENOTFOUND",
        }),
    });
    assert.equal(
        offlineError({ family: "Inter" }, unreachable, { standIn: false })
            .message,
        "renderizr export fetches the font Inter from Google Fonts, and could not reach it (ENOTFOUND). Connect to the network and run it again.",
    );
    assert.match(
        offlineError({ family: "Arimo" }, unreachable, { standIn: true })
            .message,
        /^renderizr export measures the text in Arimo when no font is set, and fetches it from Google Fonts/,
    );
});

test("other font errors pass as they are", () => {
    assert.equal(
        offlineError({ family: "Nope" }, new Error("no family"), {
            standIn: false,
        }),
        null,
    );
    assert.equal(
        offlineError(
            { family: "Inter" },
            new TypeError("x is not a function"),
            { standIn: false },
        ),
        null,
    );
});

test("drawnText strips tags left behind by stripping a broken tag", () => {
    assert.equal(drawnText("<svg><text>a<sc<b>ript>b</text></svg>"), "ab");
});

test("drawnText keeps a numeric reference past the last code point as written", () => {
    assert.equal(
        drawnText("<svg><text>a &#99999999; &#x110000; b</text></svg>"),
        "a &#99999999; &#x110000; b",
    );
});
