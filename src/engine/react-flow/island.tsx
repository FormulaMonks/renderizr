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
    type NodeChange,
    type NodeProps,
    Position,
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    useStore,
    useStoreApi,
    ViewportPortal,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
    createContext,
    type CSSProperties,
    type FocusEvent,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent,
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
import {
    type EditedLayout,
    type EditedRoute,
    isEditable,
    type LayoutChange,
    mergeLayouts,
    type WorkspaceModel,
} from "../../model";
import type {
    AlignEdge,
    Anchor,
    CalculateLayoutOptions,
    CanvasCommand,
    DistributeAxis,
    SelectionState,
} from "../contract";
import type { TextBlock } from "../geometry/boundary";
import { boundsOf } from "../geometry/bounds";
import { labelPositionAt, nearestSide } from "../geometry/edge-editing";
import {
    isHorizontal,
    type RoutingMode,
    sidePoint,
} from "../geometry/routing/path";
import type { Point } from "../geometry/shapes/types";
import { type Guide, guideReach, snapBox } from "../geometry/snapping";
import { bringBackChange, calculatedChange, canvasChange } from "./commands";
import { moveChange } from "./arrange";
import { dragLayout } from "./drag";
import { useEditKeys, useKeepViewport } from "./edit-keys";
import {
    routeChange,
    sideChange,
    vertexTargets,
    withVertex,
} from "./edge-edits";
import {
    clickSelection,
    marqueeSelection,
    type SelectionOrder,
} from "./selection";
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
    calculatedGraph,
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
    /** Whether edit mode edits the view shown, when `isEditable` accepts it. */
    editing: boolean;
    /**
     * The page's edited layout of each view, by key (ADR 18). A view keeps
     * its object until the page hands it a new one, so the graph of the view
     * shown is built again only when its own layout changes.
     */
    layouts: ReadonlyMap<string, EditedLayout>;
    /**
     * The workspace edit mode swapped in after mount (spec 6), drawn in
     * place of the `model` prop. Builds never set it.
     */
    model?: WorkspaceModel;
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
    /** Edit mode's commands on the view shown (spec 9.2); no-ops in reading. */
    resizeCanvas?(command: CanvasCommand, recenter: boolean): void;
    bringBack?(): void;
    calculateLayout?(options: CalculateLayoutOptions): void;
    setRouting?(mode: RoutingMode): void;
    align?(edge: AlignEdge): void;
    distribute?(axis: DistributeAxis): void;
    /** The island's own keys, which no button calls (spec 9.2). */
    nudge?(step: Point): void;
    selectAll?(): void;
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
    /**
     * A drag ended and moved something (spec 9.2). The handle hands it to
     * the page, which draws it through `setLayout` or lets it revert.
     */
    onLayoutChanged?(change: LayoutChange): void;
    /** The selection changed in editing (spec 9.2, 10.2). */
    onSelectionChanged?(selection: SelectionState): void;
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
const ZOOM_KEYS: Partial<Record<string, "fit" | "zoomIn" | "zoomOut">> = {
    "+": "zoomIn",
    "=": "zoomIn",
    "-": "zoomOut",
    _: "zoomOut",
    "0": "fit",
};

/** Reports an activation to the handle; the island never navigates. */
const Activate = createContext<IslandProps["onActivate"]>(() => {});

/**
 * Whether the view shown is being edited. In editing a click never
 * activates (spec 10.3): pressing an element starts a drag.
 */
