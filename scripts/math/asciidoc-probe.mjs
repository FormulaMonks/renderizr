// PROTOTYPE (#332): how AsciiDoc's stem reaches the build through asciidoctor.js.
import { ConverterFactory, Html5Converter, convert } from "@asciidoctor/core";
import { readFileSync } from "node:fs";
import temml from "temml";

const workspace = JSON.parse(
    readFileSync("test/__fixtures__/github-formatting.json", "utf8"),
);
const section = workspace.documentation.sections.find((s) =>
    s.filename.endsWith(".adoc"),
);
const content = section.content;
const math = `:stem: latexmath\n\n${content.slice(content.indexOf("== Math"), content.indexOf("== Footnotes"))}`;

console.log("--- as asciidoctor.js converts it");
console.log(await convert(math));

// A converter that renders stem itself rather than leave it for MathJax.
class MathConverter extends Html5Converter {
    async convert_inline_quoted(node) {
        if (["latexmath", "asciimath"].includes(node.getType())) {
            return temml.renderToString(String(await node.getText()), {
                throwOnError: false,
            });
        }
        return super.convert_inline_quoted(node);
    }
    async convert_stem(node) {
        const tex = String(await node.getContent());
        return `<div class="stemblock"><span class="math-display">${temml.renderToString(tex, { displayMode: true, throwOnError: false })}</span></div>`;
    }
}
ConverterFactory.register(new MathConverter("html5"), "html5");
console.log("--- with a converter that renders stem");
console.log(await convert(math));
console.log("--- asciimath, the default stem, through the same converter");
console.log(await convert(":stem:\n\nstem:[sqrt(4) = 2]"));

// AsciiMath, AsciiDoc's default stem, through AsciiMath to LaTeX, then Temml.
const { default: AsciiMathParser } = await import("asciimath2tex");
const asciimath = new AsciiMathParser();
for (const source of [
    "sqrt(4) = 2",
    "sum_(k=1)^n a_k b_k",
    "x^2 + y^2 = r^2",
    "f'(x) = lim_(h->0) (f(x+h)-f(x))/h",
]) {
    const tex = asciimath.parse(source);
    console.log(
        `asciimath ${JSON.stringify(source)} -> ${tex} -> ${temml.renderToString(tex).length} bytes of MathML`,
    );
}
