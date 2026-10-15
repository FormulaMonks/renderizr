// Stand-ins for the parts of mermaid core that the three db classes import but a parse-only reader does not need:
// the config store and its themes, DOMPurify-based sanitizing, the shape renderer, d3 tooltips and the logger.
// trim-plugin.mjs points each import at the matching export here. Label text stays raw; React escapes it on render.

let config = { securityLevel: "strict", flowchart: {}, er: {}, sequence: {} };
export const getConfig = () => config;
export const setConfig = (next) => {
    config = { ...config, ...next };
    return config;
};
export const defaultConfig = config;
export const evaluate = (v) => v === true || v === "true";
export const getEffectiveHtmlLabels = (c) =>
    evaluate(c.htmlLabels ?? c.flowchart?.htmlLabels ?? true);

// common.ts
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

// utils.ts
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

// shapes.ts: the renderer's shape table; a real trim keeps the list of names.
export const isValidShape = (shape) => typeof shape === "string";

// svgDrawCommon.ts and logger.ts
export const createTooltip = () => ({});
export const log = {
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
};
