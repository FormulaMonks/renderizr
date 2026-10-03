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
    | "Image";

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
    [key: string]: unknown;
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
    baseViewKey?: string;
    enterpriseBoundaryVisible?: boolean;
    properties?: Record<string, string>;
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
