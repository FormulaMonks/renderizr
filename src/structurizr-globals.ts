import "jointjs/dist/joint.css";
import "../submodules/structurizr-ui/src/css/structurizr-diagram.css";
import $ from "jquery";
// The jointjs entry point pulls in every shape pack (uml, erd, logic, chess…);
// Structurizr builds its own shapes, so only the core is needed.
import * as joint from "jointjs/src/core.mjs";
import { DirectedGraph } from "jointjs/src/layout/DirectedGraph/DirectedGraph.mjs";
import type lodash from "./globals/underscore";
import "./globals/dagre";

declare global {
    interface Window {
        $: typeof $;
        jQuery: typeof $;
        _: typeof lodash;
        joint: typeof joint;
        V: typeof joint.V;
        g: typeof joint.g;
        dagre: unknown;
        graphlib: unknown;
        structurizr: typeof structurizr;
    }
}

// core.mjs exports `layout` holding only the port layouts.
(joint.layout as Record<string, unknown>).DirectedGraph = DirectedGraph;

window.$ = window.jQuery = $;
window.joint = joint;
window.V = joint.V;
// structurizr-diagram.js reaches for the bare geometry global when it computes
// shape perimeter connection points.
window.g = joint.g;
