// Mermaid's own renderer: what an image view would carry to draw the three types with mermaid itself.
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false });
export async function draw(text) {
    return (await mermaid.render("m", text)).svg;
}
