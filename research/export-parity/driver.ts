// Prototype driver: what the engine's `exportView` does (src/engine/react-flow/index.ts),
// with the page's measuring and metrics handed in. Not product code.
import { WorkspaceModel, storedCanvasOf } from "../../src/model";
import { mermaidFontFamily } from "../../src/model/mermaid-styles";
import { exportFrame } from "../../src/engine/geometry/canvas";
import { buildGraph } from "../../src/engine/react-flow/graph";
import { exportSvg } from "../../src/engine/react-flow/export-svg";
import { stepStateOf } from "../../src/engine/react-flow/animation";
import { diagramFontFamily } from "../../src/engine/react-flow/fonts";
import { titleBlockText } from "../../src/engine/react-flow/export-file";

export type Options = {
    scheme: "light" | "dark";
    step: number | null;
    font: string | null;
    measure: (
        text: string,
        size: number,
        bold: boolean,
        ahead?: string,
    ) => number;
    ascent: number;
    descent: number;
    fontFaces: string;
    built: unknown;
    version: string | null;
};

const LABELS = { descriptions: true, technologies: true };

/** The view's animation steps, and the source family a Mermaid diagram names. */
export function describe(
    workspace: Record<string, unknown>,
    key: string,
    measure: Options["measure"],
) {
    const model = new WorkspaceModel(workspace as never);
    const graph = buildGraph(model, key, "light", LABELS, measure);
    const view = model.findViewByKey(key);
    return {
        steps: graph?.animation?.steps.length ?? 0,
        drawable: !!graph && !graph.image && !graph.error,
        source: mermaidFontFamily(view?.mermaid) ?? null,
    };
}

export function exportView(
    workspace: Record<string, unknown>,
    key: string,
    o: Options,
) {
    const model = new WorkspaceModel(workspace as never);
    const graph = buildGraph(model, key, o.scheme, LABELS, o.measure)!;
    const view = model.findViewByKey(key)!;
    const frame = exportFrame(storedCanvasOf(view), graph.bounds);
    return exportSvg({
        graph,
        step: stepStateOf(graph, o.step),
        frame,
        titleBlock: titleBlockText(
            workspace,
            graph.title,
            view.description,
            o.built,
            o.version,
            graph.perspective,
        ),
        text: {
            measure: o.measure,
            ascent: o.ascent,
            descent: o.descent,
            family: diagramFontFamily(o.font, mermaidFontFamily(view.mermaid)),
            fontFaces: o.fontFaces,
        },
    });
}
