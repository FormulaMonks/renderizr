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
    type RefObject,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type { WorkspaceModel } from "../../model";
import {
    breakLines,
    DESCRIPTION_GAP,
    type FixedHeights,
    fitLabel,
    ICON_LAYOUTS,
    ICON_SIZE,
    LINE_HEIGHT,
    labelText,
    METADATA_SCALE,
    NAME_GAP,
    NAME_SCALE,
    SIDE_PADDING,
    textWidth,
} from "../geometry/label";
import { paintPart } from "../geometry/paint";
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
    onPainted(key: string, graph: Graph): void;
};

/** Fraction of the container left around a fitted view. */
const FIT_PADDING = 0.05;

type BoxNode = Node<ElementBox, "box">;
type LineEdge = Edge<EdgeLine, "line">;

type ElementLabelProps = Pick<
    ElementBox,
    | "id"
    | "content"
    | "name"
    | "metadata"
    | "description"
    | "icon"
    | "iconPosition"
    | "fontSize"
    | "color"
>;

type FixedPartsProps = {
    name: string;
    metadata: string;
    fontSize: number;
    nameRef: RefObject<HTMLDivElement | null>;
    metadataRef: RefObject<HTMLDivElement | null>;
};

/** The name and the metadata under it: the label's fixed text parts. */
function FixedParts({
    name,
    metadata,
    fontSize,
    nameRef,
    metadataRef,
}: FixedPartsProps) {
    return (
        <>
            <div
                ref={nameRef}
                style={{
                    flexShrink: 0,
                    fontWeight: "bold",
                    fontSize: fontSize * NAME_SCALE,
                    whiteSpace: "pre-line",
                }}
            >
                {breakLines(name)}
            </div>
            {metadata && (
                <div
                    ref={metadataRef}
                    style={{
                        flexShrink: 0,
                        marginTop: NAME_GAP,
                        fontSize: fontSize * METADATA_SCALE,
                    }}
                >
                    {metadata}
                </div>
            )}
        </>
    );
}

/** The rendered heights of a name block and an optional metadata block. */
const heightsOf = (
    name: HTMLElement,
    metadata: HTMLElement | null,
): FixedHeights => ({
    name: name.offsetHeight,
    metadata: metadata?.offsetHeight,
});

/**
 * The label template (spec 9.2): icon, name, metadata and description in a
 * vertically centered column, or a row beside a Left icon, laid over the
 * content area. Content never resizes the element (spec 9.1): the fixed
 * parts are measured and `fitLabel` says whether the icon stays and how many
 * description lines fit. All text goes in as React text, never as HTML.
 *
 * The icon is judged by the fixed parts at the text width it leaves, whether
 * it is drawn or not, so a dropped icon comes back once they shrink. Only a
 * dropped Left icon changes that width, so only then is a hidden copy of the
 * fixed parts kept at the narrower width to measure.
 */
