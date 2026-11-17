import { viewTitle } from "../../src/model/view-titles.js";
import {
    diagramCard,
    diagramNote,
    escapeHtml,
    viewAddress,
} from "./diagram-card.js";

/**
 * Embedded views (spec #342): the views a section or decision embeds, in
 * every form Structurizr reads, shown as diagram cards.
 *
 * - `![](embed:<key>)` in Markdown and `image::embed:<key>[]` in AsciiDoc.
 * - The `{type=graph}`, `{type=tree}` and `{perspective=<name>}` parameters,
 *   read only when no view has the whole string as its key, as Structurizr
 *   reads them. The card opens the view as the diagrams page draws it, so
 *   it names no type; a perspective goes into the card's address.
 * - A published PNG of the same workspace: `…/workspace/<id>/images/<key>.png`,
 *   `…/share/<id>/images/<key>.png` and `…/share/<id>/<token>/images/<key>.png`,
 *   where `<id>` is the workspace's `id`. One of another workspace stays an
 *   ordinary image.
 *
 * Keys come from the workspace that holds the section, so another
 * workspace's key in a set reads as a key the workspace lacks, which shows a
 * note in the card's place.
 */

/**
 * The card or note an image source embeds, as HTML, or `undefined` for an
 * ordinary image.
 *
 * @typedef {(src: string) => string | undefined} EmbedResolver
 */

/** Each view collection of a workspace, and the type `WorkspaceModel` gives its views. */
const VIEW_COLLECTIONS = Object.freeze([
    ["customViews", "Custom"],
    ["systemLandscapeViews", "SystemLandscape"],
    ["systemContextViews", "SystemContext"],
    ["containerViews", "Container"],
    ["componentViews", "Component"],
    ["dynamicViews", "Dynamic"],
    ["deploymentViews", "Deployment"],
    ["filteredViews", "Filtered"],
    ["imageViews", "Image"],
]);

/** The diagram's type a card names, by view type. */
const TYPE_NAMES = Object.freeze({
    Custom: "Custom view",
    SystemLandscape: "System landscape view",
    SystemContext: "System context view",
    Container: "Container view",
    Component: "Component view",
    Dynamic: "Dynamic view",
    Deployment: "Deployment view",
    Filtered: "Filtered view",
    Image: "Image view",
    Mermaid: "Mermaid diagram",
});

const EMBED = "embed:";

