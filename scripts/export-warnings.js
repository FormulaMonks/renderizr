/**
 * What `renderizr export` tells the author it could not draw as asked
 * (ADR 32): characters the run's faces lack, families a Mermaid source
 * names that the CLI cannot load, and a font it cannot fetch. Each reads
 * the SVG the serializer wrote, so it sees exactly what the PNG draws.
 *
 * A warning leaves the view written and the exit status alone; only the
 * font fetch fails the run.
 */

/** `text` with the entities `escapeXml` writes, and numeric ones, decoded. */
const decodeXml = (text) =>
    text.replace(/&(amp|lt|gt|quot|apos|#x[\da-f]+|#\d+);/gi, (_, name) => {
        const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
        if (named[name.toLowerCase()]) return named[name.toLowerCase()];
        return String.fromCodePoint(
            name[1].toLowerCase() === "x"
                ? Number.parseInt(name.slice(2), 16)
                : Number(name.slice(1)),
        );
    });

/**
 * The text `svg` draws: each `<text>` element's content, decoded, one per
 * line. The `<title>` and the `<style>` draw nothing.
 */
export const drawnText = (svg) =>
    [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
        .map(([, content]) => decodeXml(withoutTags(content)))
        .join("\n");

/**
 * `markup` with every tag removed, stripping again until none is left, so
 * tags nested inside a broken tag (`<sc<b>ript>`) go too.
 */
function withoutTags(markup) {
    let text = markup;
    for (;;) {
        const stripped = text.replace(/<[^<>]*>/g, "");
        if (stripped === text) return text;
        text = stripped;
    }
}

/** The family names a CSS `font-family` list holds, unquoted, in order. */
const familyNames = (list) =>
    list
        .split(",")
        .map((name) => name.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);

/** The fallback stack's families, which Arimo measures and draws alike. */
const STAND_IN_FOR = ["helvetica", "arial", "sans-serif"];

/**
 * The families `svg` draws text in that the run cannot load, each once:
 * the first family of each `font-family` it names, when that is neither
 * `family`, the run's font, nor, while Arimo stands in (`standIn`), a family
 * of the fallback stack. The text measures and draws in `family` instead.
 */
export function unloadableFamilies(svg, { family, standIn }) {
    const loadable = new Set([
        family.toLowerCase(),
        ...(standIn ? STAND_IN_FOR : []),
    ]);
    const named = [...svg.matchAll(/\sfont-family="([^"]*)"/g)]
        .map(([, list]) => familyNames(decodeXml(list))[0])
        .filter((name) => name && !loadable.has(name.toLowerCase()));
    return [...new Set(named)];
}

/**
 * The `[low, high]` code point pairs of a CSS `unicode-range`; `U+4??`
 * spans U+400 to U+4FF.
 */
const rangePairs = (range) =>
    range.split(",").map((part) => {
        const [low, high] = part.trim().replace(/^U\+/i, "").split("-");
        return high
            ? [Number.parseInt(low, 16), Number.parseInt(high, 16)]
            : [
                  Number.parseInt(low.replace(/\?/g, "0"), 16),
                  Number.parseInt(low.replace(/\?/g, "F"), 16),
              ];
    });

/**
 * Which subsets of the family hold `characters`: `ranges` maps each subset
 * Google Fonts serves to its `unicode-range` (null when it declares none),
 * and `subsets` are the run's. A subset the run already fetched is no
 * suggestion, since its face lacks them. `uncovered` are the characters no
 * other subset holds.
 */
export function subsetsCovering(characters, ranges, subsets) {
    const others = Object.entries(ranges)
        .filter(([subset, range]) => range && !subsets.includes(subset))
        .map(([subset, range]) => ({ subset, pairs: rangePairs(range) }));
    const found = new Set();
    const uncovered = [];
    for (const character of characters) {
        const point = character.codePointAt(0);
        const holding = others.filter(({ pairs }) =>
            pairs.some(([low, high]) => point >= low && point <= high),
        );
        if (holding.length) found.add(holding[0].subset);
        else uncovered.push(character);
    }
    return {
        subsets: others.map(({ subset }) => subset).filter((s) => found.has(s)),
        uncovered,
    };
}

/** A character as a reader can see it: marks, controls and spaces by code point. */
const shown = (character) =>
    /^[\p{M}\p{C}\p{Z}]$/u.test(character)
        ? `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`
        : character;

const listed = (characters) => characters.map(shown).join(" ");

/** `items` joined as prose: `A`, `A and B`, `A, B and C`. */
export const prose = (items) =>
    items.length < 2
        ? items.join("")
        : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** The start of a view's warning: which view of which workspace. */
const viewOf = ({ view, workspace }) =>
    `warning: view ${view}${workspace ? ` of ${workspace}` : ""}:`;

/**
 * The warning for the `missing` characters that view `view` of `workspace`
 * draws and no face of `family` has. resvg draws them in a system font;
 * fontkit measured them with the font's missing glyph. It suggests the
 * subsets of the family that hold them (`ranges`, beyond the run's
 * `subsets`), and another family for the rest.
 */
export function glyphWarning({
    view,
    workspace,
    family,
    missing,
    ranges,
    subsets,
}) {
    const covering = subsetsCovering(missing, ranges, subsets);
    const flag = `--font-subsets ${[...subsets, ...covering.subsets].join(",")}`;
    const head = `${viewOf({ view, workspace })} ${family} has no glyph for ${listed(missing)}, which draw in a system font.`;
    if (!covering.subsets.length)
        return `${head} Choose a family that has them with --font <family>.`;
    if (!covering.uncovered.length) return `${head} Add ${flag} to fetch them.`;
    const fetched = missing.filter((c) => !covering.uncovered.includes(c));
    return `${head} Add ${flag} to fetch ${listed(fetched)}, and choose a family that has ${listed(covering.uncovered)} with --font <family>.`;
}

/**
 * The warning for the `families` view `view` of `workspace` names (in its
 * Mermaid source) that the run cannot load: its text measures and draws
 * in `family`.
 */
export const familyWarning = ({ view, workspace, family, families }) =>
    `${viewOf({ view, workspace })} the export cannot load ${prose(families)}, so the text measures and draws in ${family}.`;

/**
 * The error that fails the run when fetching `font` could not reach Google
 * Fonts (the cache was cold and the network is down), or null for any other
 * error, which passes as it is. `standIn` says Arimo stands in because no
 * font is set.
 */
export function offlineError(font, error, { standIn }) {
    if (!(error instanceof TypeError) || error.message !== "fetch failed")
        return null;
    const reason = error.cause?.code ?? error.cause?.message ?? error.message;
    const what = standIn
        ? `measures the text in ${font.family} when no font is set, and fetches it from Google Fonts`
        : `fetches the font ${font.family} from Google Fonts`;
    return new Error(
        `renderizr export ${what}, and could not reach it (${reason}). Connect to the network and run it again.`,
        { cause: error },
    );
}
