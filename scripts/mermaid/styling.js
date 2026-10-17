/**
 * The build's half of a Mermaid diagram's styling (spec: Styling): the
 * palette its `theme` and `themeVariables` give, derived with Mermaid's own
 * theme code so the page carries none of it, and the entries of the
 * ignored-styling warning for what of its config and CSS Renderizr leaves
 * out. The page layers the palette and the source's CSS over the
 * workspace's styles (`src/model/mermaid-styles.ts`).
 */

import { themes } from "./parser.js";

/** The CSS a node, a subgraph or a `classDef` may set. */
export const NODE_CSS = new Set([
    "fill",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "color",
    "font-size",
    "font-weight",
    "font-family",
]);

/** The CSS a `linkStyle` may set. */
export const EDGE_CSS = new Set([
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "color",
]);

/**
 * The theme variables a source may set. The attribute rows' colors are for
 * ERDs, which read them from the same palette.
 */
export const THEME_VARIABLES = new Set([
    "primaryColor",
    "primaryBorderColor",
    "primaryTextColor",
    "lineColor",
    "edgeLabelBackground",
    "clusterBkg",
    "clusterBorder",
    "attributeBackgroundColorOdd",
    "attributeBackgroundColorEven",
    "rowOdd",
    "rowEven",
    "fontSize",
    "fontFamily",
    // Mermaid's own switch between its light and dark derivations.
    "darkMode",
]);

/** The named themes whose palette is a dark one. */
const DARK_THEMES = new Set([
    "dark",
    "neo-dark",
    "redux-dark",
    "redux-dark-color",
]);

/** Mermaid's theme when a source names none. */
const DEFAULT_THEME = "default";

/** The property names of `declarations` (`["fill:#f00", …]`). */
const propertiesOf = (declarations) =>
    (declarations ?? [])
        .map((declaration) => String(declaration).split(":")[0].trim())
        .filter(Boolean);

/** Adds each property of `declarations` outside `honored` to `ignored`. */
export function checkCss(declarations, honored, ignored) {
    for (const property of propertiesOf(declarations))
        if (!honored.has(property)) ignored.add(property);
}

/**
 * Adds each property of a `linkStyle` outside the edge list to `ignored`.
 * `fill:none`, which Mermaid's own examples and Structurizr's export write
 * on every link, says what Renderizr draws anyway.
 */
export function checkEdgeCss(declarations, ignored) {
    checkCss(
        (declarations ?? []).filter(
            (d) => !/^\s*fill\s*:\s*(none|transparent)\s*$/i.test(d),
        ),
        EDGE_CSS,
        ignored,
    );
}

/** A `fontSize` theme variable in Mermaid's px, or `undefined`. */
function pixels(value) {
    if (typeof value === "number") return value > 0 ? value : undefined;
    const match = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/.exec(String(value ?? ""));
    return match ? Number(match[1]) : undefined;
}

/**
 * The theme variables a sequence diagram's colors come from (spec: Sequence
 * diagrams), in the palette under these names.
 */
export const SEQUENCE_COLORS = [
    "actorBkg",
    "actorBorder",
    "actorTextColor",
    "actorLineColor",
    "signalColor",
    "signalTextColor",
    "noteBkgColor",
    "noteBorderColor",
    "noteTextColor",
    "labelBoxBkgColor",
    "labelBoxBorderColor",
    "labelTextColor",
    "loopTextColor",
    "activationBkgColor",
    "activationBorderColor",
    "sequenceNumberColor",
    "rectBkgColor",
];

/**
 * The theme variables a sequence diagram's source may set: its colors, the
 * ones Mermaid derives them from, and the font.
 */
const SEQUENCE_VARIABLES = new Set([
    ...SEQUENCE_COLORS,
    "primaryColor",
    "primaryBorderColor",
    "primaryTextColor",
    "fontSize",
    "fontFamily",
    "darkMode",
]);

/** The themes whose participants each take colors of their own, by participant order. */
const COLOR_THEMES = new Set(["redux-color", "redux-dark-color"]);

/**
 * The theme `config` names (Mermaid's default when none) with the
 * variables Mermaid's theme code derives from the ones in `honoredList` it
 * sets; `undefined` for a silent source, which sets no `theme` and no
 * `themeVariables`. Adds to `ignored` what of the config Renderizr leaves
 * out: an unknown theme, theme variables outside the list, `look`,
 * `htmlLabels`, `layout: elk`, every `elk` key, and theme colors Mermaid's
 * theme code can't read, which leave the source silent.
 */
