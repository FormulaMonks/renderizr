/**
 * One view's export with no page around it (ADR 32): what the engine's
 * `exportView` does for the toolbar, given the text setting from outside.
 * The CLI's `renderizr export` bundles this module for Node, so nothing it
 * reaches may touch the DOM. It calls the same `buildGraph`, `exportFrame`,
 * `titleBlockText` and `exportSvg` as the toolbar, so the two exports stay
 * one serializer (ADR 21).
 */

import {
    type ModelView,
    mermaidFontFamily,
    setMermaidPrimaryColor,
    storedCanvasOf,
    WorkspaceModel,
} from "../../model";
import type { MeasureText } from "../geometry/boundary";
import type { ColorScheme, Labels } from "../contract";
import { exportFrame } from "../geometry/canvas";
import { stepStateOf } from "./animation";
import { titleBlockText } from "./export-file";
import type { ExportedSvg } from "./export-svg";
import { exportSvg } from "./export-svg";
import { diagramFontFamily } from "./fonts";
import { buildGraph } from "./graph";

export { setMermaidPrimaryColor, WorkspaceModel };

/**
 * What an export shows that a page reader could hide: every description
 * and technology, and every ERD entity expanded.
 */
export const EXPORT_LABELS: Labels = {
    descriptions: true,
    technologies: true,
    entitiesCollapsed: false,
};

/** How the export sets its text, which the page reads off its canvas. */
export type ExportText = {
    measure: MeasureText;
    ascent: number;
    descent: number;
    /**
     * The family the SVG names and embeds, or null to name the fallback
     * stack and embed nothing, as the toolbar does without `--font`.
     */
    font: string | null;
    /** The `@font-face` rules to embed, with `data:` sources. */
    fontFaces: string;
};

export type ExportViewOptions = {
    scheme: ColorScheme;
    /** The perspective the view draws under, by name; none when null. */
    perspective?: string | null;
    text: ExportText;
    /** The date the title block falls back to without `lastModifiedDate`. */
    built: unknown;
    version: string | null;
};

/**
 * What exporting a view gave: the export, or why the view has none. An
 * image view draws a picture rather than a diagram, and a view with an
 * error draws only its message.
 */
export type ViewExport =
    | { kind: "svg"; exported: ExportedSvg; perspective: string | null }
    | { kind: "image" }
    | { kind: "error"; message: string };

/** Every view the page lists, in drawer order: all but filtered views' bases. */
export const exportableViews = (model: WorkspaceModel): ModelView[] =>
    model.getViews();

/**
 * View `key` of `workspace`, the raw workspace JSON, exported the way the
 * toolbar exports it at its full view, with `labels` (everything shown by
 * default).
 */
export function exportView(
    model: WorkspaceModel,
    workspace: Record<string, unknown>,
    key: string,
    options: ExportViewOptions,
    labels: Labels = EXPORT_LABELS,
): ViewExport {
    const view = model.findViewByKey(key);
    if (!view) throw new Error(`No view ${key}`);
    const { measure, ascent, descent, font, fontFaces } = options.text;
    const graph = buildGraph(
        model,
        key,
        options.scheme,
        labels,
        measure,
        undefined,
        options.perspective ?? null,
    );
    if (!graph) throw new Error(`No view ${key}`);
    if (graph.image) return { kind: "image" };
    if (graph.error) return { kind: "error", message: graph.error };
    const exported = exportSvg({
        graph,
        step: stepStateOf(graph, null),
        frame: exportFrame(storedCanvasOf(view), graph.bounds),
        titleBlock: titleBlockText(
            workspace,
            graph.title,
            view.description,
            options.built,
            options.version,
            graph.perspective,
        ),
        text: {
            measure,
            ascent,
            descent,
            // The SVG names a Mermaid source's family as the page does; the
            // text is measured in the run's font all the same.
            family: diagramFontFamily(font, mermaidFontFamily(view.mermaid)),
            fontFaces: font ? fontFaces : "",
        },
    });
    return { kind: "svg", exported, perspective: graph.perspective ?? null };
}
