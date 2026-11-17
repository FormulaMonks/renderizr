/**
 * PROTOTYPE (wayfinder ticket #335): show the views documentation embeds.
 *
 * `embedOf` reads every form Structurizr reads: `embed:<key>` (Markdown's
 * `![](embed:<key>)`, and AsciiDoc's `image::embed:<key>[]` once the AsciiDoc
 * pass turns it into Markdown), the `{type=graph}`, `{type=tree}` and
 * `{perspective=<name>}` parameters, and a published PNG of the same
 * workspace (`…/workspace/<id>/images/<key>.png`, `…/share/<id>/images/…`,
 * `…/share/<id>/<token>/images/…`).
 *
 * `showEmbeds` fills each placeholder the renderer leaves, the way
 * `RENDERIZR_EMBED` asks:
 *
 * - `live`: the React Flow engine draws the view inside the section.
 * - `picture`: the engine draws it once out of sight, its SVG export (ADR 21)
 *   stands in its place, and the engine goes.
 * - `card` (the default): a card that names the view and opens it on the
 *   diagrams page.
 */

import { buildDate, currentWorkspace, setLinksOf } from "../current-workspace";
import type { Engine } from "../engine";
import { WorkspaceModel } from "../model/workspace";
import type { ModelView } from "../model/types";
import { getDiagramTheme, readLabelState } from "./current-view";

declare const __RENDERIZR_EMBED__: string;

export type Embed = {
    key: string;
    type: string | null;
    perspective: string | null;
    source: string;
};

const PUBLISHED_PNG =
    /\/(?:workspace|share)\/(\d+)(?:\/[0-9a-f-]+)?\/images\/([^/?#]+)\.png(?:[?#].*)?$/i;

/** The view an image source embeds, or null when it embeds none. */
export function embedOf(src: string): Embed | null {
    const workspace = currentWorkspace().workspace as { id?: number };
    const views = new Set(
        new WorkspaceModel(currentWorkspace().workspace)
            .getViews()
            .map((view) => view.key),
    );

    if (src.startsWith("embed:")) {
        const raw = decodeURIComponent(src.slice("embed:".length));
        // Structurizr reads the braces only when no view has the whole
        // string as its key.
        const braces = raw.match(/^(.*?)\{(.*)\}$/);
        if (views.has(raw) || !braces) {
            return { key: raw, type: null, perspective: null, source: src };
        }
        const params = new URLSearchParams(braces[2].replace(/,/g, "&"));
        return {
            key: braces[1],
            type: params.get("type"),
            perspective: params.get("perspective"),
            source: src,
        };
    }

    const png = src.match(PUBLISHED_PNG);
    if (png && Number(png[1]) === workspace.id) {
        return {
            key: decodeURIComponent(png[2]),
            type: null,
            perspective: null,
            source: src,
        };
    }
    return null;
}

const escapeHtml = (text: string) =>
    text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/**
 * The placeholder the renderer writes where the image was. The comment keeps
 * it past the renderer's sweep of empty elements.
 */
export function embedPlaceholder(embed: Embed): string {
    return `<span class="doc-embed" data-key="${escapeHtml(embed.key)}" data-type="${escapeHtml(embed.type ?? "")}" data-perspective="${escapeHtml(embed.perspective ?? "")}" data-source="${escapeHtml(embed.source)}"><!-- view --></span>`;
}

const TYPE_NAMES: Record<string, string> = {
    SystemLandscape: "System landscape view",
    SystemContext: "System context view",
    Container: "Container view",
    Component: "Component view",
    Dynamic: "Dynamic view",
    Deployment: "Deployment view",
    Filtered: "Filtered view",
    Custom: "Custom view",
    Image: "Image view",
};

const viewTitle = (view: ModelView) => view.title || view.name || view.key;

function viewAddress(embed: Embed): string {
    const search = new URLSearchParams({ page: "diagrams", view: embed.key });
    if (embed.perspective) search.set("perspective", embed.perspective);
    return `#/?${search}`;
}

function caption(view: ModelView, embed: Embed): string {
    return `
        <span class="doc-embed-kind">${escapeHtml(TYPE_NAMES[view.type] ?? `${view.type} view`)}${embed.type ? ` · as a ${escapeHtml(embed.type)}` : ""}</span>
        <span class="doc-embed-title">${escapeHtml(viewTitle(view))}</span>
        <a class="doc-embed-open" href="${viewAddress(embed)}">Open in diagrams</a>`;
}

/**
 * Fill every placeholder in `root`. Returns what tears the drawn views down
 * when the section goes.
 */
export function showEmbeds(root: HTMLElement): () => void {
    const placeholders = [
        ...root.querySelectorAll<HTMLElement>("span.doc-embed"),
    ];
    if (placeholders.length === 0) return () => {};

    const model = new WorkspaceModel(currentWorkspace().workspace);
    const engines: Promise<Engine | null>[] = [];
    const abort = new AbortController();

    for (const placeholder of placeholders) {
        const embed: Embed = {
            key: placeholder.dataset.key ?? "",
            type: placeholder.dataset.type || null,
            perspective: placeholder.dataset.perspective || null,
            source: placeholder.dataset.source ?? "",
        };
        const view = model.findViewByKey(embed.key);
        const box = document.createElement("div");
        placeholder.replaceWith(box);

        if (!view) {
            box.className = "doc-embed-missing";
            box.innerHTML = `<strong>No view to embed.</strong> This workspace has no view with the key <code>${escapeHtml(embed.key)}</code>.`;
            continue;
        }

        if (__RENDERIZR_EMBED__ === "card") {
            box.className = "doc-embed-card";
            box.innerHTML = caption(view, embed);
            continue;
        }

        box.className = `doc-embed-frame doc-embed-${__RENDERIZR_EMBED__}`;
        box.innerHTML = `<div class="doc-embed-canvas"></div><div class="doc-embed-caption">${caption(view, embed)}</div>`;
        const canvas = box.querySelector<HTMLElement>(".doc-embed-canvas")!;
        engines.push(draw(canvas, embed, abort.signal));
    }

    return () => {
        abort.abort();
        for (const engine of engines) {
            void engine.then((drawn) => drawn?.unmount());
        }
    };
}

async function draw(
    canvas: HTMLElement,
    embed: Embed,
    signal: AbortSignal,
): Promise<Engine | null> {
    const { mountEngine, isAbortError } = await import("../engine");
    const entered = currentWorkspace();
    try {
        const engine = await mountEngine(
            canvas,
            {
                workspace: entered.workspace,
                set: setLinksOf(entered),
                view: embed.key,
                font: entered.branding.font?.family ?? null,
                buildDate,
                colorScheme: getDiagramTheme(),
                labels: readLabelState(),
                perspective: embed.perspective,
            },
            signal,
        );
        if (__RENDERIZR_EMBED__ !== "picture") return engine;

        // Wait for the engine to draw, then keep its export and let it go.
        await new Promise((resolve) => setTimeout(resolve, 600));
        const svg = await engine.exportView("svg");
        const url = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(svg);
        });
        engine.unmount();
        canvas.innerHTML = `<img alt="" src="${url}">`;
        canvas.classList.add("doc-embed-picture-ready");
        return null;
    } catch (error) {
        if (isAbortError(error)) return null;
        throw error;
    }
}