function ElementLabel({
    id,
    content,
    name,
    metadata,
    description,
    icon,
    iconPosition,
    fontSize,
    color,
}: ElementLabelProps) {
    const layout = ICON_LAYOUTS[iconPosition];
    const nameRef = useRef<HTMLDivElement>(null);
    const metadataRef = useRef<HTMLDivElement>(null);
    const probeNameRef = useRef<HTMLDivElement>(null);
    const probeMetadataRef = useRef<HTMLDivElement>(null);
    const [showIcon, setShowIcon] = useState(Boolean(icon));
    const [lines, setLines] = useState<number | undefined>(undefined);
    const warned = useRef(false);
    const probing = Boolean(icon) && !showIcon && layout.inset > 0;

    // Measure again whenever the fixed parts change size, which is also how
    // a late web font reflows the label (spec 9.5).
    useLayoutEffect(() => {
        const nameBlock = nameRef.current;
        if (!nameBlock) return;
        const measure = () => {
            const drawn = heightsOf(nameBlock, metadataRef.current);
            const probe = probeNameRef.current;
            const fit = fitLabel({
                height: content.height,
                fontSize,
                iconPosition,
                ...drawn,
                withIcon: !icon
                    ? undefined
                    : probe
                      ? heightsOf(probe, probeMetadataRef.current)
                      : drawn,
                description: Boolean(description),
            });
            // A Left icon changes the text width, so the heights just read
            // are stale: draw the icon as decided and measure again.
            if (fit.icon !== showIcon) return setShowIcon(fit.icon);
            setLines(fit.descriptionLines);
            if (fit.overflows && !warned.current) {
                warned.current = true;
                // The one console call in shipped code: spec 9.1 asks for a
                // warning when name and metadata overflow, and the page has
                // nowhere else to report a workspace authoring problem.
                console.warn(
                    `Element ${id} ("${name}"): its name and metadata do not fit its ${content.width}×${content.height} content area.`,
                );
            }
        };
        measure();
        const observer = new ResizeObserver(measure);
        const blocks = [
            nameBlock,
            metadataRef.current,
            probeNameRef.current,
            probeMetadataRef.current,
        ];
        for (const block of blocks) if (block) observer.observe(block);
        return () => observer.disconnect();
    }, [
        content,
        description,
        fontSize,
        icon,
        iconPosition,
        id,
        name,
        showIcon,
    ]);

    const beside = showIcon && layout.beside;
    const image = showIcon && icon && (
        <img
            src={icon}
            alt=""
            style={{
                flexShrink: 0,
                width: beside ? ICON_SIZE : "100%",
                height: ICON_SIZE,
                objectFit: "contain",
                marginTop: layout.margin.top,
                marginBottom: layout.margin.bottom,
                marginRight: layout.margin.right,
            }}
        />
    );
    const column = {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowWrap: "break-word",
    } as const;

    return (
        <div
            data-element-label=""
            style={{
                position: "absolute",
                left: content.x,
                top: content.y,
                width: content.width,
                height: content.height,
                boxSizing: "border-box",
                padding: `0 ${SIDE_PADDING}px`,
                display: "flex",
                flexDirection: beside ? "row" : "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                color,
                fontSize,
                lineHeight: LINE_HEIGHT,
            }}
        >
            {probing && (
                <div
                    aria-hidden="true"
                    style={{
                        ...column,
                        position: "absolute",
                        visibility: "hidden",
                        width: textWidth(content.width, iconPosition, true),
                    }}
                >
                    <FixedParts
                        name={name}
                        metadata={metadata}
                        fontSize={fontSize}
                        nameRef={probeNameRef}
                        metadataRef={probeMetadataRef}
                    />
                </div>
            )}
            {!layout.after && image}
            <div
                style={{
                    ...column,
                    flexShrink: 0,
                    width: textWidth(content.width, iconPosition, showIcon),
                }}
            >
                <FixedParts
                    name={name}
                    metadata={metadata}
                    fontSize={fontSize}
                    nameRef={nameRef}
                    metadataRef={metadataRef}
                />
                {description && lines !== 0 && (
                    <div
                        data-element-description=""
                        style={{
                            flexShrink: 0,
                            marginTop: DESCRIPTION_GAP,
                            whiteSpace: "pre-line",
                            overflow: "hidden",
                            // Unclamped only until the first measurement, which
                            // runs before paint, so that state is never seen.
                            ...(lines !== undefined && {
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                WebkitLineClamp: lines,
                            }),
                        }}
                    >
                        {breakLines(description)}
                    </div>
                )}
            </div>
            {layout.after && image}
        </div>
    );
}

/**
 * One element: its shape's parts in SVG behind the HTML label template, each
 * painted by its role. Opacity is real alpha on the parts' fill and stroke,
 * applied to them as one group so overlapping parts show no seams, and the
 * label and icon stay opaque (spec 9.4).
 */
function BoxElement({ data }: NodeProps<BoxNode>) {
    const fullText = labelText(data.name, data.metadata, data.description);

    return (
        <div
            data-element-id={data.id}
            data-shape={data.shape}
            title={fullText}
            aria-label={fullText}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            {/* React Flow drops every edge of a node without a handle (#23). */}
            <Handle
                type="source"
                position={Position.Top}
                isConnectable={false}
                style={{ opacity: 0, pointerEvents: "none" }}
            />
            <svg
                aria-hidden="true"
                width={data.width}
                height={data.height}
                style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    overflow: "visible",
                }}
            >
                <g opacity={data.opacity}>
                    {data.parts.map((part, index) => (
                        <path
                            // biome-ignore lint/suspicious/noArrayIndexKey: a shape's parts are a fixed list, drawn back to front
                            key={index}
                            data-paint={part.paint}
                            d={part.d}
                            {...paintPart(part.paint, data)}
                        />
                    ))}
                </g>
            </svg>
            {/* A new name, metadata or icon is a new label: its fitting
                starts over from the icon drawn. */}
            <ElementLabel
                key={[data.name, data.metadata, data.icon].join("\n")}
                {...data}
            />
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
    const path = data.route
        .map((point, at) => `${at ? "L" : "M"} ${point.x},${point.y}`)
        .join(" ");
    const mid = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };

    return (
        <g data-relationship-id={data.id} data-order={data.order}>
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
                        {breakLines(data.label)}
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
            if (graph) onPainted(key, graph);
        };
        const frame = requestAnimationFrame(done);
        const timer = setTimeout(done, 100);
        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(timer);
        };
    }, [fitted, empty, key, flow, onPainted, graph]);

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
