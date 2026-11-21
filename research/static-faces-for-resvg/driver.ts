// Prototype driver: export one view from Node. Not product code.
import { WorkspaceModel, storedCanvasOf } from "../../src/model";
import { exportFrame } from "../../src/engine/geometry/canvas";
import { buildGraph } from "../../src/engine/react-flow/graph";
import { exportSvg } from "../../src/engine/react-flow/export-svg";
import { diagramFontFamily } from "../../src/engine/react-flow/fonts";
export function exportView(workspace: any, key: string, font: string | null, measure: any, ascent: number, descent: number) {
  const model = new WorkspaceModel(workspace);
  const labels = { descriptions: true, technologies: true };
  const graph = buildGraph(model, key, "light", labels, measure)!;
  const view = model.findViewByKey(key)!;
  const frame = exportFrame(storedCanvasOf(view), graph.bounds);
  return exportSvg({ graph, frame, titleBlock: { view: graph.title, description: view.description ?? "", user: "Prototype", modified: "11/21/2026", credit: "Created with Renderizr" },
    text: { measure, ascent, descent, family: diagramFontFamily(font), fontFaces: "" } });
}
