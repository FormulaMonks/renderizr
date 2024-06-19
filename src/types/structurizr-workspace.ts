export type View = {
    key: string;
    elements: Record<string, unknown>[];
    relationships: Record<string, unknown>[];
    paperSize: string;
    dimensions: Record<string, unknown>;
};

export type Workspace = {
    id: string;
    name: string;
    description: string;
    properties: Record<string, string>;
    lastModifiedDate: Date;
    model: Record<string, unknown>;
    documentation: Record<string, unknown>;
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
    findElementById(id: string): Record<string, unknown> | undefined;
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
