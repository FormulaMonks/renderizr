/**
 * The esbuild plugin that cuts Mermaid's grammars and db classes loose from
 * Mermaid core (ADR 24): it compiles the Jison grammars the way Mermaid's own
 * build does (`.build/jisonTransformer.ts`), stands in Mermaid's default
 * config for the schema Mermaid's build turns into one, and points the db
 * classes' imports of Mermaid core, d3 and DOMPurify at `stub.js`. Only the
 * grammars, the db classes, the themes, js-yaml and khroma reach the parser.
 *
 * `jison` and `defaultConfig` come from the generator's own install, never
 * from Renderizr's dependencies.
 */

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The plugin, with the stub's path, the Jison generator and Mermaid's
 * published default config handed in by the generator.
 */
export function trim({ stub, jison, defaultConfig }) {
    const from = JSON.stringify(stub);
    const modules = [
        [
            /diagram-api\/diagramAPI\.js$/,
            `export { getConfig, setConfig, defaultConfig } from ${from};`,
        ],
        [
            /^\.\.\/\.\.\/config\.js$/,
            `export { getConfig, setConfig, defaultConfig, evaluate, getEffectiveHtmlLabels } from ${from};`,
        ],
        [
            /common\/common\.js$/,
            `export * from ${from}; export { common as default } from ${from};`,
        ],
        [
            /^\.\.\/\.\.\/utils\.js$/,
            `export { getEdgeId, utils as default } from ${from};`,
        ],
        [
            /rendering-elements\/shapes\.js$/,
            `export { isValidShape } from ${from};`,
        ],
        [
            /common\/svgDrawCommon\.js$/,
            `export { createTooltip } from ${from};`,
        ],
        [/logger\.js$/, `export { log } from ${from};`],
        [
            /^d3$/,
            "const s = { select: () => s, selectAll: () => s, on: () => s, attr: () => s }; export const select = () => s;",
        ],
        [/^dompurify$/, "export default { sanitize: (s) => s, addHook() {} };"],
    ];

    return {
        name: "renderizr-mermaid-trim",
        setup(build) {
            build.onResolve(
                { filter: /config\.schema\.yaml\?only-defaults=true$/ },
                () => ({ path: "defaults", namespace: "mermaid-defaults" }),
            );
            build.onLoad(
                { filter: /.*/, namespace: "mermaid-defaults" },
                () => ({
                    contents: JSON.stringify(defaultConfig),
                    loader: "json",
                }),
            );
            build.onLoad({ filter: /\.jison$/ }, async ({ path }) => {
                const generator = new jison.Generator(
                    await readFile(path, "utf8"),
                    { moduleType: "js", "token-stack": true },
                );
                const source = generator.generate({ moduleMain: "() => {}" });
                return {
                    contents: `${source}\nparser.parser = parser;\nexport { parser };\nexport default parser;`,
                    loader: "js",
                };
            });
            build.onResolve({ filter: /.*/ }, ({ path, resolveDir }) => {
                if (!resolveDir.includes("/mermaid/packages/")) return;
                const index = modules.findIndex(([re]) => re.test(path));
                if (index >= 0)
                    return { path: String(index), namespace: "trim" };
            });
            build.onLoad({ filter: /.*/, namespace: "trim" }, ({ path }) => ({
                contents: modules[Number(path)][1],
                loader: "js",
                resolveDir: dirname(stub),
            }));
        },
    };
}
