/**
 * The React island: one React Flow canvas drawing the geometry `graph.ts`
 * computed. Everything React stays in this file and `index.ts`; the page
 * talks to it through the `Engine` handle only (ADR 3).
 *
 * Boundaries are nodes too, drawn below every element, outer below inner,
 * and below the edges (spec 8). Their boxes are derived before React renders
 * with text measured on a canvas in the diagram font, and derived once more
 * when that font's faces load (spec 9.5).
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
import type { TextBlock } from "../geometry/boundary";
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
import { EDGE_LABEL_PADDING, TECHNOLOGY_GAP } from "../geometry/edge-label";
import { borderDashes, paintPart } from "../geometry/paint";
import { lineDashes } from "../geometry/line";
import { canvasMeasure, diagramFontFamily, whenFontLoads } from "./fonts";
import {
    type BoundaryBox,
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
    /** The `--font` family, or null for the fallback stack alone. */
    font: string | null;
    /** Called once per view, after it has been fitted and painted. */
    onPainted(key: string, graph: Graph): void;
    /** Called when a painted view is drawn again, as after the font swap. */
    onRedrawn(graph: Graph): void;
};

/** Fraction of the container left around a fitted view. */
const FIT_PADDING = 0.05;

type BoxNode = Node<ElementBox, "box">;
type BoundaryNode = Node<BoundaryBox, "boundary">;
type LineEdge = Edge<EdgeLine, "line">;

type ElementLabelProps = Pick<
    ElementBox,
    | "id"
    | "content"
    | "labelHeight"
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
    labelHeight,
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
                height: labelHeight,
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
                // A console call in shipped code: spec 9.1 asks for a
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
        labelHeight,
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
            {data.instances && (
                <TextLines
                    block={data.instances}
                    bold
                    color={data.color}
                    instanceCount
                />
            )}
        </div>
    );
}

type TextLinesProps = {
    block: TextBlock;
    bold?: boolean;
    color: string;
    /** How far down the box the container the block is drawn in starts. */
    top?: number;
    /** Marks a deployment node's `x<instances>`. */
    instanceCount?: boolean;
};

/**
 * Lines already broken by the geometry (spec 8), one per row, so what is
 * drawn is exactly what was measured: nothing may wrap them again.
 */
function TextLines({
    block,
    bold,
    color,
    top = 0,
    instanceCount,
}: TextLinesProps) {
    return (
        <div
            data-instance-count={instanceCount ? "" : undefined}
            style={{
                position: "absolute",
                left: block.x,
                top: block.y - top,
                width: block.width,
                fontSize: block.fontSize,
                fontWeight: bold ? "bold" : undefined,
                lineHeight: LINE_HEIGHT,
                whiteSpace: "pre",
                color,
            }}
        >
            {block.lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: wrapped lines are a fixed list, top to bottom
                <div key={index}>{line}</div>
            ))}
        </div>
    );
}

/**
 * A boundary: a rectangle around its children with the label band along its
 * bottom (spec 8). Only the band takes pointer events; empty boundary area
 * lets a drag through to pan. Opacity is real alpha on fill and stroke; the
 * label and icon stay opaque, as on elements.
 */
function BoundaryElement({ data }: NodeProps<BoundaryNode>) {
    const { band } = data;
    const label = [data.name.lines.join(" "), data.metadata?.lines.join(" ")]
        .filter(Boolean)
        .join("\n");
    return (
        <div
            data-boundary-id={data.id}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                pointerEvents: "none",
            }}
        >
            {/* No handle: no edge ends at a boundary (spec 10.6). */}
            <svg
                aria-hidden="true"
                width={data.width}
                height={data.height}
                style={{ position: "absolute", overflow: "visible" }}
            >
                <rect
                    width={data.width}
                    height={data.height}
                    rx={data.radius}
                    ry={data.radius}
                    fill={data.background}
                    stroke={data.stroke}
                    strokeWidth={data.strokeWidth}
                    strokeDasharray={borderDashes(
                        data.border,
                        data.strokeWidth,
                    )}
                    opacity={data.opacity}
                />
            </svg>
            <div
                data-boundary-label=""
                title={label}
                style={{
                    position: "absolute",
                    left: band.x,
                    top: band.y,
                    width: band.width,
                    height: band.height,
                    pointerEvents: "auto",
                }}
            >
                {data.icon && data.iconBox && (
                    <img
                        src={data.icon}
                        alt=""
                        style={{
                            position: "absolute",
                            left: data.iconBox.x,
                            top: data.iconBox.y - band.y,
                            width: data.iconBox.width,
                            height: data.iconBox.height,
                            objectFit: "contain",
                        }}
                    />
                )}
                <TextLines
                    block={data.name}
                    bold
                    color={data.color}
                    top={band.y}
                />
                {data.metadata && (
                    <TextLines
                        block={data.metadata}
                        color={data.color}
                        top={band.y}
                    />
                )}
                {data.instances && (
                    <TextLines
                        block={data.instances}
                        bold
                        color={data.color}
                        top={band.y}
                        instanceCount
                    />
                )}
            </div>
        </div>
    );
}

/** The scheme's canvas color, which edge labels are backed with. */
const CanvasBackground = createContext("#ffffff");

/**
 * One edge in any routing mode, drawn from the path data the router wrote
 * (spec 10.1): React Flow's own path helpers take no vertices. The line and
 * its arrowhead share one `<g opacity>`, so the alpha is real and not doubled
 * where they overlap; the label's text takes the same alpha over an opaque
 * backing in the canvas color (spec 10.10).
 */
