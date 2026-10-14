/**
 * PROTOTYPE (#160): turn the SVG `export-svg.ts` builds into a file the
 * reader saves. The PNG goes through an `<img>` loaded from a `data:` URL
 * (Chrome taints `blob:`), a `<canvas>` at 2×, and `toBlob` (#159).
 */

import { canvasMeasure, diagramFontFamily } from "./fonts";
import type { TextSetting } from "./export-svg";

export type ExportFormat = "svg" | "png";

/** The most pixels a canvas may hold on iOS; above it `toBlob` gives nothing. */
const MAX_PIXELS = 16_777_216;

/** How much larger than the canvas the PNG is drawn. */
const PNG_SCALE = 2;

/** The `@font-face` rules the page holds for `family`, as text. */
function fontFaces(family: string | null): string {
    if (!family) return "";
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
        let list: CSSRuleList;
        try {
            list = sheet.cssRules;
        } catch {
            continue;
        }
        for (const rule of Array.from(list)) {
            if (
                rule instanceof CSSFontFaceRule &&
                rule.cssText.includes(family)
            )
                rules.push(rule.cssText);
        }
    }
    return rules.join("");
}

/** How the diagram's text is set, measured in the page. */
export function textSetting(font: string | null): TextSetting {
    const family = diagramFontFamily(font);
    const context = document.createElement("canvas").getContext("2d");
    let ascent = 0.9;
    let descent = 0.22;
    if (context) {
        context.font = `100px ${family}`;
        const metrics = context.measureText("Hg");
        if (metrics.fontBoundingBoxAscent) {
            ascent = metrics.fontBoundingBoxAscent / 100;
            descent = metrics.fontBoundingBoxDescent / 100;
        }
    }
    return {
        measure: canvasMeasure(document, family),
        ascent,
        descent,
        family,
        fontFaces: fontFaces(font),
    };
}

const svgDataUrl = (svg: string) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The SVG drawn onto a canvas and encoded as PNG. */
async function rasterize(
    svg: string,
    width: number,
    height: number,
): Promise<Blob> {
    const image = new Image();
    image.src = svgDataUrl(svg);
    await image.decode();
    const scale = Math.min(PNG_SCALE, Math.sqrt(MAX_PIXELS / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw a canvas.");
    // Safari may draw an SVG's embedded font only once it has been drawn
    // once: draw, wait a frame, and draw again.
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) =>
                blob
                    ? resolve(blob)
                    : reject(new Error("The PNG came out empty.")),
            "image/png",
        ),
    );
}

/** The export as a file's contents. */
export async function exportBlob(
    svg: string,
    format: ExportFormat,
    width: number,
    height: number,
): Promise<Blob> {
    if (format === "svg")
        return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    return rasterize(svg, width, height);
}

/** Save `blob` as `name` through `<a download>`. */
export function saveFile(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