const Editing = createContext(false);

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
    const editing = useContext(Editing);
    if (targets.length === 0 || !activation) return INERT;
    return {
        className: styles.target,
        tabIndex: -1,
        role: "button",
        "aria-label": label,
        "aria-haspopup": targets.length > 1 ? ("menu" as const) : undefined,
        "data-focus-item": focusKey(item),
        "data-targets": targets.join(" "),
        onClick: editing
            ? undefined
            : (event: MouseEvent) => {
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
type CanvasNode = Node<Record<string, never>, "canvas">;
type DiagramNode =
    | BoxNode
    | BoundaryNode
    | ImageNode
    | PlaceholderNode
    | CanvasNode;
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
 *
 * In editing a boundary is never selected, dragged or activated (spec 10.2):
 * the band takes no pointer events either, so a drag anywhere on a boundary
 * draws a marquee.
 */
function BoundaryElement({ data }: NodeProps<BoundaryNode>) {
    const { band, accessibleName } = data;
    const editing = __RENDERIZR_EDIT_MODE__ && useContext(Editing);
    // Its label band is what activates the element it is drawn for.
    const target = useTargetProps(
        { type: "boundary", id: data.id },
        editing ? [] : data.targets,
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
                    pointerEvents: editing ? "none" : "auto",
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
    // In editing every edge takes the pointer, to be selected, to take a
    // vertex and to have its label dragged (spec 12.1, 12.3, 12.7).
    const editing = __RENDERIZR_EDIT_MODE__ && useContext(Editing);
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
    const active =
        data.targets.length > 0 || (__RENDERIZR_EDIT_MODE__ ? editing : false);

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
 * The canvas in editing (spec 14): a frame behind the view, the size its
 * `dimensions` set, that lets every pointer event through.
 */
function CanvasFrame() {
    return <div data-canvas-frame="" className={styles.canvasFrame} />;
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
    canvas: CanvasFrame,
};
const edgeTypes = { line: RouteEdge };
const proOptions = { hideAttribution: true };
const nodeOrigin: [number, number] = [0, 0];
const zoomKeys = ["Meta", "Control"];
/**
 * A marquee as React Flow draws it: its rectangle in screen pixels inside
 * the canvas, its starting corner in model units, and the viewport then.
 */
type MarqueeState = {
    rect: Bounds & { startX: number; startY: number };
    transform: [number, number, number];
};

/**
 * One frame of a gesture in editing (spec 10.1, 12): the edited layout it
 * draws, the alignment guides snapping draws (spec 11) and, while an edge
 * end is dragged, the side it would take (spec 12.4). An element drag also
 * keeps where the pointer has the elements (`raw`) and where they come to
 * rest once snapped (`positions`); an edge gesture keeps the change its
 * drop makes.
 */
type Frame = {
    key: string;
    layout: EditedLayout;
    guides: Guide[];
    raw?: ReadonlyMap<string, Point>;
    positions?: ReadonlyMap<string, Point>;
    change?: LayoutChange | null;
    side?: Guide;
};

/** The empty selection, one object so an empty selection never redraws. */
const NONE: SelectionOrder = [];
/** Above every node React Flow draws, which sit at 0 and up. */
const GUIDES_Z = 1000;
/** In editing the middle and the right button pan (spec 10.1). */
const EDIT_PAN_BUTTONS = [1, 2];

/** Whether Shift, Cmd or Ctrl is held: a click toggles, a marquee adds. */
const modified = (event: {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
}) => event.shiftKey || event.metaKey || event.ctrlKey;

/** The id of the element node `target` is in, if any. */
const elementNodeId = (target: EventTarget) =>
    target instanceof Element
        ? target.closest<HTMLElement>(".react-flow__node-box")?.dataset.id
        : undefined;

/**
 * The alignment guides of a drag (spec 11): dashed lines in model units,
 * one screen pixel wide at any zoom, in `--color-primary` (spec 10.4).
 */
function Guides({ guides }: { guides: Guide[] }) {
    return (
        <ViewportPortal>
            <svg
                aria-hidden="true"
                data-alignment-guides=""
                width={1}
                height={1}
                // Above the elements, so a guide shows along their sides.
                style={{
                    position: "absolute",
                    overflow: "visible",
                    pointerEvents: "none",
                    zIndex: GUIDES_Z,
                }}
            >
                {guides.map(({ from, to }) => (
                    <line
                        key={`${from.x},${from.y},${to.x},${to.y}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="var(--color-primary)"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        vectorEffect="non-scaling-stroke"
                    />
                ))}
            </svg>
        </ViewportPortal>
    );
}

/** How wide a vertex or edge-end handle is on screen, in pixels (spec 12.3). */
const HANDLE_SIZE = 10;

type EdgeMarksProps = {
    graph: Graph;
    stepState: StepState | undefined;
    /** The selected edge's key. */
    selected: string | undefined;
    /** The side an edge-end drag would take, while one runs. */
    side: Guide | undefined;
    zoom: number;
    onVertex(event: PointerEvent<Element>, edge: EdgeLine, index: number): void;
    onRemove(edge: EdgeLine, index: number): void;
    onEnd(
        event: PointerEvent<Element>,
        edge: EdgeLine,
        end: "source" | "target",
    ): void;
};

/**
 * The marks of editing edges, in `--color-primary` over `--color-surface`
 * (spec 10.4): the selected edge's highlight and its square edge-end
 * handles (spec 12.1, 12.4), a handle on every vertex (spec 12.3), and
 * the side an edge-end drag would take. Handles keep their size on screen
 * at any zoom.
 */
function EdgeMarks({
    graph,
    stepState,
    selected,
    side,
    zoom,
    onVertex,
    onRemove,
    onEnd,
}: EdgeMarksProps) {
    const size = HANDLE_SIZE / zoom;
    const handle = {
        className: "nodrag nopan",
        fill: "var(--color-surface)",
        stroke: "var(--color-primary)",
        strokeWidth: 2 / zoom,
        style: { pointerEvents: "all" as const, cursor: "move" },
    };
    const shown = graph.edges.filter(
        (edge) => stepState?.edges[edge.key] !== "hidden",
    );
    const edge = shown.find((each) => each.key === selected);
    return (
        <ViewportPortal>
            <svg
                aria-hidden="true"
                data-edge-marks=""
                width={1}
                height={1}
                style={{
                    position: "absolute",
                    overflow: "visible",
                    pointerEvents: "none",
                    zIndex: GUIDES_Z,
                }}
            >
                {edge && (
                    <path
                        data-selected-edge={edge.key}
                        d={edge.path}
                        fill="none"
                        stroke="var(--color-primary)"
                        strokeOpacity={0.35}
                        strokeWidth={edge.thickness + 8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}
                {side && (
                    <line
                        data-chosen-side=""
                        x1={side.from.x}
                        y1={side.from.y}
                        x2={side.to.x}
                        y2={side.to.y}
                        stroke="var(--color-primary)"
                        strokeWidth={4 / zoom}
                    />
                )}
                {shown.flatMap((line) =>
                    line.vertices.map((vertex, index) => (
                        <circle
                            key={`${line.key}:${index}`}
                            data-vertex-handle={`${line.key}:${index}`}
                            cx={vertex.x}
                            cy={vertex.y}
                            r={size / 2}
                            {...handle}
                            onPointerDown={(event) => {
                                if (event.button === 0)
                                    onVertex(event, line, index);
                            }}
                            onDoubleClick={(event) => {
                                event.stopPropagation();
                                onRemove(line, index);
                            }}
                        />
                    )),
                )}
                {edge &&
                    (["source", "target"] as const).map((end) => (
                        <rect
                            key={end}
                            data-edge-end-handle={end}
                            x={edge[end].x - size / 2}
                            y={edge[end].y - size / 2}
                            width={size}
                            height={size}
                            {...handle}
                            onPointerDown={(event) => {
                                if (event.button === 0) onEnd(event, edge, end);
                            }}
                        />
                    ))}
            </svg>
        </ViewportPortal>
    );
}

/**
 * Below the edges, which sit at 0, so an edge crossing a boundary is never
 * hidden by its fill; each level of nesting one higher.
 */
const BOUNDARY_Z = -1000;

/** The canvas frame's node id, which no element id takes (ids are numbers). */
const CANVAS_NODE = "canvas:frame";

/** The canvas frame, behind every boundary (spec 14). */
const canvasNode = ({ width, height }: Graph["canvas"]): CanvasNode => ({
    ...STATIC_NODE_PROPS,
    id: CANVAS_NODE,
    type: "canvas",
    width,
    height,
    zIndex: BOUNDARY_Z - 1,
    data: {},
});

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

/** The selection as the canvas uses it (spec 10.2). */
type EditSelection = {
    /** The selection of the view shown, the reference element first. */
    selected: SelectionOrder;
    /** What is drawn selected: the selection, or a marquee's while drawn. */
    shown: SelectionOrder;
    select(ids: SelectionOrder): void;
    startMarquee(event: MouseEvent | globalThis.MouseEvent): void;
    endMarquee(): void;
    /**
     * The selected edge as drawn (spec 12.1), never with elements selected;
     * reading has none, and builds never read it (ADR 15).
     */
    edge?: EdgeLine;
    /** Select the edge with key `key` alone, clearing the elements. */
    selectEdge?(key: string): void;
};

/** Reading selects nothing. */
const READING_SELECTION: EditSelection = {
    selected: NONE,
    shown: NONE,
    select: () => {},
    startMarquee: () => {},
    endMarquee: () => {},
};

/**
 * The selection in editing, on the view it was made on (spec 10.2). It
 * lives in the island and is never saved or undone (ADR 18). Only the view
 * `drawn` shows while `editable` holds one: elements it no longer draws
 * drop out. The page hears every committed change, the reference element
 * first (spec 9.2).
 *
 * A marquee selects live, from `kept`, the selection a modifier held when
 * it started, and its drop commits the last one. React Flow draws it in
 * screen pixels with its starting corner in model units.
 *
 * The selected edge shares nothing with the elements: selecting either
 * clears the other (spec 10.2, 12.1). The page hears its relationship id and
 * the routing mode it is drawn in now (spec 9.2).
 */
function useEditSelection(
    viewKey: string,
    editable: boolean,
    drawn: Graph | undefined,
    stepState: StepState | undefined,
    onSelectionChanged: IslandProps["onSelectionChanged"],
): EditSelection {
    const [selection, setSelection] = useState<{
        key: string;
        ids: SelectionOrder;
        edge?: string;
    }>({ key: viewKey, ids: NONE });
    const selected = useMemo(() => {
        if (!editable || selection.key !== viewKey || !drawn) return NONE;
        const ids = new Set(drawn.elements.map((element) => element.id));
        const kept = selection.ids.filter((id) => ids.has(id));
        return kept.length === selection.ids.length ? selection.ids : kept;
    }, [editable, selection, viewKey, drawn]);
    const select = useCallback(
        (ids: SelectionOrder) => setSelection({ key: viewKey, ids }),
        [viewKey],
    );
    const edge =
        editable && selection.key === viewKey && selection.edge !== undefined
            ? drawn?.edges.find((each) => each.key === selection.edge)
            : undefined;

    const marquee = useStore((flowState) =>
        flowState.userSelectionActive ? flowState.userSelectionRect : null,
    );
    const transform = useStore((flowState) => flowState.transform);
    const kept = useRef<SelectionOrder>(NONE);
    const marking = useCallback(
        ({ rect: marked, transform: [x, y, zoom] }: MarqueeState) => {
            if (!drawn) return NONE;
            const rect = {
                x: (marked.x - x) / zoom,
                y: (marked.y - y) / zoom,
                width: marked.width / zoom,
                height: marked.height / zoom,
            };
            // A step's hidden elements aren't drawn, so a marquee can't
            // take them.
            const boxes = drawn.elements.filter(
                (element) => stepState?.elements[element.id] !== "hidden",
            );
            return marqueeSelection(kept.current, boxes, rect, {
                x: marked.startX,
                y: marked.startY,
            });
        },
        [drawn, stepState],
    );
    const marked = useMemo(
        () =>
            editable && marquee ? marking({ rect: marquee, transform }) : null,
        [editable, marquee, transform, marking],
    );

    // The marquee as React Flow last drew it, read straight from its store:
    // the drop can come before React draws the last pointer move.
    const flowStore = useStoreApi();
    const lastMarquee = useRef<MarqueeState | null>(null);
    useEffect(
        () =>
            flowStore.subscribe(
                ({ userSelectionActive, userSelectionRect, transform }) => {
                    if (userSelectionActive && userSelectionRect)
                        lastMarquee.current = {
                            rect: userSelectionRect,
                            transform,
                        };
                },
            ),
        [flowStore],
    );

    const reported = useRef("");
    const id = edge?.id;
    const routing = edge?.routing;
    useEffect(() => {
        const key = `${selected.join("\n")}\t${id}\t${routing}`;
        if (key === reported.current) return;
        reported.current = key;
        onSelectionChanged?.({
            elements: [...selected],
            edge: id !== undefined && routing ? { id, routing } : null,
        });
    }, [selected, id, routing, onSelectionChanged]);

    return {
        selected,
        shown: marked ?? selected,
        select,
        edge,
        selectEdge: (key) =>
            setSelection({ key: viewKey, ids: NONE, edge: key }),
        startMarquee: (event) => {
            kept.current = modified(event) ? selected : NONE;
        },
        endMarquee: () => {
            const last = lastMarquee.current;
            lastMarquee.current = null;
            select(last ? marking(last) : kept.current);
        },
    };
}

function Canvas({
    model: mounted,
    store,
    commands,
    font,
    onPainted,
    onRedrawn,
    onEscape,
    onActivate,
    onLayoutChanged,
    onSelectionChanged,
}: IslandProps) {
    const state = useSyncExternalStore(store.subscribe, store.get);
    const model = (__RENDERIZR_EDIT_MODE__ && state.model) || mounted;
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
    // Compiled out of builds, which never edit (ADR 15).
    const edited = __RENDERIZR_EDIT_MODE__
        ? state.layouts.get(viewKey)
        : undefined;
    // False at build time in builds, so every editing branch compiles out.
    // The flag is a build-time constant, so every render calls the same
    // hooks, and builds call none of edit mode's (ADR 15).
    const editable =
        __RENDERIZR_EDIT_MODE__ &&
        useMemo(() => {
            if (!state.editing) return false;
            const view = model.findViewByKey(viewKey);
            return view !== undefined && isEditable(view);
        }, [model, viewKey, state.editing]);
    // A new step is not a new graph: nothing is laid out again (spec 11).
    const drawn = useMemo(
        () => buildGraph(model, viewKey, scheme, labels, measure, edited),
        [model, viewKey, scheme, labels, measure, edited],
    );
    /**
     * What a gesture in editing shows on the view it started on, frame by
     * frame, laid out again here inside the island; only its drop reaches
     * the page (spec 10.1, ADR 18). The flag is a build-time constant, so
     * every render calls the same hooks, and builds call none (ADR 15).
     */
    const [drag, setDrag] = __RENDERIZR_EDIT_MODE__
        ? useState<Frame | null>(null)
        : [null, () => {}];
    const dragging = __RENDERIZR_EDIT_MODE__
        ? useRef(drag)
        : { current: null as Frame | null };
    if (__RENDERIZR_EDIT_MODE__) dragging.current = drag;
    const framed = __RENDERIZR_EDIT_MODE__
        ? useMemo(
              () =>
                  drag && drag.key === viewKey
                      ? buildGraph(
                            model,
                            viewKey,
                            scheme,
                            labels,
                            measure,
                            drag.layout,
                        )
                      : undefined,
              [model, viewKey, scheme, labels, measure, drag],
          )
        : undefined;
    const graph = framed ?? drawn;
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
    const selection = __RENDERIZR_EDIT_MODE__
        ? // The flag is a build-time constant, so every render calls the
          // same hooks, and builds call none (ADR 15).
          useEditSelection(
              viewKey,
              editable,
              drawn,
              stepState,
              onSelectionChanged,
          )
        : READING_SELECTION;
    const {
        selected,
        shown: shownSelection,
        select,
        startMarquee,
        endMarquee,
    } = selection;

    const nodes = useMemo(() => {
        const shown = withPresence(drawing.nodes, stepState, transition);
        if (!__RENDERIZR_EDIT_MODE__ || !editable) return shown;
        // In editing every element drags, faded ones included (spec 18);
        // boundaries never do (spec 8). Every node is a new object, since
        // React Flow keeps selection flags on objects it has seen.
        // A press on a boundary reaches the canvas, so a marquee can start
        // inside one (spec 10.1).
        const chosen = new Set(shownSelection);
        const reference = shownSelection[0];
        const canvas = graph && !graph.image ? [canvasNode(graph.canvas)] : [];
        const editableNodes = shown.map((node) =>
            node.type === "box"
                ? {
                      ...node,
                      draggable: true,
                      selected: chosen.has(node.id),
                      domAttributes: {
                          ...node.domAttributes,
                          "data-reference":
                              node.id === reference ? "" : undefined,
                      },
                  }
                : node.type === "boundary"
                  ? {
                        ...node,
                        style: {
                            ...node.style,
                            pointerEvents: "none" as const,
                        },
                    }
                  : node,
        );
        return [...canvas, ...editableNodes];
    }, [drawing, stepState, transition, editable, shownSelection, graph]);

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
    // A change to the edited layout never refits, and align, distribute,
    // nudge and select all arrange the selection, by command or by key
    // (spec 10.1, 13, 17.2). The flag is a build-time constant, so builds
    // call neither hook (ADR 15).
    if (__RENDERIZR_EDIT_MODE__)
        useKeepViewport(viewKey, edited, model, moved, painted);
    const editKey = __RENDERIZR_EDIT_MODE__
        ? useEditKeys({
              wrapper,
              commands,
              view:
                  editable && drawn && !drawn.error && !drawn.image
                      ? drawn
                      : null,
              viewKey,
              edited,
              selected,
              select,
              stepState,
              onLayoutChanged,
          })
        : undefined;

    /**
     * React Flow reports a drag as position changes, for every selected
     * element when the one pressed is selected; the nodes are controlled,
     * so nothing moves until the drag state draws it. Each frame snaps the
     * box around the moving elements to another element's alignment guide
     * or to the grid (spec 11), and the drop turns into one layout change
     * for the page (spec 9.2). A drop the page doesn't hand back through
     * `setLayout` reverts, since the drag state goes either way. React
     * Flow's own selection changes are ignored: the selection is the
     * island's. Builds, which never edit, compile it out (ADR 15).
     */
    const onNodesChange = (changes: NodeChange<DiagramNode>[]) => {
        if (!__RENDERIZR_EDIT_MODE__ || !drawn) return;
        const current =
            dragging.current?.key === viewKey ? dragging.current : null;
        const raw = new Map(current?.raw ?? []);
        let moving = false;
        let dropped = false;
        for (const change of changes) {
            if (change.type !== "position") continue;
            if (change.dragging && change.position) {
                raw.set(change.id, change.position);
                moving = true;
            } else if (change.dragging === false) {
                dropped = true;
            }
        }
        if (dropped) {
            dragging.current = null;
            setDrag(null);
            const change = current?.positions
                ? moveChange(viewKey, drawn, edited, current.positions)
                : null;
            if (change) onLayoutChanged?.(change);
            return;
        }
        if (!moving) return;
        // A drag never refits the canvas (spec 10.1).
        moved.current = true;
        const box = boundsOf(
            drawn.elements.flatMap((element) => {
                const at = raw.get(element.id);
                return at ? [{ ...element, ...at }] : [];
            }),
        );
        if (!box) return;
        const { offset, guides } = snapBox(
            box,
            drawn.elements.filter((element) => !raw.has(element.id)),
            guideReach(flow.getZoom()),
        );
        const positions = new Map(
            [...raw].map(([id, { x, y }]) => [
                id,
                { x: x + offset.x, y: y + offset.y },
            ]),
        );
        const next = {
            key: viewKey,
            raw,
            positions,
            guides,
            layout: mergeLayouts(edited, dragLayout(drawn, positions)),
        };
        dragging.current = next;
        setDrag(next);
    };

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

    /**
     * Edit mode's commands on the whole view (spec 9.2, 14, 15), each one
     * layout change for the page, as a drop is. Compiled out of builds
     * (ADR 15); nothing happens in reading or on a view that can't be drawn.
     */
    useEffect(() => {
        if (!__RENDERIZR_EDIT_MODE__) return;
        const view =
            editable && drawn && !drawn.error && !drawn.image ? drawn : null;
        const run = (change: LayoutChange | null) => {
            if (change) onLayoutChanged?.(change);
        };
        commands.resizeCanvas = (command, recenter) => {
            if (view)
                run(canvasChange(viewKey, view, edited, command, recenter));
        };
        commands.bringBack = () => {
            if (view) run(bringBackChange(viewKey, view, edited));
        };
        commands.setRouting = (mode) => {
            const edge = selection.edge;
            if (view && edge)
                run(
                    routeChange(viewKey, view, edited, edge.key, {
                        routing: mode,
                    }),
                );
        };
        commands.calculateLayout = (options) => {
            if (!view) return;
            const calculated = calculatedGraph(
                model,
                viewKey,
                scheme,
                labels,
                measure,
                edited,
                options,
            );
            if (calculated)
                run(calculatedChange(viewKey, view, calculated, options));
        };
    }, [
        commands,
        editable,
        drawn,
        edited,
        model,
        viewKey,
        scheme,
        labels,
        measure,
        onLayoutChanged,
        selection.edge,
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
        // A step's hidden items are inert, so they leave the walk (spec 11),
        // and so do boundaries in editing, which take no activation (spec
        // 10.2).
        const order = (graph?.focusOrder ?? []).filter((item) => {
            const element = itemElement(item);
            return element && !element.closest("[inert]");
        });
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
        if (__RENDERIZR_EDIT_MODE__ && editable && editKey?.(event)) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "Tab") return onTab(event);
        if (event.key === "Escape") {
            // Escape empties the selection first, then stops the animation
            // (spec 11, 18).
            if (
                __RENDERIZR_EDIT_MODE__ &&
                (selected.length > 0 || selection.edge)
            )
                select(NONE);
            else onEscape();
            return;
        }

        const item = (event.target as HTMLElement).dataset?.focusItem;
        const activation = item ? focusable.get(item)?.activation : undefined;
        // In editing only Enter activates: Space pans (spec 10.3, 17.2).
        const activates =
            event.key === "Enter" || (!editable && event.key === " ");
        if (activation && activates) {
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

    /**
     * A press on an element sets the selection before React Flow starts a
     * drag (spec 10.2), so the drag moves what is selected once the press
     * lands: the element alone, the whole selection when it is in it, or
     * with Shift, Cmd or Ctrl the selection with the element toggled.
     */
    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        pointing.current = true;
        if (!__RENDERIZR_EDIT_MODE__ || !editable || event.button !== 0) return;
        const id = elementNodeId(event.target);
        if (id === undefined) return pressEdge(event);
        select(clickSelection(selected, id, modified(event)));
    };

    /* ---------------- editing edges (spec 12) */

    /**
     * The edge under `event`'s target, by its line's hit stroke or its
     * label, and whether it was the label. A label names its relationship,
     * which a dynamic view may list more than once, so the pointer picks
     * among those by the label box it is in.
     */
    const edgeAt = (event: MouseEvent<Element>) => {
        if (!drawn || !(event.target instanceof Element)) return undefined;
        const stroke = event.target
            .closest("[data-hit-stroke]")
            ?.closest<HTMLElement>(".react-flow__edge")?.dataset.id;
        if (stroke !== undefined) {
            const edge = drawn.edges.find((each) => each.key === stroke);
            return edge && { edge, label: false };
        }
        const label = event.target.closest<HTMLElement>(
            "[data-relationship-label]",
        )?.dataset.relationshipLabel;
        const at = flow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        const listed = drawn.edges.filter((each) => each.id === label);
        const edge =
            listed.find(
                ({ labelBox: box }) =>
                    box &&
                    at.x >= box.x &&
                    at.x <= box.x + box.width &&
                    at.y >= box.y &&
                    at.y <= box.y + box.height,
            ) ?? listed[0];
        return edge && { edge, label: true };
    };

    /**
     * Run one pointer gesture in editing from `event` (spec 12.3, 12.4,
     * 12.7): each move hands the pointer, in model units, to `frame`, which
     * says what the frame draws and what change a drop there makes, and
     * the release hands that change to the page (ADR 18).
     */
    const gesture = (
        event: PointerEvent<Element>,
        frame: (at: Point) => Pick<Frame, "change" | "guides" | "side">,
    ) => {
        event.stopPropagation();
        // A drag selects no text on the way.
        event.preventDefault();
        const move = (moving: globalThis.PointerEvent) => {
            // A gesture never refits the canvas (spec 10.1).
            moved.current = true;
            const next = frame(
                flow.screenToFlowPosition({
                    x: moving.clientX,
                    y: moving.clientY,
                }),
            );
            const shown: Frame = {
                key: viewKey,
                layout: next.change
                    ? mergeLayouts(edited, next.change.after)
                    : edited ?? {},
                ...next,
            };
            dragging.current = shown;
            setDrag(shown);
        };
        const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            const change = dragging.current?.change;
            dragging.current = null;
            setDrag(null);
            if (change) onLayoutChanged?.(change);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    /** The change that sets `route` on edge `key` of the view drawn. */
    const changeRoute = (key: string, route: EditedRoute) =>
        drawn ? routeChange(viewKey, drawn, edited, key, route) : null;

    /**
     * Where a vertex of edge `key` at `index` (-1 for a vertex not there
     * yet) comes to rest with the pointer at `at`, in whole units, snapped
     * like an element (spec 11), and the alignment guides it draws.
     */
    const snapVertex = (key: string, index: number, at: Point) => {
        const { offset, guides } = snapBox(
            { ...at, width: 0, height: 0 },
            drawn ? vertexTargets(drawn, key, index) : [],
            guideReach(flow.getZoom()),
        );
        const point = {
            x: Math.round(at.x + offset.x),
            y: Math.round(at.y + offset.y),
        };
        return { point, guides };
    };

    /**
     * A press on an edge's line or label selects that edge alone (spec
     * 12.1); on its label it also starts sliding the label along the
     * route (spec 12.7), which starts neither a marquee nor an element
     * drag.
     */
    const pressEdge = (event: PointerEvent<HTMLDivElement>) => {
        const found = edgeAt(event);
        if (!found) return;
        const { edge, label } = found;
        selection.selectEdge?.(edge.key);
        if (!label) return;
        gesture(event, (at) => ({
            guides: [],
            change: changeRoute(edge.key, {
                position: labelPositionAt(edge.route, at),
            }),
        }));
    };

    /** A drag on vertex `index` of `edge` moves it, snapped (spec 12.3). */
    const dragVertex = (
        event: PointerEvent<Element>,
        edge: EdgeLine,
        index: number,
    ) =>
        gesture(event, (at) => {
            const { point, guides } = snapVertex(edge.key, index, at);
            const vertices = edge.vertices.map((vertex, i) =>
                i === index ? point : vertex,
            );
            return { guides, change: changeRoute(edge.key, { vertices }) };
        });

    /** A double-click on a vertex's handle removes it (spec 12.3). */
    const removeVertex = (edge: EdgeLine, index: number) => {
        const vertices = edge.vertices.filter((__, i) => i !== index);
        const change = changeRoute(edge.key, { vertices });
        if (change) onLayoutChanged?.(change);
    };

    /**
     * A drag on the selected edge's `end` handle highlights the side of its
     * element nearest the pointer, and the drop saves the vertex that holds
     * that side (spec 12.4).
     */
    const dragEnd = (
        event: PointerEvent<Element>,
        edge: EdgeLine,
        end: "source" | "target",
    ) => {
        const id = end === "source" ? edge.sourceId : edge.targetId;
        const box = drawn?.elements.find((element) => element.id === id);
        if (!box) return;
        gesture(event, (at) => {
            const side = nearestSide(box, at);
            const length = isHorizontal(side) ? box.width : box.height;
            const vertices = sideChange(
                edge,
                box,
                end,
                at,
                guideReach(flow.getZoom()),
            );
            return {
                guides: [],
                side: {
                    from: sidePoint(box, side, 0),
                    to: sidePoint(box, side, length),
                },
                change: changeRoute(edge.key, { vertices }),
            };
        });
    };

    /**
     * In editing a double-click on an element or on an edge's label offers
     * its activation targets, as a click does when reading (spec 10.3).
     */
    const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
        if (!__RENDERIZR_EDIT_MODE__ || !editable || !graph) return;
        const anchor = { x: event.clientX, y: event.clientY };
        const id = elementNodeId(event.target);
        const element = graph.elements.find((each) => each.id === id);
        if (element) {
            if (element.targets.length > 0)
                onActivate("element", element.id, anchor);
            return;
        }
        // A double-click on a line adds a vertex there, snapped (spec 12.3).
        const found = edgeAt(event);
        if (found && !found.label) {
            const { edge } = found;
            const { point } = snapVertex(
                edge.key,
                -1,
                flow.screenToFlowPosition(anchor),
            );
            const change = changeRoute(edge.key, {
                vertices: withVertex(edge, point),
            });
            if (change) onLayoutChanged?.(change);
            return;
        }
        const label =
            event.target instanceof Element
                ? event.target.closest<HTMLElement>("[data-relationship-label]")
                      ?.dataset.relationshipLabel
                : undefined;
        const edge = graph.edges.find((each) => each.id === label);
        if (edge && edge.targets.length > 0)
            onActivate("relationship", edge.id, anchor);
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
            onPointerDownCapture={onPointerDown}
            onDoubleClick={editable ? onDoubleClick : undefined}
            onFocus={onFocus}
            style={
                {
                    width: "100%",
                    height: "100%",
                    background: graph?.background,
                    fontFamily: family,
                    "--focus-ring": graph?.color,
                    // The selection outline keeps its width on screen.
                    ...(editable && { "--zoom": zoom }),
                } as CSSProperties
            }
        >
            <Activate.Provider value={onActivate}>
                <Editing.Provider value={editable}>
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
                                nodesDraggable={editable}
                                onNodesChange={
                                    editable ? onNodesChange : undefined
                                }
                                nodesConnectable={false}
                                nodesFocusable={false}
                                edgesFocusable={false}
                                // In editing a plain drag on the canvas or a
                                // boundary draws a marquee, and Space, the
                                // middle or the right button pans (spec 10.1).
                                // React Flow's own selection key would turn
                                // a Shift-click into a marquee.
                                elementsSelectable={editable}
                                selectionOnDrag={editable}
                                selectionKeyCode={editable ? null : undefined}
                                onSelectionStart={
                                    editable ? startMarquee : undefined
                                }
                                onSelectionEnd={
                                    editable ? endMarquee : undefined
                                }
                                onPaneClick={
                                    editable ? () => select(NONE) : undefined
                                }
                                // The canvas owns the keys (spec 6.2).
                                disableKeyboardA11y
                                panOnDrag={editable ? EDIT_PAN_BUTTONS : true}
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
                            >
                                {editable && drag && drag.key === viewKey && (
                                    <Guides guides={drag.guides} />
                                )}
                                {editable && graph && (
                                    <EdgeMarks
                                        graph={graph}
                                        stepState={stepState}
                                        selected={selection.edge?.key}
                                        side={drag?.side}
                                        zoom={zoom}
                                        onVertex={dragVertex}
                                        onRemove={removeVertex}
                                        onEnd={dragEnd}
                                    />
                                )}
                            </ReactFlow>
                        )}
                    </CanvasBackground.Provider>
                </Editing.Provider>
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
