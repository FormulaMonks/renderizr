/**
 * A Mermaid sequence diagram as the resolved view every view becomes (ADR
 * 24): its participants as elements and its messages as relationships, so
 * the style cascade reaches them through their tags, plus the sequence
 * script the page lays out in place of placement and routing (spec:
 * Sequence diagrams). None of them enter `WorkspaceModel`.
 *
 * The styles layer as the spec's Styling says: a silent source's
 * participants take the primary color fill, its messages and boxes the
 * scheme's defaults; the workspace's tag styles go over those, and the
 * source's palette over them both.
 */

import {
    type MermaidResolution,
    mermaidEdgeId,
    mermaidNodeId,
    sequenceOf,
} from "./mermaid";
import {
    MERMAID_EDGE_TAGS,
    MERMAID_GROUP_TAGS,
    MERMAID_NODE_TAGS,
    type MermaidEdgeStyle,
    mermaidPrimaryColor,
    shiftChannels,
} from "./mermaid-styles";
import {
    type ElementStyle,
    explicitElementStyle,
    explicitRelationshipStyle,
    findElementStyle,
    findRelationshipStyle,
    findTaggedGroupStyle,
    shadeColor,
} from "./styles";
import type {
    ColorScheme,
    MermaidMessage,
    MermaidParticipant,
    MermaidParticipantShape,
    MermaidParticipantType,
    MermaidSequencePalette,
    ModelElement,
    ModelRelationship,
    ModelView,
} from "./types";
import type { WorkspaceModel } from "./workspace";

/**
 * A participant's font size: its name draws at 14 times the name scale, a
 * little smaller than a flowchart node's (spec: Sequence diagrams).
 */
export const PARTICIPANT_FONT_SIZE = 14;

/** What every other sequence text draws at: Mermaid's 16 px, scaled by 1.25. */
export const SEQUENCE_FONT_SIZE = 20;

/** The shape each participant type draws as (spec: Sequence diagrams). */
export const PARTICIPANT_SHAPES: Record<
    MermaidParticipantType,
    MermaidParticipantShape
> = {
    participant: "Box",
    actor: "Person",
    database: "Cylinder",
    queue: "Pipe",
};

/**
 * Every participant and message of `view`'s sequence diagram as the
 * elements and relationships of a resolved view, with the diagram itself as
 * its sequence script; `undefined` for a view that carries none.
 */
export function resolveSequence(
    view: ModelView,
): MermaidResolution | undefined {
    const diagram = sequenceOf(view);
    if (!diagram) return undefined;
    const elements = diagram.participants.map((participant) => {
        const id = mermaidNodeId(participant.id);
        const element: ModelElement = {
            id,
            type: "Custom",
            name: participant.label,
            tags: MERMAID_NODE_TAGS.join(","),
            properties: {},
            perspectives: [],
        };
        return { id, x: 0, y: 0, element };
    });
    const relationships = diagram.items.flatMap((item) => {
        if (item.kind !== "message") return [];
        const id = mermaidEdgeId(item.id);
        const relationship: ModelRelationship = {
            id,
            sourceId: mermaidNodeId(item.from),
            destinationId: mermaidNodeId(item.to),
            description: item.label,
            tags: MERMAID_EDGE_TAGS.join(","),
            properties: {},
            perspectives: [],
        };
        return [{ id, relationship }];
    });
    return {
        elements,
        relationships,
        boundaries: [],
        // Never read: the script lays the diagram out.
        automaticLayout: {
            implementation: "Dagre",
            rankDirection: "TopBottom",
            rankSeparation: 0,
            nodeSeparation: 0,
            edgeSeparation: 0,
            vertices: false,
        },
        sequence: diagram,
    };
}

/**
 * Whether `palette`'s colors for what draws straight on the canvas (message
 * lines and labels, sequence numbers, lifelines, fragment lines and titles)
 * apply in `scheme`: a dark palette's always, a light one's in light mode;
 * in dark mode those follow the scheme (spec: Styling).
 */
