/**
 * A Mermaid diagram as the resolved view every view becomes (ADR 24): its
 * nodes as elements, its edges as relationships and its subgraphs as group
 * boundaries, laid out automatically. None of them enter `WorkspaceModel`,
 * so `findElementById` doesn't know them and edit mode can't arrange them;
 * the page reads what it needs from `ResolvedMermaid`.
 *
 * Every Mermaid length scales by 1.5, from the 16 px Mermaid draws text at
 * to the 24 px Renderizr does (spec: Flowchart and ERD layout).
 */

import type { ResolvedBoundary } from "./boundaries";
import type {
    AutomaticLayoutSettings,
    MermaidDirection,
    MermaidEdge,
    MermaidFlowchart,
    MermaidNode,
    MermaidSubgraph,
    ModelElement,
    ModelRelationship,
    ModelView,
} from "./types";

/** How much bigger Renderizr draws a Mermaid diagram than Mermaid does. */
export const MERMAID_SCALE = 1.5;

/** Mermaid's flowchart spacing at 16 px: between nodes, ranks and edges. */
const FLOWCHART_SPACING = { node: 50, rank: 50, edge: 20 };

/** Mermaid's directions as automatic layout spells them. */
export const RANK_DIRECTIONS: Record<
    MermaidDirection,
    AutomaticLayoutSettings["rankDirection"]
> = {
    TB: "TopBottom",
    BT: "BottomTop",
    LR: "LeftRight",
    RL: "RightLeft",
};

/** What the page needs of a Mermaid flowchart beyond its resolved view. */
export type ResolvedMermaid = {
    diagram: MermaidFlowchart;
    /** Each node, by the id of the element it draws as. */
    nodes: ReadonlyMap<string, MermaidNode>;
    /** Each edge, by the id of the relationship it draws as. */
    edges: ReadonlyMap<string, MermaidEdge>;
    /** Each subgraph, by the id of the boundary it draws as. */
    subgraphs: ReadonlyMap<string, MermaidSubgraph>;
    /** The direction each subgraph sets of its own, by boundary id. */
    directions: ReadonlyMap<string, AutomaticLayoutSettings["rankDirection"]>;
    /** Whether the source sets no `theme` and no `themeVariables` (spec: Styling). */
    silent: boolean;
    /**
     * What Dagre is handed first: the sources (nodes with no incoming edge),
     * as Mermaid's own layouts order them, or plain model order under
     * `layout: dagre` (spec: Flowchart and ERD layout).
     */
    order: "sources" | "model";
};

/** The element id a node draws under. */
export const mermaidNodeId = (id: string) => `mermaid:${id}`;
/** The boundary id a subgraph draws under. */
export const mermaidGroupId = (id: string) => `mermaid-group:${id}`;
/** The relationship id an edge draws under. */
export const mermaidEdgeId = (id: string) => `mermaid-edge:${id}`;

/**
 * The flowchart node of `view` drawn as element `elementId`, which the page
 * reads a node's link from when it is activated, since `findElementById`
 * doesn't know the node; `undefined` on any other view or element.
 */
export function mermaidNodeOf(
    view: ModelView | undefined,
    elementId: string,
): MermaidNode | undefined {
    const diagram = view?.type === "Mermaid" ? view.mermaid : undefined;
    if (!diagram || diagram.error !== undefined) return undefined;
    if (diagram.kind !== "flowchart") return undefined;
    return diagram.nodes.find((node) => mermaidNodeId(node.id) === elementId);
}

/** Which of the two label toggles a view hides. */
export type InertToggles = { descriptions: boolean; technologies: boolean };

/**
 * The label toggles that would change nothing on `view`, which the toolbar
 * hides as it hides the animation and export groups, leaving the reader's
 * preference as it is (spec: Toolbar and label toggles, ADR 24). A
 * flowchart's labels are its source's text alone, so both hide on one.
 */
export function inertToggles(view: ModelView): InertToggles {
    const kind = view.type === "Mermaid" ? view.mermaid?.kind : undefined;
    const flowchart = kind === "flowchart";
    return { descriptions: flowchart, technologies: flowchart };
}

/** What the export buttons say on a Mermaid diagram that couldn't be drawn. */
export const NOTHING_TO_EXPORT =
    "Nothing to export: the diagram couldn't be drawn";

