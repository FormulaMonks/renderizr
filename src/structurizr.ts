import structurizrModule from "../submodules/structurizr-ui/src/js/structurizr.js?raw";
import "jointjs/dist/joint.css";
import "../submodules/structurizr-ui/src/css/structurizr-diagram.css";
import $ from "jquery";
import Backbone from "backbone";
import lodash from "lodash";
import * as joint from "jointjs";

// TODO: Add types for structurizr
type Workspace = {
    getViews(): Record<string, string>[];
};

type Diagram = {
    setNavigationEnabled(enabled: boolean): void;
    resize(): void;
    zoomToWidthOrHeight(): void;
    changeView(key: string): void;
};

declare const structurizr: {
    Workspace: new (workspace: Record<string, unknown>) => Workspace;
    workspace: Workspace;
    io: Record<string, unknown>;
    shapes: Record<string, unknown>;
    ui: {
        loadThemes: (callback: () => void) => void;
        Diagram: new (
            id: string,
            diagramIsEditable: boolean,
            constructionCompleteCallback: () => void,
        ) => Diagram;
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

declare global {
    interface Window {
        $: typeof $;
        _: typeof lodash;
        jQuery: typeof $;
        V: typeof joint.V;
        structurizr: typeof structurizr;
    }
}

async function getStructurizr() {
    window.$ = window.jQuery = $;
    window.joint = joint;
    // @ts-expect-error
    window._ = lodash;
    window.Backbone = Backbone;
    window.V = joint.V;

    // biome-ignore lint/security/noGlobalEval: loading non-module
    eval?.(structurizrModule);

    if (!structurizr) {
        throw new Error("Structurizr module not found");
    }

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
