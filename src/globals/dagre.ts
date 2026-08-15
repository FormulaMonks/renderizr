/*
 * Evaluation order is the whole point of these three modules. The `core`
 * browser builds of graphlib and dagre resolve their dependencies through
 * globals instead of imports — which is what keeps a second copy of lodash out
 * of the bundle — so each has to be on `window` before the next is evaluated.
 * ES modules run a module's body before the importer's next import is
 * evaluated, so the chain underscore → graphlib → dagre holds. Flattening
 * these into one file would not.
 */
import "./graphlib";
import dagre from "dagre/dist/dagre.core.min.js";

window.dagre = dagre;

export default dagre;