/** What `resolveView` takes from a Mermaid diagram in place of the workspace's model. */
export type MermaidResolution = {
    elements: { id: string; x: number; y: number; element: ModelElement }[];
    relationships: { id: string; relationship: ModelRelationship }[];
    boundaries: ResolvedBoundary[];
    automaticLayout: AutomaticLayoutSettings;
    mermaid: ResolvedMermaid;
};

/**
 * Every node, edge and subgraph of `view`'s flowchart as the elements,
 * relationships and group boundaries of an automatic layout; `undefined`
 * for a view that carries no drawable diagram.
 */
export function resolveMermaid(view: ModelView): MermaidResolution | undefined {
    const diagram = view.mermaid;
    if (!diagram || diagram.error !== undefined) return undefined;

    const nodes = new Map<string, MermaidNode>();
    const elements = diagram.nodes.map((node) => {
        const id = mermaidNodeId(node.id);
        nodes.set(id, node);
        const element: ModelElement = {
            id,
            type: "Custom",
            name: node.label,
            tags: "Element,Mermaid",
            properties: {},
            perspectives: [],
        };
        return { id, x: 0, y: 0, element };
    });

    const known = new Set(diagram.nodes.map((node) => node.id));
    const edges = new Map<string, MermaidEdge>();
    const relationships = diagram.edges
        .filter((edge) => known.has(edge.source) && known.has(edge.target))
        .map((edge) => {
            const id = mermaidEdgeId(edge.id);
            edges.set(id, edge);
            const relationship: ModelRelationship = {
                id,
                sourceId: mermaidNodeId(edge.source),
                destinationId: mermaidNodeId(edge.target),
                description: edge.label,
                tags: "Relationship,Mermaid",
                properties: {},
                perspectives: [],
            };
            return { id, relationship };
        });

    const subgraphs = new Map<string, MermaidSubgraph>();
    const directions = new Map<
        string,
        AutomaticLayoutSettings["rankDirection"]
    >();
    for (const subgraph of diagram.subgraphs) {
        const id = mermaidGroupId(subgraph.id);
        subgraphs.set(id, subgraph);
        if (subgraph.direction)
            directions.set(id, RANK_DIRECTIONS[subgraph.direction]);
    }

    const { config } = diagram;
    const spacing = config.flowchart ?? {};
    const scaled = (value: unknown, fallback: number) =>
        (typeof value === "number" && value >= 0 ? value : fallback) *
        MERMAID_SCALE;

    return {
        elements,
        relationships,
        boundaries: subgraphBoundaries(diagram),
        automaticLayout: {
            implementation: "Dagre",
            rankDirection: RANK_DIRECTIONS[diagram.direction] ?? "TopBottom",
            rankSeparation: scaled(spacing.rankSpacing, FLOWCHART_SPACING.rank),
            nodeSeparation: scaled(spacing.nodeSpacing, FLOWCHART_SPACING.node),
            edgeSeparation: FLOWCHART_SPACING.edge * MERMAID_SCALE,
            vertices: false,
        },
        mermaid: {
            diagram,
            nodes,
            edges,
            subgraphs,
            directions,
            silent:
                config.theme === undefined &&
                config.themeVariables === undefined,
            order: config.layout === "dagre" ? "model" : "sources",
        },
    };
}

/**
 * Each subgraph as a group boundary, outer before inner, with the nodes and
 * subgraphs directly inside it as its children.
 */
function subgraphBoundaries(diagram: MermaidFlowchart): ResolvedBoundary[] {
    const byId = new Map(diagram.subgraphs.map((s) => [s.id, s]));
    const depthOf = (subgraph: MermaidSubgraph): number => {
        let depth = 0;
        for (
            let parent = subgraph.parent && byId.get(subgraph.parent);
            parent;
            parent = parent.parent && byId.get(parent.parent)
        )
            depth++;
        return depth;
    };
    const boundaries: ResolvedBoundary[] = diagram.subgraphs.map(
        (subgraph) => ({
            id: mermaidGroupId(subgraph.id),
            name: subgraph.label,
            ...(subgraph.parent &&
                byId.has(subgraph.parent) && {
                    parent: mermaidGroupId(subgraph.parent),
                }),
            children: [
                ...diagram.nodes
                    .filter((node) => node.parent === subgraph.id)
                    .map((node) => mermaidNodeId(node.id)),
                ...diagram.subgraphs
                    .filter((inner) => inner.parent === subgraph.id)
                    .map((inner) => mermaidGroupId(inner.id)),
            ],
            depth: depthOf(subgraph),
            kind: "Group",
            group: subgraph.label,
        }),
    );
    return boundaries.sort((a, b) => a.depth - b.depth);
}
