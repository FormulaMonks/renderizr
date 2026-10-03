/**
 * The engine report (spec 15.1): a JSON summary of the geometry the island
 * drew for the view on screen, written into
 * `<script type="application/json" id="engine-report">` once the view is
 * painted. Chrome's `--dump-dom` carries it out of the page, so the acceptance
 * harness compares the drawing with the workspace without a DevTools
 * Protocol client and without reading pixels (ADR 11).
 *
 * Only a build made with `RENDERIZR_ENGINE_REPORT=1` writes it; everywhere
 * else the call is compiled out (`__RENDERIZR_ENGINE_REPORT__`).
 */

import type { ElementBox, Graph, Point } from "./graph";

export type ReportedElement = {
    id: string;
    shape: string;
    /** Top-left and size, in model units. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** The drawn outline as a closed polygon, where edge ends must land. */
    outline: Point[];
};

export type ReportedBoundary = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** Ids of the elements and boundaries drawn directly inside it. */
    children: string[];
};

export type ReportedEdge = {
    key: string;
    id: string;
    sourceId: string;
    targetId: string;
    order?: string;
    /** Whether the workspace routes this edge through stored vertices. */
    vertices: boolean;
    /** Points along the drawn route, source end first. */
    path: Point[];
};

export type EngineReport = {
    view: string;
    /** Milliseconds from navigation start to the view being painted. */
    readyAt: number;
    elements: ReportedElement[];
    boundaries: ReportedBoundary[];
    edges: ReportedEdge[];
};

/** The id of the script element the report is written into. */
export const REPORT_ID = "engine-report";

/**
 * The outline of an element drawn as its box: the four corners, clockwise
 * from the top-left. Shapes bring outlines of their own with #43.
 */
const boxOutline = ({ x, y, width, height }: ElementBox): Point[] => [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
];

/** Summarize what the island drew for `graph`. */
export function engineReport(graph: Graph, readyAt: number): EngineReport {
    return {
        view: graph.key,
        readyAt,
        elements: graph.elements.map((element) => ({
            id: element.id,
            shape: element.shape,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            outline: boxOutline(element),
        })),
        // The tracer draws no boundaries; #44 derives and reports them.
        boundaries: [],
        edges: graph.edges.map((edge) => ({
            key: edge.key,
            id: edge.id,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            ...(edge.order !== undefined && { order: edge.order }),
            vertices: edge.vertices.length > 0,
            path: edge.path,
        })),
    };
}

/**
 * Write `report` into the document, replacing the previous view's. `<` is
 * escaped so that no name in the workspace can close the element early when
 * the dumped document is parsed again.
 */
export function writeReport(document: Document, report: EngineReport) {
    let script = document.getElementById(REPORT_ID);
    if (!script) {
        script = document.createElement("script");
        script.setAttribute("id", REPORT_ID);
        script.setAttribute("type", "application/json");
        document.body.appendChild(script);
    }
    script.textContent = JSON.stringify(report).replace(/</g, "\\u003c");
}

/** Take the report out of the document, as the engine unmounts. */
export function removeReport(document: Document) {
    document.getElementById(REPORT_ID)?.remove();
}
