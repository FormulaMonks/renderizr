/**
 * The page's footer: one line that says what is on screen and credits
 * Renderizr. A C4 view is in C4 notation and drawn with React Flow, a
 * Mermaid diagram comes from Mermaid source and is drawn with React Flow, a
 * picture is shown as it is, and the documentation and decisions pages say
 * whose they are.
 */

import type { ModelView } from "../model";

/** What the footer speaks for. */
export type DisclaimerKind = "c4" | "mermaid" | "image" | "docs" | "adrs";

const link = (href: string, text: string) =>
    `<a href="${href}" target="_blank">${text}</a>`;

const STRUCTURIZR = link("https://structurizr.com/", "Structurizr");
const REACT_FLOW = link("https://reactflow.dev/", "React Flow");
const RENDERIZR = link(
    "https://github.com/FormulaMonks/renderizr",
    "Renderizr",
);

/** The footer's first sentence, by what is on screen. */
const OPENINGS: Record<DisclaimerKind, string> = {
    c4: `Diagrams from a ${STRUCTURIZR} workspace, in ${link("https://c4model.com/", "C4 notation")}, drawn with ${REACT_FLOW}.`,
    mermaid: `Diagrams from a ${STRUCTURIZR} workspace, from ${link("https://mermaid.js.org/", "Mermaid")} source, drawn with ${REACT_FLOW}.`,
    image: `Diagrams from a ${STRUCTURIZR} workspace.`,
    docs: `A ${STRUCTURIZR} workspace's documentation.`,
    adrs: `A ${STRUCTURIZR} workspace's decisions.`,
};

/**
 * The footer's HTML for `kind`, with the `version` of Renderizr that built
 * the page. A site outlives the version that built it, and the first
 * question about a stale-looking render is which one that was; the version
 * stays out rather than faked when the build couldn't read it.
 */
export function disclaimerHtml(
    kind: DisclaimerKind,
    version: string | null,
): string {
    const credit = version ? `${RENDERIZR} v${version}` : RENDERIZR;
    return `${OPENINGS[kind]} Created with ${credit}.`;
}

/** The footer a diagram view takes: a Mermaid diagram, a picture, or C4. */
export function disclaimerKind(view: Pick<ModelView, "type">): DisclaimerKind {
    if (view.type === "Mermaid") return "mermaid";
    if (view.type === "Image") return "image";
    return "c4";
}

/** Say `kind` in the page's footer, when the page has one. */
export function showDisclaimer(kind: DisclaimerKind): void {
    const footer = document.getElementById("disclaimer");
    if (footer) footer.innerHTML = disclaimerHtml(kind, __RENDERIZR_VERSION__);
}
