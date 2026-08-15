// Static imports in a guaranteed evaluation order: the globals must exist
// before structurizr.js runs, and each of the four files that follow reads the
// `structurizr` namespace the one before it extended. Loading them any other
// way (eval, dynamic import) either breaks under a strict CSP or leaves the
// order at the mercy of the bundler.
import "./structurizr-globals";
import "../submodules/structurizr-ui/src/js/structurizr.js";
import "../submodules/structurizr-ui/src/js/structurizr-util.js";
import "../submodules/structurizr-ui/src/js/structurizr-ui.js";
import "../submodules/structurizr-ui/src/js/structurizr-workspace.js";
import "../submodules/structurizr-ui/src/js/structurizr-diagram.js";

async function getStructurizr() {
    if (!window.structurizr) {
        throw new Error("Structurizr module not found");
    }

    return window.structurizr;
}

export default getStructurizr;
