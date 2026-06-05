import type {
    Decision,
    DocumentationSection,
} from "./structurizr-documentation";

export type AutomaticLayout = {
    implementation: "Dagre" | "Graphviz";
    rankDirection: "TopBottom" | "BottomTop" | "LeftRight" | "RightLeft";
    rankSeparation: number;
    nodeSeparation: number;
    edgeSeparation: number;
    vertices: boolean;
};

export type View = {
    key: string;
    type:
        | "SystemContext"
        | "Container"
        | "Component"
        | "Dynamic"
        | "Deployment";
    elements: Record<string, unknown>[];
    relationships: Record<string, unknown>[];
    paperSize: string;
    dimensions: Record<string, unknown>;
    description: string;
    containerId?: string;
    softwareSystemId?: string;
    parentId?: string;
    environment?: string;
    automaticLayout?: AutomaticLayout;
};

type StructurizrBaseElement = {
    id: string;
    canonicalName: string;
    name: string;
    parentId?: string;
    tags?: string;
    type: string;
    url?: string;
    description: string;
    relationships: Record<string, unknown>[];
    properties: Record<string, unknown>;
};

type StructurizrSystemContext = {
    containers: StructurizrElement[];
    documentation?: { sections: []; decisions: []; images: [] };
    location: "Internal";
};

type StructurizrContainer = {
    containerId?: string;
    technology: string;
};

type StructurizrDeploymentInstance = {
    environment: string;
    deploymentGroups: string[];
    technology: string;
    instanceId: number;
};

export type StructurizrElement = StructurizrBaseElement &
    Partial<StructurizrSystemContext> &
    Partial<StructurizrContainer> &
    Partial<StructurizrDeploymentInstance>;

export type Workspace = {
    id: string;
    name: string;
    description: string;
    properties: Record<string, string>;
    lastModifiedDate: Date;
    version?: string;
    model: Record<string, unknown>;
    documentation: {
        sections: DocumentationSection[];
        decisions: Decision[];
        images: Record<string, unknown>[];
    };
    views: View[];
    getJson(): Record<string, unknown>;
    getProperty(name: string): string | undefined;
    getScope(name: string): string | undefined;
    getModelProperty(name: string): string | undefined;
    getViewSetProperty(viewKey: string, name: string): string | undefined;
    getViewOrViewSetProperty(viewKey: string, name: string): string | undefined;
    hasDocumentation(): boolean;
    hasDecisions(): boolean;
    hasElements(): boolean;
    getElements(): Record<string, unknown>[];
    findElementById(id: string): StructurizrElement | undefined;
    getTags(): string[];
    getAllTagsForElement(element: Record<string, unknown>): string[];
    getAllPropertiesForElement(
        element: Record<string, unknown>,
    ): Record<string, unknown>;
    getAllTagsForRelationship(relationship: Record<string, unknown>): string[];
    getAllPropertiesForRelationship(
        relationship: Record<string, unknown>,
    ): Record<string, unknown>;
    getRelationships(): Record<string, unknown>[];
    findRelationshipById(id: string): Record<string, unknown> | undefined;
    getPerspectiveNames(): string[];
    hasViews(): boolean;
    getViews(): View[];
    findSystemContextViewsForSoftwareSystem(softwareSystemId: string): View[];
    findContainerViewsForSoftwareSystem(softwareSystemId: string): View[];
    findComponentViewsForContainer(containerId: string): View[];
    findImageViewsForElement(elementId: string): View[];
    copyLayoutFrom(views: Record<string, unknown>, viewKey: string): void;
    hasStyles(): boolean;
    findElementStyleByTag(tag: string): Record<string, unknown> | undefined;
    findViewByKey(key: string): View | undefined;
    getTerminologyFor(item: Record<string, unknown>): string;
};
