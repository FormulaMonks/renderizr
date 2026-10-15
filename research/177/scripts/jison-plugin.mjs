// An esbuild plugin that compiles .jison grammars the way mermaid's own build does (.build/jisonTransformer.ts).
import { readFile } from "node:fs/promises";
import jison from "jison";

export default {
    name: "jison",
    setup(build) {
        // mermaid's build turns config.schema.yaml into its default config; the published package's defaults stand in.
        build.onResolve(
            { filter: /config\.schema\.yaml\?only-defaults=true$/ },
            () => ({ path: "defaults", namespace: "mermaid-defaults" }),
        );
        build.onLoad(
            { filter: /.*/, namespace: "mermaid-defaults" },
            async () => {
                const { default: mermaid } = await import("mermaid");
                return {
                    contents: JSON.stringify(mermaid.mermaidAPI.defaultConfig),
                    loader: "json",
                };
            },
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
    },
};
