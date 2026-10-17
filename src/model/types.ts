/**
 * The shapes of a Structurizr workspace as the model layer sees them, once
 * `WorkspaceModel` has registered every element with its type and parent.
 */

export type ColorScheme = "Light" | "Dark";

export type ElementType =
    | "Custom"
    | "Person"
    | "SoftwareSystem"
    | "Container"
    | "Component"
    | "DeploymentNode"
    | "InfrastructureNode"
    | "SoftwareSystemInstance"
    | "ContainerInstance"
    | "Boundary"
    | "Group";

/** Where an element sits relative to the enterprise. */
export type ElementLocation = "Internal" | "External" | "Unspecified";

export type ViewType =
    | "Custom"
    | "SystemLandscape"
    | "SystemContext"
    | "Container"
    | "Component"
    | "Dynamic"
    | "Deployment"
    | "Filtered"
    | "Image"
    | "Mermaid";

export type Perspective = {
    name: string;
    description?: string;
    value?: string;
    /** Set on dynamic perspectives, which are polled; the model ignores them. */
    url?: string;
};

export type ModelRelationship = {
    id: string;
    sourceId: string;
    destinationId: string;
    description?: string;
    technology?: string;
    tags?: string;
    url?: string;
    linkedRelationshipId?: string;
    properties: Record<string, string>;
    perspectives: Perspective[];
    [key: string]: unknown;
};

export type ModelElement = {
    id: string;
    type: ElementType;
    name: string;
    parentId?: string;
    description?: string;
    technology?: string;
    tags?: string;
    url?: string;
    metadata?: string;
    canonicalName?: string;
    environment?: string;
    /** The group the element belongs to, a path when the model nests groups. */
    group?: string;
    /** Internal is inside the enterprise. */
    location?: ElementLocation;
    /** A deployment node's instance count as written: `"4"`, `"0..N"`. */
    instances?: string | number;
    softwareSystemId?: string;
    containerId?: string;
    relationships?: ModelRelationship[];
    properties: Record<string, string>;
    perspectives: Perspective[];
    [key: string]: unknown;
};

export type AutomaticLayoutSettings = {
    implementation: "Dagre" | "Graphviz";
    rankDirection: "TopBottom" | "BottomTop" | "LeftRight" | "RightLeft";
    rankSeparation: number;
    nodeSeparation: number;
    edgeSeparation: number;
    vertices: boolean;
    applied?: boolean;
};

export type ElementView = { id: string; x?: number; y?: number };

export type Vertex = { x: number; y: number };

export type RelationshipView = {
    id: string;
    order?: string;
    description?: string;
    vertices?: Vertex[];
    routing?: string;
    /** Overrides the style's `jump` for this edge in this view. */
    jump?: boolean;
    position?: number;
    /** In a dynamic view, a step drawn from the destination back to the source. */
    response?: boolean;
    [key: string]: unknown;
};

/** An entry of a static view's `animations` list: one step (spec 11). */
export type AnimationEntry = {
    order?: number;
    elements?: string[];
    relationships?: string[];
};

export type ModelView = {
    key: string;
    type: ViewType;
    title?: string;
    name?: string;
    description: string;
    order?: number;
    softwareSystemId?: string;
    containerId?: string;
    elementId?: string;
    environment?: string;
    /** A filtered view's base view, and the tag filter it applies to it. */
    baseViewKey?: string;
    mode?: string;
    tags?: string[];
    /** An image view's picture: a URL, or a data URI once the build inlines it. */
    content?: string;
    contentLight?: string;
    contentDark?: string;
    /**
     * Set by the build on an image view that carries Mermaid source, which
     * then draws as a Mermaid diagram (ADR 24); `scripts/mermaid/` writes it.
     */
    mermaid?: MermaidDiagram;
    enterpriseBoundaryVisible?: boolean;
    /** A static view's steps, one entry each, in any order (spec 11). */
    animations?: AnimationEntry[];
    properties?: Record<string, string>;
    /** The canvas, in model units (spec 14). */
    dimensions?: { width: number; height: number };
    /** One of Structurizr's paper sizes, for a view without `dimensions`. */
    paperSize?: string;
    automaticLayout?: Partial<AutomaticLayoutSettings>;
    elements: ElementView[];
    relationships: RelationshipView[];
    [key: string]: unknown;
};

export type StyleDefinition = {
    tag: string;
    colorScheme?: ColorScheme;
    [key: string]: unknown;
};

export type Theme = {
    elements: StyleDefinition[];
    relationships: StyleDefinition[];
};

/* ------------------------------------------------------- Mermaid diagrams */

/** A flowchart's direction as Mermaid writes it, `TD` read as `TB`. */
export type MermaidDirection = "TB" | "BT" | "LR" | "RL";

/** The shapes a Mermaid node draws as (spec: Shapes); every other falls back to `Box`. */
export type MermaidShape =
    | "Box"
    | "RoundedBox"
    | "Diamond"
    | "Circle"
    | "Cylinder"
    | "Hexagon";

/**
 * An end of a Mermaid edge, as an End marker name (`EndMarker` in
 * `engine/geometry/markers.ts`): a flowchart's `none`, `arrow`, `circle` or
 * `cross`. The build fails a diagram with any end Renderizr doesn't know.
 */
export type MermaidEnd = string;

/** A node of a Mermaid flowchart, its label in plain text lines. */
export type MermaidNode = {
    id: string;
    label: string;
    shape: MermaidShape;
    /** The subgraph it sits in directly. */
    parent?: string;
    /** Its `class` and `:::` names, `classDef` names rather than tags. */
    classes: string[];
    /** Its `style` declarations, as written: `fill:#f00`. */
    styles: string[];
    /** Its `click` link, its target and its tooltip. */
    link?: string;
    linkTarget?: string;
    tooltip?: string;
};

