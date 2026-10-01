/**
 * PROTOTYPE (#23): one container view, drawn by React Flow inside the diagram
 * target, from stored coordinates only. Throwaway code to learn what the engine
 * feels like before the diagram contract exists; it reads the raw workspace
 * JSON rather than the vendored model, and knows nothing about the rest of the
 * page beyond the box it is mounted in.
 *
 * In scope: Box, Person and Cylinder shapes, one software system boundary as a
 * parent node, straight floating edges with their labels, React Flow's own fit
 * and zoom. Everything else (other shapes, routing, vertices, label position,
 * opacity, themes, icons) is ignored on purpose.
 */
import {
    BaseEdge,
    Controls,
    EdgeLabelRenderer,
    type Edge,
    Handle,
    type EdgeProps,
    type InternalNode,
    MarkerType,
    type Node,
    type NodeProps,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useInternalNode,
    useNodesInitialized,
    useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./react-flow-island.css";
import { useEffect, useImperativeHandle, type Ref } from "react";
import { createRoot } from "react-dom/client";

/* ------------------------------------------------------------------------ */
/* Workspace JSON, as little of it as this view needs                        */
/* ------------------------------------------------------------------------ */

type Json = Record<string, unknown>;

type ModelElement = {
    id: string;
    name: string;
    description?: string;
    technology?: string;
    tags?: string;
    type: string;
    parentId?: string;
};

type ModelRelationship = {
    id: string;
    sourceId: string;
    destinationId: string;
    description?: string;
    technology?: string;
    tags?: string;
};

type ElementStyle = {
    width: number;
    height: number;
    background: string;
    color: string;
    stroke?: string;
    fontSize: number;
    shape: string;
};

type RelationshipStyle = {
    color: string;
    thickness: number;
    fontSize: number;
    width: number;
    dashed: boolean;
};

/** Structurizr's defaults for anything a tag style does not override. */
const DEFAULT_ELEMENT_STYLE: ElementStyle = {
    width: 450,
    height: 300,
    background: "#dddddd",
    color: "#000000",
    fontSize: 24,
    shape: "Box",
};

const DEFAULT_RELATIONSHIP_STYLE: RelationshipStyle = {
    color: "#707070",
    thickness: 2,
    fontSize: 24,
    width: 200,
    dashed: true,
};

/** The vendored renderer's own ratios and paddings, kept so sizes line up. */
const NAME_RATIO = 1.4;
const METADATA_RATIO = 0.7;
const BOUNDARY_PADDING = 50;
const BOUNDARY_MARGIN = 15;

const tagsOf = (item: { tags?: string }) =>
    (item.tags ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

/**
 * Walk the model once and index every element and relationship by id. The
 * model nests containers in systems and components in containers, and
 * relationships hang off whichever element is their source.
 */
function indexModel(model: Json) {
    const elements = new Map<string, ModelElement>();
    const relationships = new Map<string, ModelRelationship>();

    const visit = (element: Json, type: string, parentId?: string) => {
        const id = element.id as string;
        elements.set(id, { ...(element as ModelElement), type, parentId });
        for (const relationship of (element.relationships as Json[]) ?? []) {
            relationships.set(
                relationship.id as string,
                relationship as ModelRelationship,
            );
        }
        for (const child of (element.containers as Json[]) ?? [])
            visit(child, "Container", id);
        for (const child of (element.components as Json[]) ?? [])
            visit(child, "Component", id);
    };

    for (const person of (model.people as Json[]) ?? [])
        visit(person, "Person");
    for (const system of (model.softwareSystems as Json[]) ?? [])
        visit(system, "SoftwareSystem");

    return { elements, relationships };
}

/** Tag cascade: later tags win, the way Structurizr applies them. */
function resolveStyle<T>(styles: Json[], tags: string[], defaults: T): T {
    const resolved = { ...defaults } as Json;
    for (const tag of tags) {
        for (const style of styles) {
            if (style.tag !== tag) continue;
            for (const [key, value] of Object.entries(style)) {
                if (key !== "tag" && value !== undefined && value !== null)
                    resolved[key] = value;
            }
        }
    }
    return resolved as T;
}

/** A stroke a shade darker than the fill, as Structurizr derives one. */
function darken(hex: string, amount = 0.15) {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    const channel = (shift: number) =>
        Math.round(((value >> shift) & 0xff) * (1 - amount));
    return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function metadataFor(element: ModelElement) {
    const kind = element.type.replace("SoftwareSystem", "Software System");
    return element.technology
        ? `[${kind}: ${element.technology}]`
        : `[${kind}]`;
}

/* ------------------------------------------------------------------------ */
/* Nodes                                                                     */
/* ------------------------------------------------------------------------ */

type ElementData = {
    element: ModelElement;
    style: ElementStyle;
};

type BoundaryData = {
    element: ModelElement;
    fontSize: number;
};

type ElementNode = Node<ElementData, "element">;
type BoundaryNode = Node<BoundaryData, "boundary">;

/** Name, metadata and description, centred in whatever box the shape leaves. */
function ElementText({
    element,
    style,
    top = 0,
}: ElementData & { top?: number }) {
    return (
        <div
            className="rfi-text"
            style={{
                color: style.color,
                fontSize: style.fontSize,
                paddingTop: top,
            }}
        >
            <div
                className="rfi-name"
                style={{ fontSize: style.fontSize * NAME_RATIO }}
            >
                {element.name}
            </div>
            <div
                className="rfi-metadata"
                style={{ fontSize: style.fontSize * METADATA_RATIO }}
            >
                {metadataFor(element)}
            </div>
            {element.description && (
                <div className="rfi-description">{element.description}</div>
            )}
        </div>
    );
}

/**
 * React Flow will not draw an edge between nodes that have no handles, even
 * one that ignores them and computes its own endpoints. Two invisible ones
 * satisfy it.
 */
function Handles() {
    return (
        <>
            <Handle
                type="target"
                position={Position.Top}
                className="rfi-handle"
            />
            <Handle
                type="source"
                position={Position.Bottom}
                className="rfi-handle"
            />
        </>
    );
}

function ElementShape(props: NodeProps<ElementNode>) {
    return (
        <>
            <Handles />
            <ElementOutline {...props} />
        </>
    );
}

function ElementOutline({ data }: NodeProps<ElementNode>) {
    const { style } = data;
    const { width, height } = style;
    const fill = style.background;
    const stroke = style.stroke ?? darken(style.background);

    switch (style.shape) {
        case "Person": {
            // Square box: head a circle on top, body a rounded rectangle below.
            const head = width / 4.5;
            const bodyTop = width / 2.5;
            return (
                <div className="rfi-node" style={{ width, height: width }}>
                    <svg width={width} height={width} aria-hidden="true">
                        <rect
                            x={1}
                            y={bodyTop}
                            width={width - 2}
                            height={width - bodyTop - 1}
                            rx={head}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={2}
                        />
                        <circle
                            cx={width / 2}
                            cy={head}
                            r={head - 1}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={2}
                        />
                    </svg>
                    <ElementText {...data} top={bodyTop + head / 2} />
                </div>
            );
        }
        case "Cylinder": {
            const ry = 30;
            const path = [
                `M 1,${ry}`,
                `a ${width / 2 - 1},${ry} 0,0,0 ${width - 2},0`,
                `a ${width / 2 - 1},${ry} 0,0,0 -${width - 2},0`,
                `l 0,${height - ry * 2}`,
                `a ${width / 2 - 1},${ry} 0,0,0 ${width - 2},0`,
                `l 0,-${height - ry * 2}`,
            ].join(" ");
            return (
                <div className="rfi-node" style={{ width, height }}>
                    <svg width={width} height={height} aria-hidden="true">
                        <path
                            d={path}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={2}
                        />
                    </svg>
                    <ElementText {...data} top={ry * 2} />
                </div>
            );
        }
        default:
            // Box, and every shape this prototype does not draw yet
            // (WebBrowser, MobileDeviceLandscape, ...) falls back to it.
            return (
                <div
                    className="rfi-node rfi-box"
                    style={{
                        width,
                        height,
                        background: fill,
                        borderColor: stroke,
                    }}
                >
                    <ElementText {...data} />
                </div>
            );
    }
}

function BoundaryShape({ data, width, height }: NodeProps<BoundaryNode>) {
    return (
        <div className="rfi-boundary" style={{ width, height }}>
            <div className="rfi-boundary-label">
                <div
                    className="rfi-name"
                    style={{ fontSize: data.fontSize * NAME_RATIO }}
                >
                    {data.element.name}
                </div>
                <div
                    className="rfi-metadata"
                    style={{ fontSize: data.fontSize * METADATA_RATIO }}
                >
                    {metadataFor(data.element)}
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------------ */
/* Edges: straight, centre to centre, clipped at each bounding box            */
/* ------------------------------------------------------------------------ */

type RelationshipData = {
    relationship: ModelRelationship;
    style: RelationshipStyle;
};

type RelationshipEdge = Edge<RelationshipData, "relationship">;

function centreOf(node: InternalNode) {
    const { x, y } = node.internals.positionAbsolute;
    const width = node.measured.width ?? 0;
    const height = node.measured.height ?? 0;
    return { x: x + width / 2, y: y + height / 2, width, height };
}

/** Where the line from `from`'s centre towards `to` leaves `from`'s box. */
function clipToBox(
    from: ReturnType<typeof centreOf>,
    to: { x: number; y: number },
) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (dx === 0 && dy === 0) return { x: from.x, y: from.y };
    const scale = Math.min(
        dx === 0 ? Number.POSITIVE_INFINITY : from.width / 2 / Math.abs(dx),
        dy === 0 ? Number.POSITIVE_INFINITY : from.height / 2 / Math.abs(dy),
    );
    return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function FloatingEdge({
    id,
    source,
    target,
    markerEnd,
    style,
    data,
}: EdgeProps<RelationshipEdge>) {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);
    if (!sourceNode || !targetNode || !data) return null;

    const a = centreOf(sourceNode);
    const b = centreOf(targetNode);
    const start = clipToBox(a, b);
    const end = clipToBox(b, a);
    const labelX = (start.x + end.x) / 2;
    const labelY = (start.y + end.y) / 2;

    return (
        <>
            <BaseEdge
                id={id}
                path={`M ${start.x},${start.y} L ${end.x},${end.y}`}
                markerEnd={markerEnd}
                style={style}
            />
            <EdgeLabelRenderer>
                <div
                    className="rfi-edge-label"
                    style={{
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        width: data.style.width,
                        color: data.style.color,
                        fontSize: data.style.fontSize,
                    }}
                >
                    {data.relationship.description && (
                        <div>{data.relationship.description}</div>
                    )}
                    {data.relationship.technology && (
                        <div
                            style={{
                                fontSize: data.style.fontSize * METADATA_RATIO,
                            }}
                        >
                            [{data.relationship.technology}]
                        </div>
                    )}
                </div>
            </EdgeLabelRenderer>
        </>
    );
}

// Module level, so React Flow never sees a new object and remounts every node.
const nodeTypes = { element: ElementShape, boundary: BoundaryShape };
const edgeTypes = { relationship: FloatingEdge };

/* ------------------------------------------------------------------------ */
/* View → nodes and edges                                                    */
/* ------------------------------------------------------------------------ */

export type Bounds = { x: number; y: number; width: number; height: number };

export function buildFlow(workspace: Json, viewKey: string) {
    const views = workspace.views as Json;
    const view = (views.containerViews as Json[] | undefined)?.find(
        (candidate) => candidate.key === viewKey,
    );
    if (!view) throw new Error(`No container view "${viewKey}"`);

    const { elements, relationships } = indexModel(workspace.model as Json);
    const styles = ((views.configuration as Json)?.styles as Json) ?? {};
    const elementStyles = (styles.elements as Json[]) ?? [];
    const relationshipStyles = (styles.relationships as Json[]) ?? [];

    const children: ElementNode[] = [];
    for (const placed of view.elements as Json[]) {
        const element = elements.get(placed.id as string);
        if (!element) continue;
        const style = resolveStyle(
            elementStyles,
            tagsOf(element),
            DEFAULT_ELEMENT_STYLE,
        );
        // A person is drawn in a square, whatever height its style says.
        const height = style.shape === "Person" ? style.width : style.height;
        children.push({
            id: element.id,
            type: "element",
            position: { x: placed.x as number, y: placed.y as number },
            width: style.width,
            height,
            data: { element, style: { ...style, height } },
        });
    }

    // The one boundary a container view has: the software system in scope,
    // sized bottom-up from its containers, the way the vendored `reposition`
    // does. React Flow will not size a parent for us.
    const nodes: Node[] = [];
    const system = elements.get(view.softwareSystemId as string);
    const inside = children.filter(
        (node) => node.data.element.parentId === system?.id,
    );
    if (system && inside.length) {
        const fontSize = resolveStyle(
            elementStyles,
            tagsOf(system),
            DEFAULT_ELEMENT_STYLE,
        ).fontSize;
        const minX = Math.min(...inside.map((n) => n.position.x));
        const minY = Math.min(...inside.map((n) => n.position.y));
        const maxX = Math.max(
            ...inside.map((n) => n.position.x + (n.width ?? 0)),
        );
        const maxY = Math.max(
            ...inside.map((n) => n.position.y + (n.height ?? 0)),
        );
        const bottom =
            BOUNDARY_PADDING +
            BOUNDARY_MARGIN +
            fontSize * NAME_RATIO +
            fontSize * METADATA_RATIO +
            BOUNDARY_MARGIN;
        const x = minX - BOUNDARY_PADDING;
        const y = minY - BOUNDARY_PADDING;

        nodes.push({
            id: system.id,
            type: "boundary",
            position: { x, y },
            width: maxX - minX + BOUNDARY_PADDING * 2,
            height: maxY - minY + BOUNDARY_PADDING + bottom,
            data: { element: system, fontSize },
            // Boundaries sit under everything, edges included.
            zIndex: -1,
        });

        // Parents before children, and children relative to their parent.
        for (const node of inside) {
            node.parentId = system.id;
            node.position = { x: node.position.x - x, y: node.position.y - y };
        }
    }
    nodes.push(...children);

    const edges: RelationshipEdge[] = [];
    for (const placed of view.relationships as Json[]) {
        const relationship = relationships.get(placed.id as string);
        if (!relationship) continue;
        const style = resolveStyle(
            relationshipStyles,
            ["Relationship", ...tagsOf(relationship)],
            DEFAULT_RELATIONSHIP_STYLE,
        );
        edges.push({
            id: relationship.id,
            type: "relationship",
            source: relationship.sourceId,
            target: relationship.destinationId,
            data: { relationship, style },
            style: {
                stroke: style.color,
                strokeWidth: style.thickness,
                strokeDasharray: style.dashed
                    ? `${style.thickness * 4} ${style.thickness * 4}`
                    : undefined,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: style.color,
                width: 12,
                height: 12,
            },
        });
    }

    // Absolute bounds, for the page to size the canvas from.
    const top = nodes.filter((node) => !node.parentId);
    const bounds: Bounds = {
        x: Math.min(...top.map((n) => n.position.x)),
        y: Math.min(...top.map((n) => n.position.y)),
        width: 0,
        height: 0,
    };
    bounds.width =
        Math.max(...top.map((n) => n.position.x + (n.width ?? 0))) - bounds.x;
    bounds.height =
        Math.max(...top.map((n) => n.position.y + (n.height ?? 0))) - bounds.y;

    return { nodes, edges, bounds };
}

/* ------------------------------------------------------------------------ */
/* The island                                                                */
/* ------------------------------------------------------------------------ */

export type IslandHandle = { fit: () => void };

type FlowProps = {
    nodes: Node[];
    edges: Edge[];
    colorMode: "light" | "dark";
    handle: Ref<IslandHandle>;
};

function Flow({ nodes, edges, colorMode, handle }: FlowProps) {
    const { fitView } = useReactFlow();
    const initialized = useNodesInitialized();

    // React Flow fits once against whatever size it measured at mount, and
    // never again; the page's own width observer drives every later fit.
    useImperativeHandle(handle, () => ({ fit: () => void fitView() }), [
        fitView,
    ]);
    useEffect(() => {
        if (initialized) void fitView();
    }, [initialized, fitView]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={colorMode}
            nodeOrigin={[0, 0]}
            fitView
            minZoom={0.05}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            // Plain wheel scrolls the page, as it does today; a pinch or a
            // ctrl/cmd wheel zooms.
            zoomOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
        >
            <Controls showInteractive={false} />
        </ReactFlow>
    );
}

/**
 * Mount the island into `target`, which must already have a size. Returns the
 * handle the page uses to refit, and the unmount the page must call before it
 * wipes the DOM.
 */
export function mountIsland(
    target: HTMLElement,
    flow: { nodes: Node[]; edges: Edge[] },
    colorMode: "light" | "dark",
) {
    const root = createRoot(target);
    const handle: { current: IslandHandle | null } = { current: null };

    root.render(
        <ReactFlowProvider>
            <Flow {...flow} colorMode={colorMode} handle={handle} />
        </ReactFlowProvider>,
    );

    return {
        fit: () => handle.current?.fit(),
        unmount: () => root.unmount(),
    };
}
