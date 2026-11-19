/**
 * A highlight.js grammar for Structurizr DSL, Renderizr's own, written from
 * Structurizr's DSL language reference. A fence selects it by one name only:
 * `structurizr` in Markdown and `[source,structurizr]` in AsciiDoc.
 *
 * Token classes, picked from the colors `markdown-renderer.module.css`
 * already defines for both color schemes, so the DSL adds no CSS:
 *
 * - `keyword`: `!` directives (`!include`, `!docs`, `!identifiers`, …) and
 *   the blocks that structure a workspace (`workspace`, `model`, `views`,
 *   `styles`, `group`, `properties`, …). The page draws `meta` in the
 *   comments' gray, which would hide the directives.
 * - `type`: element, relationship and view types (`person`,
 *   `softwareSystem`, `container`, `systemContext`, `dynamic`, …).
 * - `attr`: statements and style properties (`include`, `autoLayout`,
 *   `tags`, `shape`, `background`, …).
 * - `literal`: enumerated values (`Cylinder`, `Orthogonal`, `true`, `lr`).
 * - `title`: the identifier an `=` assigns.
 * - `operator`: `->` and `=`.
 * - `string`, with `${NAME}` substitution as `template-variable`, for
 *   `"…"` and `"""` text blocks.
 * - `number`: numbers and `#rrggbb` colors.
 * - `comment`: `//`, `#` at the start of a line, and `/* … *\/`.
 *
 * DSL keywords ignore case, and so does the grammar. A dotted identifier
 * (`internetBanking.api`) reads as one word, so a segment named like a
 * keyword stays plain.
 *
 * Known gaps, left as they are: a word that is both a type and a value takes
 * the type's color (`shape Person`); directive arguments and relationship
 * ends stay plain; `include *`, expressions and `!script` bodies stay plain;
 * a bare identifier that spells a keyword takes its color.
 */

const DIRECTIVES = [
    "!adrs",
    "!components",
    "!const",
    "!constant",
    "!decisions",
    "!docs",
    "!element",
    "!elements",
    "!extend",
    "!identifiers",
    "!impliedrelationships",
    "!include",
    "!plugin",
    "!ref",
    "!relationship",
    "!relationships",
    "!script",
    "!var",
];

const BLOCKS = [
    "workspace",
    "model",
    "archetypes",
    "group",
    "deploymentenvironment",
    "views",
    "styles",
    "configuration",
    "properties",
    "perspectives",
    "animation",
    "branding",
    "terminology",
    "users",
    "light",
    "dark",
];

const TYPES = [
    "person",
    "softwaresystem",
    "container",
    "component",
    "deploymentgroup",
    "deploymentnode",
    "infrastructurenode",
    "softwaresysteminstance",
    "containerinstance",
    "element",
    "relationship",
    "systemlandscape",
    "systemcontext",
    "filtered",
    "dynamic",
    "deployment",
    "custom",
    "image",
];

const STATEMENTS = [
    "include",
    "exclude",
    "autolayout",
    "default",
    "title",
    "name",
    "description",
    "technology",
    "tag",
    "tags",
    "url",
    "instances",
    "instanceof",
    "healthcheck",
    "theme",
    "themes",
    "scope",
    "visibility",
    "logo",
    "font",
    "plantuml",
    "mermaid",
    "kroki",
    // style properties
    "shape",
    "icon",
    "iconposition",
    "width",
    "height",
    "background",
    "color",
    "colour",
    "stroke",
    "strokewidth",
    "fontsize",
    "border",
    "opacity",
    "metadata",
    "thickness",
    "dashed",
    "style",
    "linestyle",
    "routing",
    "jump",
    "position",
];

const LITERALS = [
    "true",
    "false",
    // autoLayout directions
    "tb",
    "bt",
    "lr",
    "rl",
    // shapes
    "box",
    "roundedbox",
    "circle",
    "ellipse",
    "hexagon",
    "diamond",
    "cylinder",
    "bucket",
    "pipe",
    "robot",
    "folder",
    "webbrowser",
    "window",
    "terminal",
    "shell",
    "mobiledeviceportrait",
    "mobiledevicelandscape",
    // border, line style and routing
    "solid",
    "dashed",
    "dotted",
    "direct",
    "orthogonal",
    "curved",
    // !identifiers and configuration scope
    "flat",
    "hierarchical",
    "landscape",
    "none",
];

/**
 * The Structurizr DSL grammar, for `registerLanguage("structurizr", …)`.
 *
 * @param {import("highlight.js").HLJSApi} hljs
 * @returns {import("highlight.js").Language}
 */
export default function structurizr(hljs) {
    const SUBSTITUTION = {
        scope: "template-variable",
        begin: /\$\{/,
        end: /\}/,
    };

    return {
        name: "Structurizr DSL",
        case_insensitive: true,
        keywords: {
            $pattern: /!?[A-Za-z_][\w.-]*/,
            keyword: [...DIRECTIVES, ...BLOCKS],
            type: TYPES,
            attr: STATEMENTS,
            literal: LITERALS,
        },
        contains: [
            // `//` after a scheme (`!include https://…`) stays part of the URL.
            hljs.COMMENT(/(?<![:\w])\/\//, /$/),
            hljs.C_BLOCK_COMMENT_MODE,
            // `#` starts a comment only as a line's first character; after a
            // keyword it starts a color.
            hljs.COMMENT(/(?<=^[ \t]*)#(?![0-9a-f]{3,8}\b)/, /$/),
            {
                scope: "string",
                begin: /"""/,
                end: /"""/,
                contains: [SUBSTITUTION],
            },
            {
                scope: "string",
                begin: /"/,
                end: /"/,
                illegal: /\n/,
                contains: [hljs.BACKSLASH_ESCAPE, SUBSTITUTION],
            },
            // `customer = person …`: the identifier the line assigns.
            {
                match: [/^[ \t]*/, /[A-Za-z_][\w.-]*/, /[ \t]*/, /=(?!=)/],
                scope: { 2: "title", 4: "operator" },
            },
            { scope: "operator", match: /->/ },
            { scope: "number", match: /#[0-9a-f]{3,8}\b/ },
            { scope: "number", match: /\b\d+(?:\.\d+)?\b/ },
        ],
    };
}
