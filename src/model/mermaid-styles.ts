/**
 * How a Mermaid diagram's nodes, edges and subgraphs are styled (spec:
 * Styling), as layers merged from the least specific to the most:
 *
 * 1. the scheme defaults every view starts from;
 * 2. Mermaid's own defaults: a silent source's primary color fill and
 *    Orthogonal routing, and text sized the way Mermaid sizes it;
 * 3. the workspace's tag styles, themes included, for the implied tags:
 *    `Element` and `Mermaid` on a node, `Relationship` and `Mermaid` on an
 *    edge, `Group` and `Mermaid` on a subgraph;
 * 4. the source's config: the palette its `theme` and `themeVariables`
 *    give (the build derives it), its `curve` and its `fontSize`;
 * 5. its classes: `classDef default`, then each class the item takes;
 * 6. its own `style` or `linkStyle`.
 *
 * The source's shapes and arrow syntax always win, whatever a layer says.
 * A source palette that isn't a dark one keeps its fills in dark mode, but
 * what draws straight on the canvas, the edges and their labels, follows
 * the scheme.
 */

import type { ResolvedMermaid } from "./mermaid";
import {
    type ElementStyle,
    explicitElementStyle,
    explicitRelationshipStyle,
    findElementStyle,
    findRelationshipStyle,
    findTaggedGroupStyle,
    type RelationshipStyle,
    shadeColor,
} from "./styles";
import type {
    ColorScheme,
    MermaidConfig,
    MermaidDiagram,
    MermaidEdge,
    MermaidNode,
    MermaidSequence,
    MermaidSource,
    MermaidSubgraph,
} from "./types";
import type { WorkspaceModel } from "./workspace";

/** The tags a Mermaid node implies. */
export const MERMAID_NODE_TAGS = ["Element", "Mermaid"];
/** The tags a Mermaid edge implies. */
export const MERMAID_EDGE_TAGS = ["Relationship", "Mermaid"];
/** The tags a Mermaid subgraph implies. */
export const MERMAID_GROUP_TAGS = ["Group", "Mermaid"];

/**
 * A node's font size: the size whose name, drawn 1.4 times as large
 * (`NAME_SCALE`), comes out at Mermaid's 16 px scaled by 1.5. The
 * workspace's `fontSize` overrides it.
 */
export const MERMAID_FONT_SIZE = 17;

/** The size Mermaid draws text at, in its own px. */
const MERMAID_TEXT_PX = 16;

/** A size in Mermaid's px as a Renderizr font size, so 16 px is `MERMAID_FONT_SIZE`. */
export const mermaidFontSize = (px: number) =>
    (px * MERMAID_FONT_SIZE) / MERMAID_TEXT_PX;

/** The page's own primary color per scheme, in `src/main.css`, when the build names none. */
export const PAGE_PRIMARY_COLORS: Record<ColorScheme, string> = {
    Light: "#145b9e",
    Dark: "#1168bd",
};

/**
 * The primary color of the workspace the reader entered last in a set
 * (ADR 26); `undefined` until the page enters one, which keeps the build's.
 */
let enteredPrimaryColor: string | null | undefined;

/** Fill silent Mermaid sources with the entered workspace's `color`. */
export function setMermaidPrimaryColor(color: string | null) {
    enteredPrimaryColor = color;
}

/**
 * The branding's primary color (`--primary-color`, then
 * `renderizr.primaryColor`), else the page's default for `scheme`. Export
 * draws it as a literal, so it can't be read from the stylesheet.
 */
export const mermaidPrimaryColor = (scheme: ColorScheme) =>
    (enteredPrimaryColor === undefined
        ? __RENDERIZR_PRIMARY_COLOR__
        : enteredPrimaryColor) ?? PAGE_PRIMARY_COLORS[scheme];

