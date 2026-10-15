/**
 * The page side of an export (ADR 21): how the page sets its text, which
 * the pure serializer in `export-svg.ts` takes as a `TextSetting`, what the
 * title block says, and the file the serializer's SVG becomes.
 */

import type { ExportFormat } from "../contract";
import type { TextSetting, TitleBlockText } from "./export-svg";
import { canvasMeasure, diagramFontFamily } from "./fonts";

/** The ascent and descent of a sans-serif, for a browser that gives none. */
const FALLBACK_METRICS = { ascent: 0.9, descent: 0.22 };

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
                rule.cssText.includes(family)
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
 * in `workspace`, the raw workspace JSON as it was last saved.
 */
export function titleBlockText(
    workspace: Record<string, unknown>,
    title: string,
    description: string,
): TitleBlockText {
    return {
        workspace: field(workspace.name),
        view: title,
        description,
        user: field(workspace.lastModifiedUser),
        modified: modifiedDate(workspace.lastModifiedDate),
    };
}

/** The export as a file's contents. Only SVG is built: a PNG rejects. */
export async function exportBlob(
    svg: string,
    format: ExportFormat,
): Promise<Blob> {
    if (format === "png") throw new Error("PNG export is not built yet");
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}
