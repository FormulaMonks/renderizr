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
    type CSSProperties,
    type FocusEvent,
    type KeyboardEvent,
    type MouseEvent,
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
import type { Anchor } from "../contract";
import type { TextBlock } from "../geometry/boundary";
import {
    INDICATOR_GAP,
    INDICATOR_INSET,
    INDICATOR_MARGIN,
    INDICATOR_SIZE,
    indicatorKinds,
} from "../geometry/indicators";
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
    type Activation,
    type ActivationType,
    type BoundaryBox,
    type Bounds,
    buildGraph,
    type ColorScheme,
    type EdgeLine,
    type ElementBox,
    type FocusItem,
    fitMaxZoom,
    type Graph,
    type GraphImage,
    type ImageState,
    imageBox,
    type Labels,
    panIntoView,
    readyFor,
    stepZoom,
    svgSize,
    type TargetKind,
    zoomLimits,
} from "./graph";
import styles from "./island.module.css";

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

export type { ActivationType };

export type IslandProps = {
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
    /** An item with targets was clicked, or Enter or Space pressed on it. */
    onActivate(type: ActivationType, id: string, anchor: Anchor): void;
};

/** Fraction of the container left around a fitted view. */
const FIT_PADDING = 0.05;

/**
 * Tell the workspace author about a problem in what they wrote: an element
 * whose label overflows (spec 9.1), a relationship that cannot be routed
 * (spec 10.6), an element placed around a stored layout (spec 7.2) or an
 * image view that cannot be drawn (spec 13). The one console call in shipped
 * code, a deliberate exception to CODING_STANDARDS.md: the page has nowhere
 * else to report an authoring problem.
 */
function warnAuthor(message: string) {
    console.warn(message);
}

/* ---------------- indicators and activation (spec 6.1, 6.2, 9.2, 10.9) */

/**
 * Each target kind's glyph, stroked in a 20-unit box: a magnifier for a
 * view to drill down to, a page for the documentation, a checked circle for
 * the decisions and an arrow out of a box for a link.
 */
const GLYPHS: Record<TargetKind, string[]> = {
    view: [
        "M8.5 3a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11z",
        "M12.6 12.6L17 17",
        "M6 8.5h5",
        "M8.5 6v5",
    ],
    documentation: [
        "M4.5 2.5h7.5l3.5 3.5v11.5h-11z",
        "M12 2.5v3.5h3.5",
        "M7.5 10h5",
        "M7.5 13h5",
    ],
    decisions: [
        "M10 2.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 1 0 0-15z",
        "M6.5 10.2l2.5 2.5l4.5-5",
    ],
    link: ["M11 3h6v6", "M17 3l-8 8", "M15 12v5h-12v-12h5"],
};

type IndicatorsProps = {
    targets: TargetKind[];
    color: string;
    /** Where the row sits in its container; in the flow when absent. */
    box?: Bounds;
    style?: CSSProperties;
};

/** One glyph per kind of target, in a row; decoration for sighted readers. */
function Indicators({ targets, color, box, style }: IndicatorsProps) {
    return (
        <div
            data-indicators=""
            aria-hidden="true"
            style={{
                display: "flex",
                gap: INDICATOR_GAP,
                flexShrink: 0,
                ...(box && { position: "absolute", left: box.x, top: box.y }),
                ...style,
            }}
        >
            {indicatorKinds(targets).map((kind) => (
                <svg
                    key={kind}
                    aria-hidden="true"
                    data-indicator={kind}
                    width={INDICATOR_SIZE}
                    height={INDICATOR_SIZE}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke={color}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    {GLYPHS[kind].map((d) => (
                        <path key={d} d={d} />
                    ))}
                </svg>
            ))}
        </div>
    );
}

/** How wide the invisible stroke round an edge that takes its clicks is. */
const EDGE_HIT_WIDTH = 12;

/** How far one arrow key pans the canvas, in screen pixels. */
const PAN_STEP = 50;

