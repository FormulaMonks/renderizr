import { parseArgs } from "node:util";
import { DEFAULT_PORT, resolveSession, ToolsError } from "./edit.js";

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

  renderizr <workspace.json|url> [options]
  renderizr edit [path] [options]   Edit the layout of the views in a browser;
                                    renderizr edit --help lists its options

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
  renderizr ./workspace.json
  renderizr https://example.com/workspace.json --single-file
  renderizr ./workspace.json --single-file --font Inter --logo ./logo.svg

In a clone of this repository the same thing is: pnpm render <workspace> [options]
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
        ...branding(values),
    };
}

/** The logo and font the branding flags ask for, each `null` when not asked. */
function branding(values) {
    return {
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

/* -------------------------------------------------------------------- edit */

/** The branding flags, which `renderizr edit` takes as the build does. */
const BRANDING_OPTIONS = Object.fromEntries(
    Object.entries(OPTIONS).filter(
        ([name]) => name.startsWith("logo") || name.startsWith("font"),
    ),
);

export const EDIT_OPTIONS = {
    ...BRANDING_OPTIONS,
    port: { type: "string", default: String(DEFAULT_PORT) },
    "no-open": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
};

/**
 * The build's flags edit mode refuses, and why (spec 4.3): edit mode writes
 * no output and always runs the React Flow engine.
 */
const REFUSED_BY_EDIT = new Map([
    ["out", "edit mode writes no output"],
    ["single-file", "edit mode writes no output"],
    ["base", "edit mode writes no output"],
    ["engine", "edit mode always runs the React Flow engine"],
]);

const EDIT_USAGE = `
renderizr edit — edit the layout of a workspace's views in a browser.

  renderizr edit [path] [options]

The path is a workspace.dsl or a workspace.json, under any name, or a folder
holding one of them under exactly that name; without a path, edit mode opens
the current folder. Edit mode serves the site on a local server only this
machine reaches, and saves the layout into the workspace.json beside a DSL,
or into the workspace.json it opened.

A DSL runs through Structurizr's tools: the STRUCTURIZR_CLI environment
variable as a whole command (such as "java -jar structurizr.war"), otherwise
structurizr-cli on the PATH, with Java 21 to 25. Without them, edit mode opens
the workspace.json beside the DSL.

Options
      --port <n>           Port for the local server (default: ${DEFAULT_PORT}); the
                           next free one when it is taken
      --no-open            Print the URL without opening the browser

  --logo <path|url>        Image shown top-left in the header
  --logo-alt <text>        Alt text for the logo
  --logo-href <url>        Wrap the logo in a link
  --font <family>          Google Web Font family, e.g. "Inter"
  --font-weights <list>    Comma-separated weights (default: 400,700)
  --font-subsets <list>    Comma-separated subsets (default: latin)
  --font-italic            Also embed the italic faces

  -h, --help               Show this message

Examples
  renderizr edit
  renderizr edit ./architecture --font Inter
  STRUCTURIZR_CLI="java -jar structurizr.war" renderizr edit workspace.dsl
  renderizr edit ./big-bank.json --port 8080 --no-open
`;

export function editUsage(stream = process.stdout) {
    stream.write(`${EDIT_USAGE.trimStart()}\n`);
}

/** Print `message` and the edit usage to stderr, and exit 1. */
function editUsageError(message) {
    process.stderr.write(`${message}\n\n`);
    editUsage(process.stderr);
    process.exit(1);
}

/** The refused build flag `arg` spells, or `undefined`. */
function refusedFlag(arg) {
    if (arg === "-o" || /^-o./.test(arg)) return "out";
    const name = /^--([^=]+)/.exec(arg)?.[1];
    return name && REFUSED_BY_EDIT.has(name) ? name : undefined;
}

/**
 * Parse the arguments of `renderizr edit` (everything after `edit`) and
 * resolve the session its path opens, against `cwd`. Exits the process on
 * `--help` and on a usage error.
 */
export function parseEditArgs(args, { cwd = process.cwd() } = {}) {
    // Before `parseArgs`, which would only call these unknown.
    for (const arg of args) {
        if (arg === "--") break;
        const refused = refusedFlag(arg);
        if (refused) {
            editUsageError(
                `renderizr edit doesn't take --${refused}: ${REFUSED_BY_EDIT.get(refused)}.`,
            );
        }
    }

    let parsed;
    try {
        parsed = parseArgs({
            args,
            options: EDIT_OPTIONS,
            allowPositionals: true,
            strict: true,
        });
    } catch (error) {
        editUsageError(error.message);
    }

    const { values, positionals } = parsed;

    if (values.help) {
        editUsage();
        process.exit(0);
    }

    if (positionals.length > 1) {
        editUsageError(
            `Expected one path, got ${positionals.length}: ${positionals.join(", ")}`,
        );
    }

    const port = Number(values.port);
    if (!/^\d+$/.test(values.port) || port < 1 || port > 65535) {
        editUsageError(
            `--port takes a port number from 1 to 65535, got "${values.port}".`,
        );
    }

    let session;
    try {
        session = resolveSession(positionals[0], { cwd });
    } catch (error) {
        // Missing tools aren't a mistake in the arguments.
        if (error instanceof ToolsError) {
            process.stderr.write(`${error.message}\n`);
            process.exit(1);
        }
        editUsageError(error.message);
    }

    return {
        session,
        port,
        open: !values["no-open"],
        ...branding(values),
    };
}
