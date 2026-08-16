import "./structurizr-globals";
// Structurizr's own renderer, concatenated and minified at build time — the
// same code the official local server serves, so a workspace draws here
// exactly as it does there.
import renderer from "virtual:structurizr-renderer";

/**
 * The renderer is written as classic scripts and behaves like one: it shares a
 * namespace through a free global and assigns to undeclared names, both of
 * which a module's strict mode forbids. So it is run as a classic script.
 *
 * This is not `eval` — an inline script element is permitted by a CSP that
 * allows inline scripts at all, which is what makes the artifact build work.
 */
function runRenderer() {
    const script = document.createElement("script");
    script.textContent = renderer;
    document.head.appendChild(script);
    script.remove();
}

async function getStructurizr() {
    if (!window.structurizr) runRenderer();

    if (!window.structurizr) {
        throw new Error("Structurizr renderer failed to load");
    }

    return window.structurizr;
}

export default getStructurizr;
