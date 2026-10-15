/**
 * The page side of an export (ADR 21): how the page sets its text, which
 * the pure serializer in `export-svg.ts` takes as a `TextSetting`, what the
 * title block says, and the file the serializer's SVG becomes: the SVG as
 * it is, or a PNG drawn from it.
 */

import { splitAuthor } from "../../model";
import type { ExportFormat } from "../contract";
import type { ExportedSvg, TextSetting, TitleBlockText } from "./export-svg";
import { canvasMeasure, diagramFontFamily } from "./fonts";

/** The ascent and descent of a sans-serif, for a browser that gives none. */
const FALLBACK_METRICS = { ascent: 0.9, descent: 0.22 };

/**
 * Whether `declared`, an `@font-face` rule's `font-family`, names `family`:
 * the same name, quoted or not. A family whose name only starts the same,
 * as "Inter Tight" does "Inter", is another font.
 */
export function declaresFamily(declared: string, family: string): boolean {
    const name = declared.trim().replace(/^(["'])(.*)\1$/, "$2");
    return name !== "" && name === family;
}

/**
 * The `@font-face` rules the page holds for `family`, as text. Builds embed
 * each face as a `data:` URL, so the SVG that carries them fetches nothing.
 */
function fontFaces(family: string | null): string {
    if (!family) return "";
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
        let list: CSSRuleList;
        try {
            list = sheet.cssRules;
        } catch {
            // A cross-origin sheet hides its rules; none of ours is one.
            continue;
        }
        for (const rule of Array.from(list)) {
            if (
                rule instanceof CSSFontFaceRule &&
                declaresFamily(
                    rule.style.getPropertyValue("font-family"),
                    family,
                )
            )
                rules.push(rule.cssText);
        }
    }
    return rules.join("");
}

/** How the diagram's text is set in `font`, measured in the page. */
export function textSetting(font: string | null): TextSetting {
    const family = diagramFontFamily(font);
    const context = document.createElement("canvas").getContext("2d");
    let { ascent, descent } = FALLBACK_METRICS;
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

/** A workspace field as text, or "" when it holds none. */
const field = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * The workspace's `lastModifiedDate` as a date in `locale` (the reader's
 * when left out), or "" when it holds no date.
 */
export function modifiedDate(value: unknown, locale?: string): string {
    const date = new Date(field(value));
    return field(value) && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString(locale)
        : "";
}

/**
 * What the title block says for view `title`, described as `description`,
 * in `workspace`, the raw workspace JSON as it was last saved. The
 * description leaves out its author, as the toolbar's does.
 */
export function titleBlockText(
    workspace: Record<string, unknown>,
    title: string,
    description: string,
): TitleBlockText {
    return {
        workspace: field(workspace.name),
        view: title,
        description: splitAuthor(description).description,
        user: field(workspace.lastModifiedUser),
        modified: modifiedDate(workspace.lastModifiedDate),
    };
}

/* ---------------- PNG (ADR 21) */

/** The most pixels a PNG holds: every browser draws a canvas this large. */
export const MAX_PIXELS = 16_777_216;

/** How many PNG pixels a PNG gives each of the export's pixels, at most. */
const PNG_SCALE = 2;

/**
 * The PNG's size for an export `width` by `height`: twice as large, or as
 * large as `MAX_PIXELS` allows, keeping its shape.
 */
export function pngSize(
    width: number,
    height: number,
): { width: number; height: number } {
    const scale = Math.min(PNG_SCALE, Math.sqrt(MAX_PIXELS / (width * height)));
    const png = {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
    };
    // A side held at one pixel can leave the other past the cap.
    if (png.width * png.height > MAX_PIXELS) {
        if (png.width >= png.height)
            png.width = Math.floor(MAX_PIXELS / png.height);
        else png.height = Math.floor(MAX_PIXELS / png.width);
    }
    return png;
}

/**
 * The SVG as a `data:` URL. Chrome taints a canvas that draws an SVG from a
 * `blob:` URL, and a tainted canvas gives no PNG.
 */
const svgDataUrl = (svg: string) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** The next animation frame. */
const nextFrame = () =>
    new Promise((resolve) => requestAnimationFrame(resolve));

/** The SVG, `width` by `height`, drawn onto a canvas and encoded as PNG. */
async function rasterize(
    svg: string,
    width: number,
    height: number,
): Promise<Blob> {
    const image = new Image();
    image.src = svgDataUrl(svg);
    await image.decode();
    const canvas = document.createElement("canvas");
    const size = pngSize(width, height);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser gives no canvas to draw on");
    // Safari draws an SVG's embedded font only from the second drawing on:
    // draw, wait a frame and draw again.
    context.drawImage(image, 0, 0, size.width, size.height);
    await nextFrame();
    context.clearRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) =>
                blob
                    ? resolve(blob)
                    : reject(new Error("The canvas gave no PNG")),
            "image/png",
        ),
    );
}

/** The serializer's export as a file's contents in `format`. */
export async function exportBlob(
    { svg, width, height }: ExportedSvg,
    format: ExportFormat,
): Promise<Blob> {
    if (format === "png") return rasterize(svg, width, height);
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}
