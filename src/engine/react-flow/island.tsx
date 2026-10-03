/**
 * The React island: one React Flow canvas drawing the geometry `graph.ts`
 * computed. Everything React stays in this file and `index.ts`; the page
 * talks to it through the `Engine` handle only (ADR 3).
 *
 * Only React `style` props and class names are used, never a runtime
 * `<style>` or `setAttribute("style")`, so the CSP stays what the output
 * already needs (spec 9.7).
 */

import {
    BaseEdge,
    ConnectionMode,
    type Edge,
    type EdgeProps,
    EdgeLabelRenderer,
    getViewportForBounds,
    Handle,
    MarkerType,
    type Node,
    type NodeProps,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    useStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type { WorkspaceModel } from "../../model";
import {
    buildGraph,
    type ColorScheme,
    type EdgeLine,
    type ElementBox,
    type Graph,
    type Labels,
    readyFor,
    stepZoom,
    zoomLimits,
} from "./graph";

export type IslandState = {
    key: string;
    scheme: ColorScheme;
    labels: Labels;
};

/** A tiny external store: the handle writes, the island reads. */
export class IslandStore {
    #state: IslandState;
    #listeners = new Set<() => void>();

    constructor(state: IslandState) {
        this.#state = state;
    }

    get = () => this.#state;

    set(patch: Partial<IslandState>) {
        this.#state = { ...this.#state, ...patch };
        for (const listener of this.#listeners) listener();
    }

    subscribe = (listener: () => void) => {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    };
}

/** Commands the handle forwards; filled in once the canvas is mounted. */
export type IslandCommands = {
    fit(): void;
    zoomIn(): void;
    zoomOut(): void;
};

type IslandProps = {
    model: WorkspaceModel;
    store: IslandStore;
    commands: IslandCommands;
    /** Called once per view, after it has been fitted and painted. */
    onPainted(key: string): void;
};

/** Fraction of the container left around a fitted view. */
const FIT_PADDING = 0.05;

type BoxNode = Node<ElementBox, "box">;
type LineEdge = Edge<EdgeLine, "line">;

/** Names and descriptions break on a real newline and on a literal `\n` (spec 9.3). */
const unescapeNewlines = (text: string) => text.replace(/\\n/g, "\n");

function BoxElement({ data }: NodeProps<BoxNode>) {
    const fullText = [data.name, data.metadata, data.description]
        .filter(Boolean)
        .join("\n");

    return (
        <div
            data-element-id={data.id}
            data-shape={data.shape}
            title={fullText}
            aria-label={fullText}
            style={{
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                background: data.background,
                border: `${data.strokeWidth}px ${data.border.toLowerCase()} ${data.stroke}`,
                color: data.color,
                fontSize: data.fontSize,
                lineHeight: 1.2,
                padding: "0 30px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                overflow: "hidden",
            }}
        >
            {/* React Flow drops every edge of a node without a handle (#23). */}
            <Handle
                type="source"
                position={Position.Top}
                isConnectable={false}
                style={{ opacity: 0, pointerEvents: "none" }}
            />
            <div
                style={{
                    fontWeight: "bold",
                    fontSize: data.fontSize * 1.4,
                    whiteSpace: "pre-line",
                    marginBottom: 8,
                }}
            >
                {unescapeNewlines(data.name)}
            </div>
            {data.metadata && (
                <div style={{ fontSize: data.fontSize * 0.7 }}>
                    {data.metadata}
                </div>
            )}
            {data.description && (
                <div
                    style={{
                        marginTop: 15,
                        whiteSpace: "pre-line",
                        overflow: "hidden",
                    }}
                >
                    {unescapeNewlines(data.description)}
                </div>
            )}
        </div>
    );
}

/** The scheme's canvas color, which edge labels are backed with. */
const CanvasBackground = createContext("#ffffff");

const dashes = (style: EdgeLine["style"], t: number) =>
    style === "Dashed"
        ? `${4 * t} ${4 * t}`
        : style === "Dotted"
          ? `${t} ${2 * t}`
          : undefined;

function StraightEdge({ id, data, markerEnd }: EdgeProps<LineEdge>) {
    const background = useContext(CanvasBackground);
    if (!data) return null;
    const { source, target, thickness } = data;
    const path = `M ${source.x},${source.y} L ${target.x},${target.y}`;
    const mid = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };

    return (
        <g data-relationship-id={data.id}>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={{
                    stroke: data.color,
                    strokeWidth: thickness,
                    strokeDasharray: dashes(data.style, thickness),
                    strokeLinecap:
                        data.style === "Dotted" ? "round" : undefined,
                    opacity: data.opacity,
                }}
            />
            {data.label && (
                <EdgeLabelRenderer>
                    <div
                        data-relationship-label={data.id}
                        style={{
                            position: "absolute",
                            transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
                            maxWidth: data.labelWidth,
                            fontSize: data.fontSize,
                            lineHeight: 1.2,
                            color: data.color,
                            background,
                            whiteSpace: "pre-line",
                            textAlign: "center",
                            padding: 4,
                        }}
                    >
                        {unescapeNewlines(data.label)}
                    </div>
                </EdgeLabelRenderer>
            )}
        </g>
    );
}

const nodeTypes = { box: BoxElement };
const edgeTypes = { line: StraightEdge };
const proOptions = { hideAttribution: true };
const nodeOrigin: [number, number] = [0, 0];
const zoomKeys = ["Meta", "Control"];

function toNodes(graph: Graph): BoxNode[] {
    return graph.elements.map((element) => ({
        id: element.id,
        type: "box",
        position: { x: element.x, y: element.y },
        width: element.width,
        height: element.height,
        data: element,
        draggable: false,
        selectable: false,
        connectable: false,
        // The hidden handle's box, given up front so edges render without
        // waiting for React Flow to measure it (React Flow's server-side
        // rendering path). The edge draws its own geometry anyway.
        handles: [
            {
                type: "source" as const,
                position: Position.Top,
                x: element.width / 2,
                y: 0,
                width: 1,
                height: 1,
            },
        ],
    }));
}

function toEdges(graph: Graph): LineEdge[] {
    return graph.edges.map((edge) => ({
        id: edge.key,
        type: "line",
        source: edge.sourceId,
        target: edge.targetId,
        data: edge,
        selectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.color },
    }));
}

