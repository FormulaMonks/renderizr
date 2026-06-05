import structurizrModule from "../submodules/structurizr-ui/src/js/structurizr.js?raw";
import "jointjs/dist/joint.css";
import "../submodules/structurizr-ui/src/css/structurizr-diagram.css";
import $ from "jquery";
import Backbone from "backbone";
import lodash from "lodash";
import * as joint from "jointjs";
import canvg from "canvg";
import dagre from "dagre";
import graphlib from "graphlib";

declare global {
    interface Window {
        $: typeof $;
        _: typeof lodash;
        jQuery: typeof $;
        V: typeof joint.V;
        structurizr: typeof structurizr;
        canvg: typeof canvg;
        dagre: typeof dagre;
        graphlib: typeof graphlib;
    }
}

async function getStructurizr() {
    window.$ = window.jQuery = $;
    window.joint = joint;
    // @ts-expect-error
    window._ = lodash;
    window.Backbone = Backbone;
    window.V = joint.V;
    window.canvg = canvg;
    window.dagre = dagre;
    window.graphlib = graphlib;

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
