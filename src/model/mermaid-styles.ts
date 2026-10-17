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
 * 4. the source's own styling: its config, then its classes, then its
 *    `style` and `linkStyle` (`sourceLayers`).
 *
 * The source's shapes and arrow syntax always win, whatever a layer says.
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
import type { ColorScheme, MermaidEdge, MermaidNode } from "./types";
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

/** The page's own primary color per scheme, in `src/main.css`, when the build names none. */
export const PAGE_PRIMARY_COLORS: Record<ColorScheme, string> = {
    Light: "#145b9e",
    Dark: "#1168bd",
};

/**
 * The branding's primary color (`--primary-color`, then
 * `renderizr.primaryColor`), else the page's default for `scheme`. Export
 * draws it as a literal, so it can't be read from the stylesheet.
 */
export const mermaidPrimaryColor = (scheme: ColorScheme) =>
    __RENDERIZR_PRIMARY_COLOR__ ?? PAGE_PRIMARY_COLORS[scheme];

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

/**
 * The layers of the source's own styling, least specific first: its
 * config, its classes, then its `style` or `linkStyle`. None yet: the
 * source's styling is the next slice's (spec: Build order).
 */
const sourceLayers = <T>(): Partial<T>[] => [];

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
): ElementStyle {
    const primary = mermaidPrimaryColor(scheme);
    const layers: Partial<ElementStyle>[] = [
        {
            fontSize: MERMAID_FONT_SIZE,
            ...(diagram.silent && {
                background: primary,
                stroke: shiftChannels(primary, -50),
                color: "#ffffff",
            }),
        },
        workspaceNodeLayer(model, scheme),
        ...sourceLayers<ElementStyle>(),
    ];
    const style: ElementStyle = {
        ...findElementStyle(model, { type: "Custom", tags: "" }, scheme),
    };
    for (const layer of layers) {
        Object.assign(style, layer);
        // As on every element, a fill with no stroke of its own takes one
        // 10% darker, rather than the stroke of the fill beneath it.
        if (layer.background !== undefined && layer.stroke === undefined)
            style.stroke = shadeColor(layer.background, -10);
    }
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
    edge: MermaidEdge,
    scheme: ColorScheme,
): RelationshipStyle {
    const layers: Partial<RelationshipStyle>[] = [
        // A silent source routes by the workspace's `routing`, then this.
        { routing: "Orthogonal" },
        explicitRelationshipStyle(model, MERMAID_EDGE_TAGS, scheme),
        ...sourceLayers<RelationshipStyle>(),
    ];
    const style: RelationshipStyle = {
        ...findRelationshipStyle(model, { tags: "" }, scheme),
    };
    for (const layer of layers) Object.assign(style, layer);
    const thickness = Math.min(10, Math.max(1, style.thickness));
    // The arrow syntax always wins: `-.->` dotted, `==>` about twice as thick.
    const line = edge.line === "dotted" ? "Dotted" : "Solid";
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

/** The style a Mermaid subgraph's boundary draws in. */
export function mermaidGroupStyle(
    model: WorkspaceModel,
    scheme: ColorScheme,
): ElementStyle {
    const style = findTaggedGroupStyle(model, MERMAID_GROUP_TAGS, scheme);
    // Its name draws at the size a node's does, unless the workspace says.
    style.fontSize =
        explicitElementStyle(model, MERMAID_GROUP_TAGS, scheme).fontSize ??
        MERMAID_FONT_SIZE;
    for (const layer of sourceLayers<ElementStyle>())
        Object.assign(style, layer);
    return style;
}
