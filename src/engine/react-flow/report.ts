/**
 * The engine report (spec 15.1): a JSON summary of the geometry the island
 * drew for the view on screen, which the acceptance harness compares with the
 * workspace without reading pixels (ADR 11). `report-script.ts` carries it
 * out of the page.
 *
 * Pure, like the graph it summarizes: no DOM and no React, so it runs under
 * `node --test`.
 */

import type { Graph, Point } from "./graph";

export type ReportedElement = {
    id: string;
    /** The shape it is drawn as; the harness derives its outline from this. */
    shape: string;
    /** Top-left and size, in model units. */
    x: number;
    y: number;
    width: number;
    height: number;
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
    /** Whether the relationship has vertices, so its route is the author's. */
    routedByAuthor: boolean;
    /** Points along the drawn route, source end first. */
    route: Point[];
};

export type EngineReport = {
    view: string;
    elements: ReportedElement[];
    boundaries: ReportedBoundary[];
    edges: ReportedEdge[];
};

/** Summarize what the island drew for `graph`. */
export function engineReport(graph: Graph): EngineReport {
    return {
        view: graph.key,
        elements: graph.elements.map((element) => ({
            id: element.id,
            shape: element.shape,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
        })),
        boundaries: graph.boundaries.map((boundary) => ({
            id: boundary.id,
            x: boundary.x,
            y: boundary.y,
            width: boundary.width,
            height: boundary.height,
            children: boundary.children,
        })),
        edges: graph.edges.map((edge) => ({
            key: edge.key,
            id: edge.id,
            sourceId: edge.sourceId,
            targetId: edge.targetId,
            ...(edge.order !== undefined && { order: edge.order }),
            routedByAuthor: edge.vertices.length > 0,
            route: edge.route,
        })),
    };
}
