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
 * An image view is one node holding its picture at its natural size, or the
 * "Image not available" placeholder (spec 12). A view that cannot be drawn
 * shows an error panel in place of the canvas (spec 13).
 *
 * A step is drawn as opacity on whole nodes and edges, text and
 * icon included, eased over 200 ms or instant under reduced motion; hidden
 * items are inert. With `structurizr.zoomOnAnimation` each step is fitted,
 * and the view again on stop (spec 11).
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
import {
    type Presence,
    PRESENCE_OPACITY,
    type StepState,
    stepStateOf,
    TRANSITION_MS,
} from "./animation";
import { canvasMeasure, diagramFontFamily, whenFontLoads } from "./fonts";
import {
    type BoundaryBox,
    type Bounds,
    buildGraph,
    type ColorScheme,
    type EdgeLine,
    type ElementBox,
    fitMaxZoom,
    type Graph,
    type GraphImage,
    type ImageState,
    imageBox,
    type Labels,
    readyFor,
    stepZoom,
    zoomLimits,
} from "./graph";

export type IslandState = {
    key: string;
    scheme: ColorScheme;
    labels: Labels;
    /** The step of the animation shown, or null for the full view (spec 11). */
    step: number | null;
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
    /** Escape on the canvas: stops the animation (spec 6.2, 11). */
    onEscape(): void;
};

/** Fraction of the container left around a fitted view. */
const FIT_PADDING = 0.05;

/**
 * Tell the workspace author about a problem in what they wrote: an element
 * whose label overflows (spec 9.1), a relationship that cannot be routed
 * (spec 10.6) or an image view that cannot be drawn (spec 13). The one console call in shipped code, a deliberate exception to
 * CODING_STANDARDS.md: the page has nowhere else to report an authoring
 * problem.
 */
function warnAuthor(message: string) {
    console.warn(message);
}

type BoxNode = Node<ElementBox, "box">;
type BoundaryNode = Node<BoundaryBox, "boundary">;
type ImageNode = Node<{ src: string; alt: string }, "image">;
type PlaceholderNode = Node<{ color: string }, "placeholder">;
type DiagramNode = BoxNode | BoundaryNode | ImageNode | PlaceholderNode;
type LineEdge = Edge<
    EdgeLine & { presence: Presence; transition: string | undefined },
    "line"
