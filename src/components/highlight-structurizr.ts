/**
 * PROTOTYPE (wayfinder ticket #334): a highlight.js grammar for Structurizr
 * DSL, written from Structurizr's DSL language reference.
 *
 * Token classes, picked from the colors `markdown-renderer.module.css`
 * already defines for both color schemes:
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
 */

import type { HLJSApi, Language } from "highlight.js";

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
    "shape",
    "icon",
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
    "style",
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

export default function structurizr(hljs: HLJSApi): Language {
    const SUBSTITUTION = {
        scope: "template-variable",
        begin: /\$\{/,
        end: /\}/,
    };

    return {
        name: "Structurizr DSL",
        aliases: ["structurizr-dsl", "c4", "dsl"],
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
            hljs.COMMENT(/^[ \t]*#(?![0-9a-f]{3,8}\b)/i, /$/),
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
            { scope: "number", match: /#[0-9a-f]{3,8}\b/i },
            { scope: "number", match: /\b\d+(?:\.\d+)?\b/ },
        ],
    };
}