function Canvas({ model, store, commands, onPainted }: IslandProps) {
    const state = useSyncExternalStore(store.subscribe, store.get);
    const graph = useMemo(
        () => buildGraph(model, state.key, state.scheme, state.labels),
        [model, state],
    );
    const nodes = useMemo(() => (graph ? toNodes(graph) : []), [graph]);
    const edges = useMemo(() => (graph ? toEdges(graph) : []), [graph]);

    const flow = useReactFlow();
    const wrapper = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    /** The key of the last view fully painted; `data-ready` is true only for it. */
    const [readyKey, setReadyKey] = useState<string | null>(null);
    /** Set once the reader zooms or pans; refits on resize stop until `fit()`. */
    const moved = useRef(false);
    const painted = useRef<string | null>(null);

    useEffect(() => {
        const element = wrapper.current;
        if (!element) return;
        const measure = () =>
            setSize({
                width: element.clientWidth,
                height: element.clientHeight,
            });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const bounds = graph?.bounds;
    const fitted = useMemo(
        () =>
            bounds && size.width > 0 && size.height > 0 && bounds.width > 0
                ? getViewportForBounds(
                      bounds,
                      size.width,
                      size.height,
                      0,
                      Number.POSITIVE_INFINITY,
                      FIT_PADDING,
                  )
                : null,
        [bounds, size],
    );
    const zoom = useStore((flowState) => flowState.transform[2]);
    const { floor, ceiling } = zoomLimits(
        fitted?.zoom ?? null,
        zoom,
        moved.current,
    );

    const fit = useCallback(() => {
        moved.current = false;
        if (fitted) flow.setViewport(fitted);
    }, [flow, fitted]);

    useEffect(() => {
        commands.fit = fit;
        commands.zoomIn = () => {
            moved.current = true;
            flow.zoomTo(stepZoom(flow.getZoom(), "in", floor, ceiling));
        };
        commands.zoomOut = () => {
            moved.current = true;
            flow.zoomTo(stepZoom(flow.getZoom(), "out", floor, ceiling));
        };
    }, [commands, fit, flow, floor, ceiling]);

    // A new view starts fitted, whatever the reader did to the last one.
    const key = graph?.key;
    useEffect(() => {
        if (key === undefined) return;
        moved.current = false;
    }, [key]);

    // Fit on every view change and container resize until the reader moves.
    // A view with nothing drawable has nothing to fit, but is still painted.
    const empty = bounds !== undefined && !(bounds.width > 0);
    useEffect(() => {
        if (key === undefined || (!fitted && !empty)) return;
        if (fitted && !moved.current) flow.setViewport(fitted);
        if (painted.current === key) return;
        // The next frame is when the view is on screen. A hidden tab, or a
        // headless browser on virtual time, may never produce one; the
        // timer stands in for it there, so mounting cannot hang.
        const done = () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
            painted.current = key;
            setReadyKey(key);
            onPainted(key);
        };
        const frame = requestAnimationFrame(done);
        const timer = setTimeout(done, 100);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [fitted, empty, key, flow, onPainted]);

    return (
        <div
            ref={wrapper}
            data-view-key={key ?? ""}
            data-ready={readyFor(key, readyKey) ? "true" : "false"}
            style={{
                width: "100%",
                height: "100%",
                background: graph?.background,
            }}
        >
            <CanvasBackground.Provider value={graph?.background ?? "#ffffff"}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    nodeOrigin={nodeOrigin}
                    connectionMode={ConnectionMode.Loose}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    nodesFocusable={false}
                    edgesFocusable={false}
                    elementsSelectable={false}
                    panOnDrag
                    panOnScroll
                    zoomOnScroll={false}
                    zoomOnPinch
                    zoomOnDoubleClick={false}
                    zoomActivationKeyCode={zoomKeys}
                    minZoom={floor}
                    maxZoom={ceiling}
                    colorMode={state.scheme}
                    proOptions={proOptions}
                    onMoveStart={(event) => {
                        // Programmatic moves carry no event; only the reader's do.
                        if (event) moved.current = true;
                    }}
                />
            </CanvasBackground.Provider>
        </div>
    );
}

export function Island(props: IslandProps) {
    return (
        <ReactFlowProvider>
            <Canvas {...props} />
        </ReactFlowProvider>
    );
}