>;

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
                // Spec 9.1 asks for a warning when name and metadata overflow.
                warnAuthor(
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

/**
 * How a node or edge is drawn at a step (spec 11): real opacity
 * over the whole of it, text and icon included, and no pointer events once
 * it is hidden. `transition` eases the change, or is undefined under reduced
 * motion.
 */
const presenceStyle = (presence: Presence, transition: string | undefined) => ({
    opacity: PRESENCE_OPACITY[presence],
    transition,
    pointerEvents: presence === "hidden" ? ("none" as const) : undefined,
});

/** The CSS transition for opacity, or none under reduced motion. */
const opacityTransition = (reduced: boolean) =>
    reduced ? undefined : `opacity ${TRANSITION_MS}ms ease`;

/**
 * The media query for a reader who asks for reduced motion: opacity and
 * viewport changes are then instant rather than eased (spec 11).
 */
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

const subscribeReducedMotion = (callback: () => void) => {
    const query = window.matchMedia(REDUCED_MOTION);
    query.addEventListener("change", callback);
    return () => query.removeEventListener("change", callback);
};

/** Whether the reader asks for reduced motion, kept up to date. */
const useReducedMotion = () =>
    useSyncExternalStore(
        subscribeReducedMotion,
        () => window.matchMedia(REDUCED_MOTION).matches,
    );

/**
 * `nodes` as `stepState` shows them: a faded or hidden element or boundary
 * takes its opacity on React Flow's own wrapper, so its label and icon fade
 * with it, and a hidden one is inert, out of the tab order and the
 * accessibility tree (spec 11). Image nodes never animate.
 */
function withPresence(
    nodes: DiagramNode[],
    stepState: StepState | undefined,
    transition: string | undefined,
): DiagramNode[] {
    if (!stepState) return nodes;
    return nodes.map((node) => {
        const presence =
            node.type === "box"
                ? stepState.elements[node.id]
                : node.type === "boundary"
                  ? stepState.boundaries[node.data.id]
                  : undefined;
        if (!presence) return node;
        return {
            ...node,
            style: presenceStyle(presence, transition),
            ...(presence === "hidden" && { domAttributes: { inert: true } }),
        };
    });
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
    const { thickness, labelBox, labelLines, presence, transition } = data;
    const hidden = presence === "hidden";

    return (
        <g
            data-relationship-id={data.id}
            data-order={data.order}
            aria-hidden={hidden || undefined}
            style={presenceStyle(presence, transition)}
        >
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
                        inert={hidden || undefined}
                        style={{
                            ...presenceStyle(presence, transition),
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

/**
 * An image view's picture at its natural size, never upscaled and with no
 * chrome (spec 12). The node takes no input and a drag on it pans.
 */
function ImagePicture({ data, width, height }: NodeProps<ImageNode>) {
    return (
        <img
            data-image-view=""
            src={data.src}
            alt={data.alt}
            width={width}
            height={height}
            draggable={false}
            style={{ display: "block", pointerEvents: "none" }}
        />
    );
}

/** What an image view draws when its picture cannot be shown (spec 12). */
function ImagePlaceholder({ data }: NodeProps<PlaceholderNode>) {
    return (
        <div
            data-image-unavailable=""
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: data.color,
                fontSize: 24,
                pointerEvents: "none",
            }}
        >
            Image not available
        </div>
    );
}

/**
 * One loading state for every render, so the nodes and bounds memoized on
 * it stay put; a fresh object each time rebuilt every view's nodes on every
 * render, which is how a ResizeObserver loop reached the console.
 */
const LOADING: ImageState = { status: "loading" };

/**
 * Where an image view's picture is: loading, loaded with its natural size,
 * or failed with the reason, which is logged once (spec 12). A new `src`, as
 * after `setColorScheme`, starts loading again. Loading for every other view.
 */
function useImage(key: string, picture: GraphImage | undefined): ImageState {
    const src = picture?.src;
    /** Which view and variant a state belongs to; any other is stale. */
    const subject = picture ? `${key}\n${src ?? ""}` : null;
    const [state, setState] = useState<{
        subject: string | null;
        image: ImageState;
    }>({ subject: null, image: LOADING });

    useEffect(() => {
        if (subject === null) return;
        const fail = (reason: string) => {
            // Spec 13 asks for a warning when an image cannot be drawn.
            warnAuthor(`Image view "${key}": ${reason}`);
            setState({ subject, image: { status: "failed", reason } });
        };
        if (src === undefined) {
            fail("it has no content, contentLight or contentDark.");
            return;
        }
        const image = new Image();
        image.onload = () => {
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                setState({
                    subject,
                    image: {
                        status: "loaded",
                        src,
                        width: image.naturalWidth,
                        height: image.naturalHeight,
                    },
                });
            } else {
                fail("its image has no size.");
            }
        };
        image.onerror = () =>
            fail(
                /^https?:/i.test(src)
                    ? `${src} could not be loaded; the build did not inline it.`
                    : "its image could not be decoded.",
            );
        image.src = src;
        return () => {
            image.onload = null;
            image.onerror = null;
        };
    }, [subject, key, src]);

    return subject !== null && state.subject === subject
        ? state.image
        : LOADING;
}

/** What an image view's one node is in every state: at the origin, inert. */
const STATIC_NODE_PROPS = {
    position: { x: 0, y: 0 },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
};

/** What the canvas draws for a view, and the bounds it fits. */
type Drawing = { nodes: DiagramNode[]; bounds: Bounds | undefined };

/** Nothing to draw and nothing to fit, as for a missing view. */
const NOTHING: Drawing = { nodes: [], bounds: undefined };

/**
 * What the canvas draws for `graph`. An image view draws nothing but its
 * picture, or the placeholder once it has failed, and fits that box; nothing
 * while it loads (spec 12). Any other view draws its boundaries and elements
 * and fits its bounds.
 */
function drawingOf(graph: Graph | undefined, image: ImageState): Drawing {
    if (!graph) return NOTHING;
    if (!graph.image) return { nodes: toNodes(graph), bounds: graph.bounds };
    const box = imageBox(graph.image, graph.color, image);
    if (!box) return NOTHING;
    return {
        nodes: [{ ...STATIC_NODE_PROPS, id: "image", ...box }],
        bounds: { x: 0, y: 0, width: box.width, height: box.height },
    };
}

/**
 * The error panel (spec 13): replaces the canvas for this view only, naming
 * what is wrong, in the scheme's colors. Nothing is thrown out of the island.
 */
function ViewError({ graph }: { graph: Graph }) {
    return (
        <div
            data-view-error=""
            role="alert"
            style={{
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                padding: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                color: graph.color,
                fontSize: 16,
            }}
        >
            {graph.error}
        </div>
    );
}

const nodeTypes = {
    box: BoxElement,
    boundary: BoundaryElement,
    image: ImagePicture,
    placeholder: ImagePlaceholder,
};
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

function toEdges(
    graph: Graph,
    stepState: StepState | undefined,
    transition: string | undefined,
): LineEdge[] {
    return graph.edges.map((edge) => ({
        id: edge.key,
        type: "line",
        source: edge.sourceId,
        target: edge.targetId,
        data: {
            ...edge,
            presence: stepState?.edges[edge.key] ?? "shown",
            transition,
        },
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
    onEscape,
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
    const { key: viewKey, scheme, labels, step } = state;
    // A new step is not a new graph: nothing is laid out again (spec 11).
    const graph = useMemo(
        () => buildGraph(model, viewKey, scheme, labels, measure),
        [model, viewKey, scheme, labels, measure],
    );
    const image = useImage(viewKey, graph?.image);
    const reducedMotion = useReducedMotion();
    const transition = opacityTransition(reducedMotion);
    const stepState = useMemo(
        () => (graph ? stepStateOf(graph, step) : undefined),
        [graph, step],
    );
    // An image view is fitted to its picture once its size is known.
    const drawing = useMemo(() => drawingOf(graph, image), [graph, image]);
    const { bounds } = drawing;
    const nodes = useMemo(
        () => withPresence(drawing.nodes, stepState, transition),
        [drawing, stepState, transition],
    );
    const edges = useMemo(
        () => (graph ? toEdges(graph, stepState, transition) : []),
        [graph, stepState, transition],
    );

    // Each authoring problem once per visit, however often the view redraws
    // (a scheme or label change rebuilds the graph).
    const warned = useRef(new Set<string>());
    useEffect(() => {
        for (const warning of graph?.warnings ?? []) {
            if (warned.current.has(warning)) continue;
            warned.current.add(warning);
            // Spec 10.6 asks for a warning naming the relationship.
            warnAuthor(warning);
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

    const fitted = useMemo(
        () =>
            graph &&
            bounds &&
            size.width > 0 &&
            size.height > 0 &&
            bounds.width > 0
                ? getViewportForBounds(
                      bounds,
                      size.width,
                      size.height,
                      0,
                      fitMaxZoom(graph),
                      FIT_PADDING,
                  )
                : null,
        [graph, bounds, size],
    );
    const zoom = useStore((flowState) => flowState.transform[2]);
    const { floor, ceiling } = zoomLimits(
        fitted?.zoom ?? null,
        zoom,
        moved.current,
    );

    // With structurizr.zoomOnAnimation, a step is fitted to its elements
    // (spec 11), however far in that takes the canvas.
    const zoomOnAnimation = graph?.animation?.zoom === true;
    const focus =
        zoomOnAnimation && step !== null ? stepState?.focus : undefined;
    const stepFitted = useMemo(
        () =>
            graph && focus && size.width > 0 && size.height > 0
                ? getViewportForBounds(
                      focus,
                      size.width,
                      size.height,
                      0,
                      Math.min(fitMaxZoom(graph), ceiling),
                      FIT_PADDING,
                  )
                : null,
        [graph, focus, size, ceiling],
    );
    /**
     * Where a resize or a redraw refits to: the current step with
     * zoomOnAnimation, else the whole view. Read through a ref, so a step
     * change alone never runs the refit below; the step effect eases it.
     */
    const refitTo = useRef(fitted);
    refitTo.current = stepFitted ?? fitted;

    const fit = useCallback(() => {
        moved.current = false;
        if (fitted) flow.setViewport(fitted);
    }, [flow, fitted]);

    // zoomOnAnimation fits each step and the whole view on stop, overriding
    // the reader's viewport; otherwise a step never moves it (spec 11). A
    // step that changes with the view is left to the new view's own fit, so
    // the outgoing view is never refitted on its way out.
    const shownStep = useRef({ viewKey, step });
    useEffect(() => {
        const shown = shownStep.current;
        if (shown.viewKey === viewKey && shown.step === step) return;
        shownStep.current = { viewKey, step };
        if (shown.viewKey !== viewKey || !zoomOnAnimation) return;
        const viewport = step === null ? fitted : stepFitted;
        if (!viewport) return;
        moved.current = false;
        flow.setViewport(viewport, {
            duration: reducedMotion ? 0 : TRANSITION_MS,
        });
    }, [
        viewKey,
        step,
        zoomOnAnimation,
        fitted,
        stepFitted,
        flow,
        reducedMotion,
    ]);

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
        const viewport = refitTo.current;
        if (viewport && !moved.current) flow.setViewport(viewport);
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
            role="group"
            aria-label={graph?.title}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas takes focus so its keys act only while it has it (spec 6.2)
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === "Escape") onEscape();
            }}
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
                {graph?.error ? (
                    <ViewError graph={graph} />
                ) : (
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
                )}
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
