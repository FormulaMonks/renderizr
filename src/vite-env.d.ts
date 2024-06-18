/// <reference types="vite/client" />

declare const workspaceData: Record<string, unknown>;
declare const structurizr: {
    Workspace: new (
        workspace: Record<string, unknown>,
    ) => import("./types/structurizr-workspace").Workspace;
    workspace: import("./types/structurizr-workspace").Workspace;
    io: Record<string, unknown>;
    shapes: Record<string, unknown>;
    ui: {
        loadThemes: (callback: () => void) => void;
        Diagram: new (
            id: string,
            diagramIsEditable: boolean,
            constructionCompleteCallback: () => void,
        ) => import("./types/structurizr-diagram").Diagram;
    };
    util: Record<string, unknown>;
    constants: {
        COMPONENT_ELEMENT_TYPE: string;
        COMPONENT_VIEW_TYPE: string;
        CONTAINER_ELEMENT_TYPE: string;
        CONTAINER_INSTANCE_ELEMENT_TYPE: string;
        CONTAINER_VIEW_TYPE: string;
        CONTENT_TYPE_IMAGE_JPG: string;
        CONTENT_TYPE_IMAGE_PNG: string;
        CONTENT_TYPE_IMAGE_SVG: string;
        CUSTOM_ELEMENT_TYPE: string;
        CUSTOM_VIEW_TYPE: string;
        DEFAULT_DEPLOYMENT_ENVIRONMENT_NAME: string;
        DEPLOYMENT_NODE_ELEMENT_TYPE: string;
        DEPLOYMENT_VIEW_TYPE: string;
        DYNAMIC_VIEW_TYPE: string;
        FILTERED_VIEW_TYPE: string;
        IMAGE_VIEW_TYPE: string;
        INFRASTRUCTURE_NODE_ELEMENT_TYPE: string;
        INTER_WORKSPACE_URL_PREFIX: string;
        INTER_WORKSPACE_URL_SEPARATOR: string;
        INTER_WORKSPACE_URL_SUFFIX: string;
        INTRA_WORKSPACE_URL_PREFIX: string;
        PERSON_ELEMENT_TYPE: string;
        SOFTWARE_SYSTEM_ELEMENT_TYPE: string;
        SOFTWARE_SYSTEM_INSTANCE_ELEMENT_TYPE: string;
        SYSTEM_CONTEXT_VIEW_TYPE: string;
        SYSTEM_LANDSCAPE_VIEW_TYPE: string;
    };
};