/** The arrow keys, as the direction each moves the diagram (spec 6.2). */
const PAN_KEYS: Partial<Record<string, { x: number; y: number }>> = {
    ArrowLeft: { x: 1, y: 0 },
    ArrowRight: { x: -1, y: 0 },
    ArrowUp: { x: 0, y: 1 },
    ArrowDown: { x: 0, y: -1 },
};

/** `+` zooms in, `-` out and `0` fits; `=` is `+` without Shift. */
const ZOOM_KEYS: Partial<Record<string, keyof IslandCommands>> = {
    "+": "zoomIn",
    "=": "zoomIn",
    "-": "zoomOut",
    _: "zoomOut",
    "0": "fit",
};

/** Reports an activation to the handle; the island never navigates. */
const Activate = createContext<IslandProps["onActivate"]>(() => {});

/** An item as the focus order and the DOM find it. */
type FocusRef = Pick<FocusItem, "type" | "id">;

/** The key an item is found by in the focus order and the DOM. */
const focusKey = (item: FocusRef) => `${item.type}:${item.id}`;

/** What an item without targets takes: nothing, so it stays inert. */
const INERT: { onClick?: (event: MouseEvent) => void } = {};

/**
 * What makes an item with targets activatable (spec 6.1, 6.2): a pointer,
 * a click, a place in the canvas's own Tab order and an accessible name.
 * An element activates itself; a boundary or an edge names what it
 * activates.
 */