const PUBLISHED_PNG =
    /^https?:\/\/[^?#]*\/(?:workspace|share)\/(\d+)(?:\/[0-9a-f-]+)?\/images\/([^/?#]+)\.png(?:[?#].*)?$/i;

const decode = (value) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

/**
 * The view and perspective `src` embeds from a workspace whose view keys
 * are `keys` and whose id is `id`, or `null` when it embeds none.
 *
 * @param {string} src
 * @param {{ keys: ReadonlySet<string>, id: unknown }} workspace
 * @returns {{ key: string, perspective: string | null } | null}
 */
export function embedOf(src, { keys, id }) {
    if (src.startsWith(EMBED)) {
        const raw = decode(src.slice(EMBED.length));
        const braces = raw.match(/^(.*?)\{(.*)\}$/);
        if (keys.has(raw) || !braces) return { key: raw, perspective: null };
        const parameters = new Map(
            braces[2]
                .split(",")
                .map((pair) => pair.split("=").map((part) => part.trim())),
        );
        return {
            key: braces[1],
            perspective: parameters.get("perspective") || null,
        };
    }

    const png = src.match(PUBLISHED_PNG);
    if (png && id !== null && id !== undefined && String(id) === png[1]) {
        return { key: decode(png[2]), perspective: null };
    }
    return null;
}

/**
 * The embed resolver of `workspace`: each view it embeds as a diagram card
 * titled the way the diagrams page titles it, and a key it lacks as a note.
 *
 * @param {object} workspace
 * @returns {EmbedResolver}
 */
export function createEmbedResolver(workspace) {
    /** @type {Map<string, any>} */
    const views = new Map();
    for (const [collection, type] of VIEW_COLLECTIONS) {
        for (const view of workspace.views?.[collection] ?? []) {
            views.set(view.key, {
                ...view,
                type: type === "Image" && view.mermaid ? "Mermaid" : type,
            });
        }
    }

    /** @type {Map<string, { name?: string, type: string, parentId?: string }>} */
    const elements = new Map();
    const model = workspace.model ?? {};
    const add = (element, type, parentId) =>
        elements.set(element.id, { name: element.name, type, parentId });
    for (const person of model.people ?? []) add(person, "Person");
    for (const element of model.customElements ?? []) add(element, "Custom");
    for (const system of model.softwareSystems ?? []) {
        add(system, "SoftwareSystem");
        for (const container of system.containers ?? []) {
            add(container, "Container", system.id);
            for (const component of container.components ?? [])
                add(component, "Component", container.id);
        }
    }

    const lookups = {
        element: (id) => elements.get(id),
        view: (key) => views.get(key),
        enterprise: model.enterprise,
    };
    const keys = new Set(views.keys());

    return (src) => {
        const embed = embedOf(src, { keys, id: workspace.id });
        if (!embed) return;

        const view = views.get(embed.key);
        if (!view) {
            return diagramNote(
                `This workspace has no view with the key <code>${escapeHtml(embed.key)}</code>.`,
            );
        }

        const base =
            view.type === "Filtered" ? views.get(view.baseViewKey) : view;
        return diagramCard({
            type: TYPE_NAMES[base?.type ?? view.type] ?? "View",
            title: headerTitle(viewTitle(view, lookups)) || view.key,
            address: viewAddress(view.key, { perspective: embed.perspective }),
        });
    };
}

/**
 * A view's title as the diagrams page's header shows it: a title that
 * starts with a bracketed kind (`[System Context] Internet Banking`) shows
 * the rest, and the kind alone when nothing follows it.
 */
function headerTitle(title) {
    const match = title.match(/^\[([^\]]+)\]\s*(.*)$/);
    return match ? match[2].trim() || match[1] : title;
}

/**
 * A markdown-it plugin that shows each image embedding a view as the card
 * the render's `env.resolveEmbed` writes. A paragraph holding nothing but
 * one card stands as the card, with no paragraph around it.
 *
 * @param {import("markdown-it").default} md
 */
export function embeddedViews(md) {
    md.core.ruler.push("doc_embeds", (state) => {
        /** @type {EmbedResolver | undefined} */
        const resolve = state.env?.resolveEmbed;
        if (!resolve) return;

        state.tokens.forEach((block, index) => {
            const children = block.children;
            if (block.type !== "inline" || !children) return;

            let cards = 0;
            children.forEach((token, at) => {
                if (token.type !== "image") return;
                const html = resolve(String(token.attrGet("src") ?? ""));
                if (html === undefined) return;
                const card = new state.Token("html_inline", "", 0);
                card.content = html;
                card.meta = { embed: true };
                children[at] = card;
                cards++;
            });
            if (!cards) return;

            const rest = children.filter(
                (token) =>
                    token.type !== "softbreak" &&
                    !(token.type === "text" && !token.content.trim()),
            );
            const open = state.tokens[index - 1];
            const close = state.tokens[index + 1];
            if (
                rest.length === 1 &&
                rest[0].meta?.embed &&
                open?.type === "paragraph_open" &&
                close?.type === "paragraph_close"
            ) {
                block.children = rest;
                open.hidden = true;
                close.hidden = true;
            }
        });
    });
}

/**
 * An asciidoctor.js plugin (`asciidoc.use()`) that shows each image
 * embedding a view, block or inline, as the card the render's
 * `env.resolveEmbed` writes.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function embeddedViewsInAsciiDoc(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_image(node) {
                    const html = this.env.resolveEmbed?.(
                        String(node.getAttribute("target") ?? ""),
                    );
                    return html ?? super.convert_image(node);
                }

                async convert_inline_image(node) {
                    const html =
                        (node.type || "image") === "image"
                            ? this.env.resolveEmbed?.(String(node.target ?? ""))
                            : undefined;
                    return html ?? super.convert_inline_image(node);
                }
            },
    );
}