/** An edge of a Mermaid flowchart, in source order. */
export type MermaidEdge = {
    /** Its index among the source's links, as `linkStyle` counts them. */
    id: string;
    source: string;
    target: string;
    label: string;
    /** `-->` is normal, `-.->` dotted and `==>` thick. */
    line: "normal" | "dotted" | "thick";
    start: MermaidEnd;
    end: MermaidEnd;
    /** Its `linkStyle` declarations, as written. */
    styles: string[];
};

/** A subgraph of a Mermaid flowchart. */
export type MermaidSubgraph = {
    id: string;
    label: string;
    parent?: string;
    /** Its own `direction`, when it sets one. */
    direction?: MermaidDirection;
    classes: string[];
    styles: string[];
};

/** Mermaid's config as the source's frontmatter and directives merge it. */
export type MermaidConfig = {
    theme?: string;
    themeVariables?: Record<string, unknown>;
    layout?: string;
    flowchart?: {
        nodeSpacing?: number;
        rankSpacing?: number;
        curve?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

/**
 * The palette a source's `theme` and `themeVariables` give, which the build
 * derives with Mermaid's own theme code (spec: Styling): only the colors
 * the honored theme variables reach, as Mermaid draws them.
 */
export type MermaidPalette = {
    /** Whether it is a dark palette, which then applies in both schemes. */
    dark: boolean;
    node: { background: string; stroke: string; color: string };
    edge: { color: string; labelColor: string; labelBackground: string };
    group: { background: string; stroke: string; color: string };
    /** An ERD's attribute rows. */
    rows: { odd: string; even: string };
    /** The source's `fontSize`, in Mermaid's px, when it sets one. */
    fontSize?: number;
    /** The source's `fontFamily`, when it sets one. */
    fontFamily?: string;
};

/** The plain model of a Mermaid flowchart the build parsed (spec: Parsing in the build). */
export type MermaidFlowchart = {
    kind: "flowchart";
    direction: MermaidDirection;
    nodes: MermaidNode[];
    edges: MermaidEdge[];
    subgraphs: MermaidSubgraph[];
    /** Each `classDef` by name, its declarations as written. */
    classDefs: Record<string, string[]>;
    /** The frontmatter `title`. */
    title?: string;
    config: MermaidConfig;
    /** Absent on a silent source, which sets no `theme` and no `themeVariables`. */
    palette?: MermaidPalette;
    error?: undefined;
};

/** The participant shapes a sequence diagram draws; every other type falls back to `participant`. */
export type MermaidParticipantType =
    | "participant"
    | "actor"
    | "database"
    | "queue";

/** A participant of a sequence diagram, in source order. */
export type MermaidParticipant = {
    /** Mermaid's name for it, which the messages use. */
    id: string;
    /** Its alias, else its name, in plain text lines. */
    label: string;
    type: MermaidParticipantType;
};

/** A sequence diagram's `box … end`. */
export type MermaidSequenceBox = {
    title: string;
    /** Its source color; absent for none or `transparent`. */
    fill?: string;
    participants: string[];
};

/** The fragments a sequence diagram draws; `par_over` reads as `par`. */
export type MermaidFragment =
    | "loop"
    | "alt"
    | "opt"
    | "par"
    | "critical"
    | "break"
    | "rect";

/** A message between two participants, or from one to itself. */
export type MermaidMessage = {
    kind: "message";
    /** Its index in Mermaid's list. */
    id: string;
    from: string;
    to: string;
    label: string;
    line: "solid" | "dotted";
    start: MermaidEnd;
    end: MermaidEnd;
    wrap: boolean;
    /** Where a central connection draws its dot. */
    dots?: "start" | "end" | "both";
    /** The participant this message creates. */
    creates?: string;
    /** The participants whose lifelines this message ends. */
    destroys?: string[];
};

/** A note beside or over the participants it names. */
export type MermaidNote = {
    kind: "note";
    placement: "left" | "right" | "over";
    from: string;
    to: string;
    text: string;
    wrap: boolean;
};

/** One step of a sequence diagram, in source order. */
export type MermaidSequenceItem =
    | MermaidMessage
    | MermaidNote
    | { kind: "activate" | "deactivate"; who: string }
    | {
          kind: "open";
          fragment: MermaidFragment;
          title: string;
          /** A `rect`'s source color. */
          color?: string;
      }
    | { kind: "section"; title: string }
    | { kind: "close" }
    | {
          kind: "autonumber";
          /** Absent: numbering goes on from where it was. */
          start?: number;
          step?: number;
          visible: boolean;
      };

/**
 * The plain model of a Mermaid sequence diagram the build parsed, which is
 * also its sequence script: the page lays its items out in order, in place
 * of placement and routing (spec: The view model).
 */
export type MermaidSequence = {
    kind: "sequence";
    participants: MermaidParticipant[];
    boxes: MermaidSequenceBox[];
    items: MermaidSequenceItem[];
    /** `showSequenceNumbers`: every message numbered, whatever `autonumber` says. */
    numbers: boolean;
    /** `mirrorActors`: the participants draw again below their lifelines. */
    mirror: boolean;
    rightAngles: boolean;
    title?: string;
    config: MermaidConfig;
    /** Absent until a sequence diagram's own palette lands. */
    palette?: undefined;
    error?: undefined;
};

/** A Mermaid diagram the build couldn't read, with the reason the page shows. */
export type MermaidFailure = { kind: string; error: string };

/** What the build gives an image view that carries Mermaid source. */
export type MermaidDiagram =
    | MermaidFlowchart
    | MermaidSequence
    | MermaidFailure;