function RouteEdge({ id, data }: EdgeProps<LineEdge>) {
    const background = useContext(CanvasBackground);
    if (!data) return null;
    const { thickness, labelBox, labelLines } = data;

    return (
        <g data-relationship-id={data.id} data-order={data.order}>
            <g opacity={data.opacity}>
                <BaseEdge
                    id={id}
                    path={data.path}
                    style={{
                        stroke: data.color,
                        strokeWidth: thickness,
                        strokeDasharray: lineDashes(data.style, thickness),
                        strokeLinecap:
                            data.style === "Dotted" ? "round" : undefined,
                    }}
                />
                <path
                    data-arrowhead=""
                    d={data.arrowhead}
                    fill={data.color}
                    stroke="none"
                />
            </g>
            {labelBox && labelLines && (
                <EdgeLabelRenderer>
                    {/* Exactly the box placement kept clear, holding exactly
                        the lines it was measured from: the browser never
                        wraps them again (spec 10.8). */}
                    <div
                        data-relationship-label={data.id}
                        style={{
                            position: "absolute",
                            transform: `translate(${labelBox.x}px, ${labelBox.y}px)`,
                            boxSizing: "border-box",
                            width: labelBox.width,
                            height: labelBox.height,
                            padding: EDGE_LABEL_PADDING,
                            lineHeight: LINE_HEIGHT,
                            color: data.color,
                            background,
                            textAlign: "center",
                            whiteSpace: "pre",
                        }}
                    >
                        {labelLines.description.length > 0 && (
                            <div
                                style={{
                                    fontSize: data.fontSize,
                                    opacity: data.opacity,
                                }}
                            >
                                {labelLines.description.map((line, i) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and never reorder
                                    <div key={i}>{line}</div>
                                ))}
                            </div>
                        )}
                        {labelLines.technology.length > 0 && (
                            <div
                                style={{
                                    fontSize: data.fontSize * METADATA_SCALE,
                                    marginTop: labelLines.description.length
                                        ? TECHNOLOGY_GAP
                                        : 0,
                                    opacity: data.opacity,
                                }}
                            >
                                {labelLines.technology.map((line, i) => (
                                    // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and never reorder
                                    <div key={i}>{line}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </EdgeLabelRenderer>
            )}
        </g>
    );
}

const nodeTypes = { box: BoxElement, boundary: BoundaryElement };
const edgeTypes = { line: RouteEdge };
const proOptions = { hideAttribution: true };
const nodeOrigin: [number, number] = [0, 0];
const zoomKeys = ["Meta", "Control"];

/**
 * Below the edges, which sit at 0, so an edge crossing a boundary is never
 * hidden by its fill; each level of nesting one higher.
 */
const BOUNDARY_Z = -1000;

function toBoundaryNodes(graph: Graph): BoundaryNode[] {
    return graph.boundaries.map((boundary) => ({
        id: `boundary:${boundary.id}`,
        type: "boundary",
        position: { x: boundary.x, y: boundary.y },
        width: boundary.width,
        height: boundary.height,
        zIndex: BOUNDARY_Z + boundary.depth,
        data: boundary,
        draggable: false,
        selectable: false,
        connectable: false,
    }));
}

/** Boundaries first, so that at equal depth they are drawn underneath. */
function toNodes(graph: Graph): (BoxNode | BoundaryNode)[] {
    return [...toBoundaryNodes(graph), ...toElementNodes(graph)];
}

function toElementNodes(graph: Graph): BoxNode[] {
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
    }));
}

function Canvas({
    model,
    store,
    commands,
    font,
    onPainted,
    onRedrawn,
}: IslandProps) {
    const state = useSyncExternalStore(store.subscribe, store.get);
    const family = diagramFontFamily(font);
    // Set once the --font faces load; a new measure re-derives the
    // boundaries with them (spec 9.5).
    const [fontsLoaded, setFontsLoaded] = useState(false);
    useEffect(
        () => whenFontLoads(document.fonts, font, () => setFontsLoaded(true)),
        [font],
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new measure once the faces load is what re-derives the boundaries
    const measure = useMemo(
        () => canvasMeasure(document, family),
        [family, fontsLoaded],
    );
    const graph = useMemo(
        () => buildGraph(model, state.key, state.scheme, state.labels, measure),
        [model, state, measure],
    );
    const nodes = useMemo(() => (graph ? toNodes(graph) : []), [graph]);
    const edges = useMemo(() => (graph ? toEdges(graph) : []), [graph]);

    // Each authoring problem once per visit, however often the view redraws
    // (a scheme or label change rebuilds the graph).
    const warned = useRef(new Set<string>());
    useEffect(() => {
        for (const warning of graph?.warnings ?? []) {
            if (warned.current.has(warning)) continue;
            warned.current.add(warning);
            // Spec 10.6 asks for a warning naming the relationship, and the
            // page has nowhere else to report a workspace authoring problem.
            console.warn(warning);
        }
    }, [graph]);

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

    // A view already painted and drawn again (a scheme, labels or the font
    // swap) keeps its report in step with what is on screen.
    useEffect(() => {
        if (graph && painted.current === graph.key) onRedrawn(graph);
    }, [graph, onRedrawn]);

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
                fontFamily: family,
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
