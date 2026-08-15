import { parseArgs } from "node:util";

export const OPTIONS = {
    logo: { type: "string" },
    "logo-alt": { type: "string", default: "" },
    "logo-href": { type: "string" },
    font: { type: "string" },
    "font-weights": { type: "string", default: "400,700" },
    "font-subsets": { type: "string", default: "latin" },
    "font-italic": { type: "boolean", default: false },
    "single-file": { type: "boolean", default: false },
    out: { type: "string", short: "o", default: "structurizr-output" },
    base: { type: "string", default: "" },
    help: { type: "boolean", short: "h", default: false },
};

const USAGE = `
Renderizr — render a Structurizr workspace as a static site.

  build <workspace.json|url> [options]

Options
  -o, --out <dir>          Output directory (default: structurizr-output)
      --single-file        Emit one self-contained .html with every asset inlined,
                           plus an artifact.html fragment for Claude artifacts
      --base <path>        Base public path for the multi-file build (default: "")

  --logo <path|url>        Image shown top-left in the header. Embedded as a data URI
  --logo-alt <text>        Alt text for the logo
  --logo-href <url>        Wrap the logo in a link

  --font <family>          Google Web Font family, e.g. "Inter" or "Source Sans 3".
                           Fetched at build time and embedded as woff2 data URIs.
                           Costs roughly 45-70KB gzipped
  --font-weights <list>    Comma-separated weights (default: 400,700). A variable
                           font covering the range is preferred when one exists
  --font-subsets <list>    Comma-separated subsets (default: latin)
  --font-italic            Also embed the italic faces (roughly doubles font weight)

  -h, --help               Show this message

Examples
  build ./workspace.json
  build https://example.com/workspace.json --single-file
  build ./workspace.json --single-file --font Inter --logo ./logo.svg
`;

export function usage(stream = process.stdout) {
    stream.write(`${USAGE.trimStart()}\n`);
}

/**
 * Parse the CLI arguments. Exits the process on `--help` or a usage error.
 */
export function parseCliArgs(args = process.argv.slice(2)) {
    let parsed;

    try {
        parsed = parseArgs({
            args,
            options: OPTIONS,
            allowPositionals: true,
            strict: true,
        });
    } catch (error) {
        process.stderr.write(`${error.message}\n\n`);
        usage(process.stderr);
        process.exit(1);
    }

    const { values, positionals } = parsed;

    if (values.help) {
        usage();
        process.exit(0);
    }

    if (positionals.length !== 1) {
        process.stderr.write(
            positionals.length
                ? `Expected one workspace, got ${positionals.length}: ${positionals.join(", ")}\n\n`
                : "Missing the workspace to render.\n\n",
        );
        usage(process.stderr);
        process.exit(1);
    }

    return {
        workspace: positionals[0],
        out: values.out,
        base: values.base,
        singleFile: values["single-file"],
        logo: values.logo
            ? {
                  source: values.logo,
                  alt: values["logo-alt"],
                  href: values["logo-href"],
              }
            : null,
        font: values.font
            ? {
                  family: values.font,
                  weights: values["font-weights"]
                      .split(",")
                      .map((weight) => weight.trim())
                      .filter(Boolean),
                  subsets: values["font-subsets"]
                      .split(",")
                      .map((subset) => subset.trim())
                      .filter(Boolean),
                  italic: values["font-italic"],
              }
            : null,
    };
}
