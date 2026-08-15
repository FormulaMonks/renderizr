import "./underscore";
import graphlib from "graphlib/dist/graphlib.core.min.js";

// dagre's core build and jointjs' DirectedGraph layout both resolve `graphlib`
// as a free global.
window.graphlib = graphlib;

export default graphlib;