function readTheme(config, honoredList, ignored) {
    const { theme, themeVariables } = config;
    const named = typeof theme === "string" && Object.hasOwn(themes, theme);
    if (theme !== undefined && !named) ignored.add(`theme "${theme}"`);
    const set =
        themeVariables && typeof themeVariables === "object"
            ? themeVariables
            : {};
    const honored = {};
    for (const [name, value] of Object.entries(set)) {
        if (honoredList.has(name)) honored[name] = value;
        else ignored.add(name);
    }
    if (config.look !== undefined && config.look !== "classic")
        ignored.add("look");
    if (
        config.htmlLabels !== undefined ||
        config.flowchart?.htmlLabels !== undefined
    )
        ignored.add("htmlLabels");
    if (config.layout === "elk") ignored.add("layout: elk");
    if (config.elk && typeof config.elk === "object")
        for (const key of Object.keys(config.elk)) ignored.add(`elk.${key}`);

    if (theme === undefined && themeVariables === undefined) return undefined;
    const name = named ? theme : DEFAULT_THEME;
    let v;
    try {
        v = themes[name].getThemeVariables(honored);
    } catch {
        // A color Mermaid's theme code can't read is cosmetic: the source
        // draws the silent look and warns.
        ignored.add("theme colors");
        return undefined;
    }
    const fontSize = pixels(honored.fontSize);
    const fontFamily =
        typeof honored.fontFamily === "string" && honored.fontFamily.trim()
            ? honored.fontFamily.trim()
            : undefined;
    return {
        name,
        honored,
        v,
        dark: DARK_THEMES.has(name) || v.darkMode === true,
        font: {
            ...(fontSize !== undefined && { fontSize }),
            ...(fontFamily !== undefined && { fontFamily }),
        },
    };
}

/**
 * The palette `config` gives, from the theme it names (Mermaid's default
 * when none) and the honored theme variables it sets; `undefined` for a
 * silent source, which sets neither. Adds to `ignored` what of the config
 * Renderizr leaves out: an unknown theme, theme variables outside the list,
 * `look`, `htmlLabels`, `layout: elk` and every `elk` key.
 */
export function readPalette(config, ignored) {
    const theme = readTheme(config, THEME_VARIABLES, ignored);
    if (!theme) return undefined;
    const { honored, v } = theme;
    // An ERD's rows take a tint of the entity's fill unless the source sets
    // their colors: `rowOdd` and `rowEven`, or their older names.
    const odd = honored.rowOdd ?? honored.attributeBackgroundColorOdd;
    const even = honored.rowEven ?? honored.attributeBackgroundColorEven;
    return {
        dark: theme.dark,
        node: {
            background: v.mainBkg,
            stroke: v.nodeBorder,
            // Mermaid draws a node's text in `nodeTextColor`, then `textColor`;
            // a `primaryTextColor` the source sets is what it asks for.
            color: honored.primaryTextColor ?? v.nodeTextColor ?? v.textColor,
        },
        edge: {
            color: v.lineColor,
            labelColor: v.textColor,
            labelBackground: v.edgeLabelBackground,
        },
        group: {
            background: v.clusterBkg,
            stroke: v.clusterBorder,
            color: v.titleColor,
        },
        ...((odd !== undefined || even !== undefined) && {
            rows: {
                ...(odd !== undefined && { odd: String(odd) }),
                ...(even !== undefined && { even: String(even) }),
            },
        }),
        ...theme.font,
    };
}

/** The color a theme's per-participant `colors` give the participant at `index`, cycling. */
const nth = (colors, index) =>
    Array.isArray(colors) && colors.length
        ? String(colors[index % colors.length]).trim()
        : undefined;

/**
 * A sequence diagram's palette (spec: Sequence diagrams): the sequence
 * colors its `theme` and `themeVariables` give, and under `redux-color` or
 * `redux-dark-color` each of its `count` participants' own fill and
 * border, as Mermaid assigns them by participant order; `undefined` for a
 * silent source, which never takes them. Adds to `ignored` what
 * `readPalette` does, plus the sequence settings Renderizr leaves out:
 * `curve`, each `sequence.*FontSize` and `sequence.*FontFamily`, and
 * `messageMargin`.
 */
export function readSequencePalette(config, count, ignored) {
    const theme = readTheme(config, SEQUENCE_VARIABLES, ignored);
    const sequence =
        config.sequence && typeof config.sequence === "object"
            ? config.sequence
            : {};
    if (config.curve !== undefined || sequence.curve !== undefined)
        ignored.add("curve");
    for (const key of Object.keys(sequence))
        if (/Font(Size|Family)$/.test(key)) ignored.add(`sequence.${key}`);
    if (sequence.messageMargin !== undefined) ignored.add("messageMargin");
    if (!theme) return undefined;
    const { v } = theme;
    const participants = COLOR_THEMES.has(theme.name)
        ? Array.from({ length: count }, (_, i) => {
              const background = nth(v.bkgColorArray, i);
              const stroke = nth(v.borderColorArray, i);
              return {
                  ...(background && { background }),
                  ...(stroke && { stroke }),
              };
          })
        : undefined;
    return {
        dark: theme.dark,
        colors: Object.fromEntries(
            SEQUENCE_COLORS.map((name) => [name, String(v[name])]),
        ),
        ...(participants && { participants }),
        ...theme.font,
    };
}
