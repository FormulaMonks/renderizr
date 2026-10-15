// An esbuild plugin for the "vendor and trim" option: compiles the Jison grammars (jison-plugin.mjs) and points the
// db classes' imports of mermaid core, d3 and DOMPurify at stubs/mermaid-core.mjs, so only grammars, db classes and
// js-yaml (for the `A@{ shape: … }` node metadata) reach the bundle.
import { resolve } from "node:path";
import jison from "./jison-plugin.mjs";

const stub = JSON.stringify(
    resolve(import.meta.dirname, "stubs/mermaid-core.mjs"),
);
const modules = [
    [
        /diagram-api\/diagramAPI\.js$/,
        `export { getConfig, setConfig, defaultConfig } from ${stub};`,
    ],
    [
        /^\.\.\/\.\.\/config\.js$/,
        `export { getConfig, setConfig, defaultConfig, evaluate, getEffectiveHtmlLabels } from ${stub};`,
    ],
    [
        /common\/common\.js$/,
        `export * from ${stub}; export { common as default } from ${stub};`,
    ],
    [
        /^\.\.\/\.\.\/utils\.js$/,
        `export { getEdgeId, utils as default } from ${stub};`,
    ],
    [
        /rendering-elements\/shapes\.js$/,
        `export { isValidShape } from ${stub};`,
    ],
    [/common\/svgDrawCommon\.js$/, `export { createTooltip } from ${stub};`],
    [/logger\.js$/, `export { log } from ${stub};`],
    [
        /^d3$/,
        "const s = { select: () => s, selectAll: () => s, on: () => s, attr: () => s }; export const select = () => s;",
    ],
    [/^dompurify$/, "export default { sanitize: (s) => s, addHook() {} };"],
];

export default {
    name: "trim",
    setup(build) {
        jison.setup(build);
        build.onResolve({ filter: /.*/ }, ({ path, resolveDir }) => {
            if (!resolveDir.includes("mermaid-src")) return;
            const index = modules.findIndex(([re]) => re.test(path));
            if (index >= 0) return { path: String(index), namespace: "trim" };
        });
        build.onLoad({ filter: /.*/, namespace: "trim" }, ({ path }) => ({
            contents: modules[Number(path)][1],
            loader: "js",
            resolveDir: import.meta.dirname,
        }));
    },
};
