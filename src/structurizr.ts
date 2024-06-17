import structurizrModule from "../submodules/structurizr-ui/src/js/structurizr.js?raw";
import "jointjs/dist/joint.css";
import "../submodules/structurizr-ui/src/css/structurizr-diagram.css";
import "jquery";
import "backbone";
import "lodash";
import * as joint from "jointjs";

// TODO: Add types for structurizr
declare const structurizr: {
    Workspace: Record<string, unknown>;
    io: Record<string, unknown>;
    shapes: Record<string, unknown>;
    ui: Record<string, unknown>;
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

async function getStructurizr() {
    // biome-ignore lint/security/noGlobalEval: loading non-module
    eval?.(structurizrModule);

    if (!structurizr) {
        throw new Error("Structurizr module not found");
    }

    window.joint = joint;

    await Promise.all([
        // @ts-expect-error
        import("../submodules/structurizr-ui/src/js/structurizr-util.js"),
        // @ts-expect-error
        import("../submodules/structurizr-ui/src/js/structurizr-ui.js"),
        // @ts-expect-error
        import("../submodules/structurizr-ui/src/js/structurizr-workspace.js"),
        // @ts-expect-error
        import("../submodules/structurizr-ui/src/js/structurizr-diagram.js"),
    ]);

    return structurizr;
}

export default getStructurizr;