function useTargetProps(
    item: FocusRef,
    targets: TargetKind[],
    label: string,
    activation: Activation | undefined = item.type === "element"
        ? { type: "element", id: item.id }
        : undefined,
) {
    const activate = useContext(Activate);
    if (targets.length === 0 || !activation) return INERT;
    return {
        className: styles.target,
        tabIndex: -1,
        role: "button",
        "aria-label": label,
        "aria-haspopup": targets.length > 1 ? ("menu" as const) : undefined,
        "data-focus-item": focusKey(item),
        "data-targets": targets.join(" "),
        onClick: (event: MouseEvent) => {
            event.stopPropagation();
            activate(activation.type, activation.id, {
                x: event.clientX,
                y: event.clientY,
            });
        },
    };
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
    | "targets"
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
    targets,
}: ElementLabelProps) {
    const layout = ICON_LAYOUTS[iconPosition];
    const indicators = targets.length > 0;
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
                indicators,
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
        indicators,
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

    // The indicator row sits at the bottom of the content area, above a
    // Bottom icon and inset from the bottom edge, and the rest is centered
    // in what is left (spec 9.2).
    const iconLast = layout.after && image;
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
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                color,
                fontSize,
                lineHeight: LINE_HEIGHT,
            }}
        >
            <div
                style={{
                    flex: "1 1 0",
                    minHeight: 0,
                    width: "100%",
                    display: "flex",
                    flexDirection: beside ? "row" : "column",
                    justifyContent: "center",
                    alignItems: "center",
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
                                // Unclamped only until the first
                                // measurement, which runs before paint,
                                // so that state is never seen.
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
                {!indicators && iconLast}
            </div>
            {indicators && (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        paddingBottom: INDICATOR_INSET,
                    }}
                >
                    <Indicators
                        targets={targets}
                        color={color}
                        style={{ marginTop: INDICATOR_MARGIN }}
                    />
                    {iconLast}
                </div>
            )}
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
    const target = useTargetProps(
        { type: "element", id: data.id },
        data.targets,
        fullText,
    );

    return (
        <div
            data-element-id={data.id}
            data-shape={data.shape}
            title={fullText}
            aria-label={fullText}
            {...target}
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
    const { band, accessibleName } = data;
    // Its label band is what activates the element it is drawn for.
    const target = useTargetProps(
        { type: "boundary", id: data.id },
        data.targets,
        accessibleName,
        data.elementId === undefined
            ? undefined
            : { type: "element", id: data.elementId },
    );
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
                title={accessibleName}
                {...target}
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
                {data.indicators && (
                    <Indicators
                        targets={data.targets}
                        color={data.color}
                        box={{
                            ...data.indicators,
                            y: data.indicators.y - band.y,
                        }}
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
    // Keyboard focus sits on the label, which is where the pointer can
    // activate it too, as on the invisible stroke round the line (spec 10.9).
    const target = useTargetProps(
        { type: "edge", id },
        data?.targets ?? [],
        data?.name ?? "",
        data && { type: "relationship", id: data.id },
    );
    if (!data) return null;
    const {
        thickness,
        labelBox,
        labelLines,
        labelIndicators,
        presence,
        transition,
    } = data;
    const hidden = presence === "hidden";
    const active = data.targets.length > 0;

    return (
        <g
            data-relationship-id={data.id}
            data-order={data.order}
            aria-hidden={hidden || undefined}
            style={presenceStyle(presence, transition)}
        >
            {active && !hidden && (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard reaches the relationship through its label
                <path
                    data-hit-stroke=""
                    className={styles.hitStroke}
                    d={data.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={EDGE_HIT_WIDTH}
                    onClick={target.onClick}
                />
            )}
            <g opacity={data.opacity}>
                <BaseEdge
                    id={id}
                    interactionWidth={0}
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
                        {...target}
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
                            pointerEvents: hidden
                                ? "none"
                                : active
                                  ? "all"
                                  : undefined,
                        }}
                    >
                        {labelIndicators && (
                            <Indicators
                                targets={data.targets}
                                color={data.color}
                                box={labelIndicators}
                            />
                        )}
                        <div
                            style={{
                                // The text column stops short of the glyphs.
                                width: labelIndicators
                                    ? labelIndicators.x -
                                      EDGE_LABEL_PADDING -
                                      INDICATOR_GAP
                                    : undefined,
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
                                        fontSize:
                                            data.fontSize * METADATA_SCALE,
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
                // An SVG with no size of its own takes it from its viewBox.
                const size = svgSize(src) ?? {
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                };
                setState({
                    subject,
                    image: { status: "loaded", src, ...size },
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
    onActivate,
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
    // the reader's viewport; otherwise a step never moves it (spec 11). The
    // step only ever clears together with a new view's key (`showView`), so
    // this never refits the outgoing view on its way out.
    const shownStep = useRef(step);
    useEffect(() => {
        if (shownStep.current === step) return;
        shownStep.current = step;
        if (!zoomOnAnimation) return;
        const viewport = step === null ? fitted : stepFitted;
        if (!viewport) return;
        moved.current = false;
        flow.setViewport(viewport, {
            duration: reducedMotion ? 0 : TRANSITION_MS,
        });
    }, [step, zoomOnAnimation, fitted, stepFitted, flow, reducedMotion]);

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

    // Name every unplaced element placed around a stored layout, once each
    // time its view is shown, not again on a scheme, labels or font redraw.
    const placements = graph?.placements;
    const logged = useRef<string | null>(null);
    useEffect(() => {
        if (key === undefined || logged.current === key) return;
        logged.current = key;
        // Spec 7.2 asks for a line naming each placed element.
        for (const { id, name, x, y } of placements ?? [])
            warnAuthor(
                `Placed unplaced element ${id} ("${name}") at (${x}, ${y}) in view ${key}.`,
            );
    }, [key, placements]);

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

    /** Each item with targets by its focus key. */
    const focusable = useMemo(
        () =>
            new Map(
                (graph?.focusOrder ?? []).map((item) => [focusKey(item), item]),
            ),
        [graph],
    );
    /**
     * Set while the pointer is what moves focus, so a click focuses its item
     * where it is: panning it into view then would move the canvas under the
     * pointer (spec 6.2). A key press hands focus back to the keyboard.
     */
    const pointing = useRef(false);

    const itemElement = (item: FocusRef | undefined) =>
        item
            ? wrapper.current?.querySelector<HTMLElement>(
                  `[data-focus-item="${CSS.escape(focusKey(item))}"]`,
              )
            : null;

    /**
     * Tab and Shift+Tab walk the items with targets in reading order, then
     * leave the canvas (spec 6.2). The items are not in the page's own Tab
     * order, so the canvas is one stop on the way through the page.
     */
    const onTab = (event: KeyboardEvent<HTMLDivElement>) => {
        // A step's hidden items are inert, so they leave the walk (spec 11).
        const order = (graph?.focusOrder ?? []).filter(
            (item) => !itemElement(item)?.closest("[inert]"),
        );
        const current = (document.activeElement as HTMLElement | null)?.dataset
            ?.focusItem;
        const index = order.findIndex((item) => focusKey(item) === current);
        const onCanvas = document.activeElement === wrapper.current;
        let next: HTMLElement | null | undefined;
        if (event.shiftKey) {
            if (index === 0) next = wrapper.current;
            else if (index > 0) next = itemElement(order[index - 1]);
        } else if (onCanvas) {
            next = itemElement(order[0]);
        } else if (index >= 0 && index < order.length - 1) {
            next = itemElement(order[index + 1]);
        }
        if (!next) return;
        event.preventDefault();
        next.focus({ preventScroll: true });
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        pointing.current = false;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "Tab") return onTab(event);
        if (event.key === "Escape") {
            // Escape on the canvas stops the animation (spec 11).
            onEscape();
            return;
        }

        const item = (event.target as HTMLElement).dataset?.focusItem;
        const activation = item ? focusable.get(item)?.activation : undefined;
        if (activation && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            const box = (event.target as HTMLElement).getBoundingClientRect();
            onActivate(activation.type, activation.id, {
                x: box.left + box.width / 2,
                y: box.bottom,
            });
            return;
        }

        const pan = PAN_KEYS[event.key];
        if (pan) {
            event.preventDefault();
            moved.current = true;
            const viewport = flow.getViewport();
            flow.setViewport({
                ...viewport,
                x: viewport.x + pan.x * PAN_STEP,
                y: viewport.y + pan.y * PAN_STEP,
            });
            return;
        }
        const command = ZOOM_KEYS[event.key];
        if (command) {
            event.preventDefault();
            commands[command]();
        }
    };

    // An item the keyboard focuses off screen is panned into view, zoom
    // unchanged. One the pointer focuses is already where the reader is.
    const onFocus = (event: FocusEvent<HTMLDivElement>) => {
        if (pointing.current) return;
        const item = (event.target as HTMLElement).dataset?.focusItem;
        const box = item ? focusable.get(item)?.box : undefined;
        if (!box) return;
        const panned = panIntoView(flow.getViewport(), box, size);
        if (!panned) return;
        moved.current = true;
        flow.setViewport(panned);
    };

    return (
        <div
            ref={wrapper}
            data-view-key={key ?? ""}
            data-ready={readyFor(key, readyKey) ? "true" : "false"}
            // One focusable region, labeled with the view's title (spec 6.2).
            role="group"
            aria-label={graph?.title}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is one Tab stop that pans, zooms and walks its items by key (spec 6.2)
            tabIndex={0}
            className={styles.canvas}
            onKeyDown={onKeyDown}
            onPointerDownCapture={() => {
                pointing.current = true;
            }}
            onFocus={onFocus}
            style={
                {
                    width: "100%",
                    height: "100%",
                    background: graph?.background,
                    fontFamily: family,
                    "--focus-ring": graph?.color,
                } as CSSProperties
            }
        >
            <Activate.Provider value={onActivate}>
                <CanvasBackground.Provider
                    value={graph?.background ?? "#ffffff"}
                >
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
                            // The canvas owns the keys (spec 6.2).
                            disableKeyboardA11y
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
                                // Programmatic moves carry no event; only
                                // the reader's do.
                                if (event) moved.current = true;
                            }}
                        />
                    )}
                </CanvasBackground.Provider>
            </Activate.Provider>
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