/** `#rgb` or `#rrggbb` with every channel moved by `by`, clamped; any other color as it is. */
export function shiftChannels(color: string, by: number): string {
    const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(color);
    const hex = short
        ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
        : color;
    if (!/^#[\da-f]{6}$/i.test(hex)) return color;
    return `#${[1, 3, 5]
        .map((i) =>
            Math.min(
                255,
                Math.max(0, Number.parseInt(hex.slice(i, i + 2), 16) + by),
            )
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

/** A node's style, with the font its source may set. */
export type MermaidNodeStyle = ElementStyle & {
    /** The source's `font-family` for this node, ahead of the diagram's. */
    fontFamily?: string;
    /** The source's `font-weight` for its name, which is bold otherwise. */
    fontWeight?: string;
};

/** An edge's style, with the label colors its source may set. */
export type MermaidEdgeStyle = RelationshipStyle & {
    /** The label's text, which takes the line's color otherwise. */
    labelColor?: string;
    /** The label's backing, which takes the canvas's color otherwise. */
    labelBackground?: string;
};

/**
 * `declarations` with each one that ends in `\` joined to the piece after
 * it: Mermaid splits a style on commas and keeps the backslash of one the
 * source escapes, so `stroke-dasharray: 9\,5` arrives in two pieces. The
 * build's ignored-styling check (`scripts/mermaid/styling.js`) mirrors it.
 */
function joinEscaped(declarations: readonly string[]): string[] {
    const joined: string[] = [];
    let pending: string | undefined;
    for (const piece of declarations) {
        const whole = pending === undefined ? piece : `${pending},${piece}`;
        if (whole.endsWith("\\")) pending = whole.slice(0, -1);
        else {
            joined.push(whole);
            pending = undefined;
        }
    }
    if (pending !== undefined) joined.push(pending);
    return joined;
}

/**
 * Mermaid's CSS declarations (`["fill:#f00", "stroke-width:2px"]`) by
 * property, the last of each winning and `!important` dropped. A comma the
 * source escapes stays in its declaration's value.
 */
export function parseCss(
    declarations: readonly string[] = [],
): Record<string, string> {
    const css: Record<string, string> = {};
    for (const declaration of joinEscaped(declarations)) {
        const at = declaration.indexOf(":");
        if (at < 0) continue;
        const property = declaration.slice(0, at).trim().toLowerCase();
        const value = declaration
            .slice(at + 1)
            .replace(/!important\s*$/i, "")
            .trim();
        if (property && value) css[property] = value;
    }
    return css;
}

/** A length in px, written with or without its unit; `undefined` for any other. */
function pixels(value: string | undefined): number | undefined {
    const match = /^(\d+(?:\.\d+)?)(px)?$/.exec(value?.trim() ?? "");
    return match ? Number(match[1]) : undefined;
}

/** Whether a `stroke-dasharray` value draws dashes. */
const dashes = (value: string) => !/^(none|0(px)?)$/i.test(value.trim());

/** What a node's or subgraph's CSS sets, in style terms. */
function nodeCss(declarations: readonly string[]): Partial<MermaidNodeStyle> {
    const css = parseCss(declarations);
    const layer: Partial<MermaidNodeStyle> = {};
    if (css.fill) layer.background = css.fill;
    if (css.stroke) layer.stroke = css.stroke;
    const width = pixels(css["stroke-width"]);
    if (width !== undefined) layer.strokeWidth = width;
    if (css["stroke-dasharray"])
        layer.border = dashes(css["stroke-dasharray"]) ? "Dashed" : "Solid";
    if (css.color) layer.color = css.color;
    const size = pixels(css["font-size"]);
    if (size !== undefined) layer.fontSize = mermaidFontSize(size);
    if (css["font-weight"]) layer.fontWeight = css["font-weight"];
    if (css["font-family"]) layer.fontFamily = css["font-family"];
    return layer;
}

/** What a `linkStyle` sets, in style terms, and whether it asks for dashes. */
function edgeCss(
    declarations: readonly string[],
): Partial<MermaidEdgeStyle> & { dashes?: boolean } {
    const css = parseCss(declarations);
    const layer: Partial<MermaidEdgeStyle> & { dashes?: boolean } = {};
    if (css.stroke) layer.color = css.stroke;
    const width = pixels(css["stroke-width"]);
    if (width !== undefined) layer.thickness = width;
    if (css["stroke-dasharray"]) layer.dashes = dashes(css["stroke-dasharray"]);
    if (css.color) layer.labelColor = css.color;
    return layer;
}

/**
 * The routing a source's `curve` gives (spec: Styling): `linear` Direct,
 * `step`, `stepBefore` and `stepAfter` Orthogonal, every other curve
 * Curved; `undefined` when it sets none.
 */
export function mermaidRouting(config: MermaidConfig): string | undefined {
    const curve = config.flowchart?.curve ?? config.curve;
    if (typeof curve !== "string" || !curve) return undefined;
    if (curve === "linear") return "Direct";
    if (/^step(Before|After)?$/.test(curve)) return "Orthogonal";
    return "Curved";
}

/**
 * The font family a diagram's source sets (its `fontFamily` theme
 * variable), which goes ahead of `--font` and the fallback stack.
 */
export const mermaidFontFamily = (
    diagram: MermaidDiagram | undefined,
): string | undefined =>
    diagram?.error === undefined
        ? (diagram as MermaidSource | MermaidSequence | undefined)?.palette
              ?.fontFamily
        : undefined;

/** The CSS layers of an item's classes: `classDef default`, then each class it takes, as the source defines them. */
function classLayers<T>(
    diagram: MermaidSource,
    classes: readonly string[],
    read: (declarations: readonly string[]) => Partial<T>,
    withDefault: boolean,
): Partial<T>[] {
    const taken = new Set(classes);
    return Object.entries(diagram.classDefs)
        .filter(([name]) =>
            name === "default" ? withDefault : taken.has(name),
        )
        .sort(([a], [b]) => Number(b === "default") - Number(a === "default"))
        .map(([, declarations]) => read(declarations));
}

/** A workspace layer without what never applies to a Mermaid node: its size and shape. */
function workspaceNodeLayer(
    model: WorkspaceModel,
    scheme: ColorScheme,
): Partial<ElementStyle> {
    const {
        width: _width,
        height: _height,
        shape: _shape,
        ...layer
    } = explicitElementStyle(model, MERMAID_NODE_TAGS, scheme);
    return layer;
}

/** The style a Mermaid node draws in (`diagram.nodes`). */
export function mermaidNodeStyle(
    model: WorkspaceModel,
    diagram: ResolvedMermaid,
    node: MermaidNode,
    scheme: ColorScheme,
): MermaidNodeStyle {
    const source = diagram.diagram;
    const { palette } = source;
    const primary = mermaidPrimaryColor(scheme);
    const beneath: Partial<MermaidNodeStyle>[] = [
        {
            fontSize: MERMAID_FONT_SIZE,
            ...(diagram.silent && {
                background: primary,
                stroke: shiftChannels(primary, -50),
                color: "#ffffff",
            }),
        },
        workspaceNodeLayer(model, scheme),
    ];
    const sourced: Partial<MermaidNodeStyle>[] = [
        palette
            ? {
                  ...palette.node,
                  ...(palette.fontSize !== undefined && {
                      fontSize: mermaidFontSize(palette.fontSize),
                  }),
              }
            : {},
        ...classLayers(source, node.classes, nodeCss, true),
        nodeCss(node.styles),
    ];
    const style: MermaidNodeStyle = {
        ...findElementStyle(model, { type: "Custom", tags: "" }, scheme),
    };
    for (const layer of beneath) {
        Object.assign(style, layer);
        // As on every element, a fill with no stroke of its own takes one
        // 10% darker, rather than the stroke of the fill beneath it.
        if (layer.background !== undefined && layer.stroke === undefined)
            style.stroke = shadeColor(layer.background, -10);
    }
    // The source's own fill keeps the border beneath it, as in Mermaid.
    for (const layer of sourced) Object.assign(style, layer);
    return {
        ...style,
        tags: [...MERMAID_NODE_TAGS],
        shape: node.shape,
        strokeWidth: Math.min(10, Math.max(1, style.strokeWidth ?? 2)),
        metadata: false,
        description: false,
    };
}

/** The style a Mermaid edge draws in. */
export function mermaidEdgeStyle(
    model: WorkspaceModel,
    diagram: ResolvedMermaid,
    edge: MermaidEdge,
    scheme: ColorScheme,
): MermaidEdgeStyle {
    const source = diagram.diagram;
    const { palette } = source;
    const routing = mermaidRouting(source.config);
    // A light palette's edges follow the scheme in dark mode, as anything
    // drawn straight on the canvas does; a dark palette's never change.
    const onCanvas = palette && (palette.dark || scheme === "Light");
    const own = edgeCss(edge.styles);
    const { dashes: _dashes, ...linkStyle } = own;
    const layers: Partial<MermaidEdgeStyle>[] = [
        // A silent source routes by the workspace's `routing`, then this.
        { routing: "Orthogonal" },
        explicitRelationshipStyle(model, MERMAID_EDGE_TAGS, scheme),
        {
            ...(onCanvas && palette.edge),
            ...(routing && { routing }),
        },
        linkStyle,
    ];
    const style: MermaidEdgeStyle = {
        ...findRelationshipStyle(model, { tags: "" }, scheme),
    };
    for (const layer of layers) Object.assign(style, layer);
    const thickness = Math.min(10, Math.max(1, style.thickness));
    // The arrow syntax always wins: `-.->` dotted, `==>` about twice as
    // thick, an ERD's non-identifying relationship dashed; only the
    // source's own `stroke-dasharray` dashes the rest.
    const line =
        edge.line === "dotted"
            ? "Dotted"
            : edge.line === "dashed" || own.dashes
              ? "Dashed"
              : "Solid";
    return {
        ...style,
        tags: [...MERMAID_EDGE_TAGS],
        style: line,
        dashed: line !== "Solid",
        thickness:
            edge.line === "thick" ? Math.min(10, 2 * thickness) : thickness,
        metadata: false,
    };
}

/** The style a Mermaid subgraph's boundary draws in (`subgraph` is the one it draws, if known). */
export function mermaidGroupStyle(
    model: WorkspaceModel,
    diagram: ResolvedMermaid,
    subgraph: MermaidSubgraph | undefined,
    scheme: ColorScheme,
): ElementStyle {
    const source = diagram.diagram;
    const { palette } = source;
    const style = findTaggedGroupStyle(model, MERMAID_GROUP_TAGS, scheme);
    // Its name draws at the size a node's does, unless the workspace says.
    style.fontSize =
        explicitElementStyle(model, MERMAID_GROUP_TAGS, scheme).fontSize ??
        MERMAID_FONT_SIZE;
    const layers: Partial<MermaidNodeStyle>[] = [
        // Mermaid draws a cluster solid, in its palette's colors.
        palette
            ? {
                  ...palette.group,
                  border: "Solid",
                  ...(palette.fontSize !== undefined && {
                      fontSize: mermaidFontSize(palette.fontSize),
                  }),
              }
            : {},
        ...(subgraph
            ? [
                  ...classLayers(source, subgraph.classes, nodeCss, false),
                  nodeCss(subgraph.styles),
              ]
            : []),
    ];
    for (const layer of layers) {
        // A subgraph draws in the diagram's font; only its colors, lines
        // and size take a source's CSS.
        const { fontFamily: _family, fontWeight: _weight, ...rest } = layer;
        Object.assign(style, rest);
    }
    return style;
}