export const sequenceOnCanvas = (
    palette: MermaidSequencePalette | undefined,
    scheme: ColorScheme,
): palette is MermaidSequencePalette =>
    palette !== undefined && (palette.dark || scheme === "Light");

/** `size` scaled by the source's `fontSize` over Mermaid's 16 px. */
/**
 * A text size: `base`, Renderizr's own size for that text, scaled by the
 * source's `fontSize` from Mermaid's 16 px when the source sets one, which
 * replaces the workspace's size; `size` otherwise.
 */
const scaled = (
    size: number,
    base: number,
    palette: MermaidSequencePalette | undefined,
) => (palette?.fontSize === undefined ? size : (base * palette.fontSize) / 16);

/**
 * A participant's style: its shape by type, the primary color fill, then
 * the workspace's, then the source's palette, where `index` picks a
 * `redux-color` participant's own colors.
 */
export function participantStyle(
    model: WorkspaceModel,
    participant: MermaidParticipant,
    scheme: ColorScheme,
    palette?: MermaidSequencePalette,
    index = 0,
): ElementStyle {
    const primary = mermaidPrimaryColor(scheme);
    const {
        width: _width,
        height: _height,
        shape: _shape,
        ...workspace
    } = explicitElementStyle(model, MERMAID_NODE_TAGS, scheme);
    const style: ElementStyle = {
        ...findElementStyle(model, { type: "Custom", tags: "" }, scheme),
        fontSize: PARTICIPANT_FONT_SIZE,
        background: primary,
        stroke: shiftChannels(primary, -50),
        color: "#ffffff",
    };
    Object.assign(style, workspace);
    // As on every element, a fill with no stroke of its own takes one 10%
    // darker, rather than the stroke of the fill beneath it.
    if (workspace.background !== undefined && workspace.stroke === undefined)
        style.stroke = shadeColor(workspace.background, -10);
    if (palette) {
        const { colors } = palette;
        const own = palette.participants?.[index];
        style.background = own?.background ?? colors.actorBkg;
        style.stroke = own?.stroke ?? colors.actorBorder;
        style.color = colors.actorTextColor;
        style.fontSize = scaled(style.fontSize, PARTICIPANT_FONT_SIZE, palette);
    }
    return {
        ...style,
        tags: [...MERMAID_NODE_TAGS],
        shape: PARTICIPANT_SHAPES[participant.type],
        strokeWidth: Math.min(10, Math.max(1, style.strokeWidth ?? 2)),
        metadata: false,
        description: false,
    };
}

/**
 * A message's style: the scheme's, then the workspace's, then the source's
 * palette where it applies (`sequenceOnCanvas`); its arrow syntax picks the line.
 */
export function messageStyle(
    model: WorkspaceModel,
    message: MermaidMessage,
    scheme: ColorScheme,
    palette?: MermaidSequencePalette,
): MermaidEdgeStyle {
    const style: MermaidEdgeStyle = {
        ...findRelationshipStyle(model, { tags: "" }, scheme),
        fontSize: SEQUENCE_FONT_SIZE,
        ...explicitRelationshipStyle(model, MERMAID_EDGE_TAGS, scheme),
    };
    if (sequenceOnCanvas(palette, scheme)) {
        style.color = palette.colors.signalColor;
        style.labelColor = palette.colors.signalTextColor;
    }
    style.fontSize = scaled(style.fontSize, SEQUENCE_FONT_SIZE, palette);
    const line = message.line === "dotted" ? "Dotted" : "Solid";
    return {
        ...style,
        tags: [...MERMAID_EDGE_TAGS],
        style: line,
        dashed: line !== "Solid",
        thickness: Math.min(10, Math.max(1, style.thickness)),
        metadata: false,
    };
}

/** A `box`'s style: the workspace's `Group` and `Mermaid` styles over the scheme's. */
export const sequenceBoxStyle = (
    model: WorkspaceModel,
    scheme: ColorScheme,
): ElementStyle => findTaggedGroupStyle(model, MERMAID_GROUP_TAGS, scheme);
