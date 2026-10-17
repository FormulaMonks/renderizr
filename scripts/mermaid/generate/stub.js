/**
 * Stand-ins for the parts of Mermaid core that the flowchart, ERD and
 * sequence db classes import but a reader that only parses never needs: the
 * config store, DOMPurify-based sanitizing, the shape renderer, d3 tooltips,
 * the logger and the sequence parser's color check. `plugins.js` points each
 * import at the matching export here. Label text stays raw, since the page
 * draws it as text and never as markup.
 *
 * The generator copies this file next to the entry before bundling, so the
 * path comments in the generated parser stay the same on every machine.
 */

/**
 * Mermaid's config as one diagram's source sets it. `click` links keep their
 * URL under `loose` (spec: Activation targets), whatever the source says.
 */
let config = {};

/** Replaces the config with one diagram's own, so nothing leaks between diagrams. */
export const useConfig = (next) => {
    config = { ...next, securityLevel: "loose" };
};
export const getConfig = () => config;
export const setConfig = (next) => {
    config = { ...config, ...next };
    return config;
};
export const defaultConfig = config;
export const evaluate = (v) => v === true || v === "true";
export const getEffectiveHtmlLabels = (c) =>
    evaluate(c.htmlLabels ?? c.flowchart?.htmlLabels ?? true);

/* ------------------------------------------------------------ common.ts */

export const lineBreakRegex = /<\/?br\s*\/?>/gi;
export const sanitizeText = (text) => text;
export const getRows = (s) =>
    s ? s.replace(lineBreakRegex, "\n").split("\n") : [""];
export const hasBreaks = (s) => /<\/?br\s*\/?>/i.test(s);
export const splitBreaks = (s) => s.split(lineBreakRegex);
export const parseGenericTypes = (s) => s;
export const common = {
    sanitizeText,
    getRows,
    hasBreaks,
    splitBreaks,
    lineBreakRegex,
    evaluate,
    parseGenericTypes,
};

/* ------------------------------------------------------------- utils.ts */

export const getEdgeId = (from, to, { counter = 0, prefix, suffix }, id) =>
    id ??
    `${prefix ? `${prefix}_` : ""}${from}_${to}_${counter}${suffix ? `_${suffix}` : ""}`;
const safeUrl = (url) =>
    /^\s*(javascript|data|vbscript):/i.test(url) ? "about:blank" : url;
export const utils = {
    formatUrl: (link, c) => {
        const url = link.trim();
        return url
            ? c.securityLevel === "loose"
                ? url
                : safeUrl(url)
            : undefined;
    },
    runFunc: () => {},
};

/* ------------------------------------------------------------ shapes.ts */

/** The renderer's shape table; the reader keeps every name and lets the build decide. */
export const isValidShape = (shape) => typeof shape === "string";

/* ------------------------------------- svgDrawCommon.ts and logger.ts */

export const createTooltip = () => ({});
export const log = {
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
};

/* ------------------------------------------------------ the color check */

/** CSS's named colors, which a sequence `box` or `rect` may name. */
const NAMED_COLORS = new Set(
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent".split(
        " ",
    ),
);

/**
 * The `window` the sequence db reads `CSS.supports` from: the build has no
 * browser, so a CSS color function, a hex color or a named color passes.
 * `plugins.js` injects it in place of the global.
 */
export const window = {
    CSS: {
        supports: (__, color) =>
            /^(?:(?:rgba?|hsla?)\s*\(|#[0-9a-f]{3,8}$)/i.test(color) ||
            NAMED_COLORS.has(String(color).toLowerCase()),
    },
};
