import { escapeHtml } from "./html-entities.js";
import { rewriteTags } from "./html-tags.js";

/**
 * Images and video in the author's raw HTML, the way GitHub shows them:
 *
 * - `<img src>`, `srcset`, a `<picture>`'s `<source>` and a video's `src`
 *   and `poster` resolve to the copy the workspace embeds, the way a
 *   Markdown image does. A path with a fragment resolves too, and an SVG
 *   data URI stays as written.
 * - Every `<video>` renders a player, so it takes `controls` when the
 *   author left them out.
 * - AsciiDoc's `video::` renders the same player. A YouTube or Vimeo video
 *   becomes a link to it, since the page loads no frame.
 *
 * It runs on the rendered HTML, after the sanitizer, so it reads raw HTML
 * that markdown-it split across tokens as one piece. An image Renderizr
 * resolved already carries a data URI, which the resolver leaves alone.
 */

/**
 * `srcset` with each candidate's address resolved through `resolve`.
 *
 * @param {string} srcset
 * @param {import("./images.js").ImageResolver} resolve
 */
const resolveSrcset = (srcset, resolve) =>
    srcset
        .split(/,\s+/)
        .map((candidate) => {
            const [address, ...descriptors] = candidate.trim().split(/\s+/);
            return [resolve(address) ?? address, ...descriptors].join(" ");
        })
        .join(", ");

/**
 * `html` with the images and videos of its raw HTML resolved through
 * `resolveImage`, and every video a player.
 *
 * @param {string} html
 * @param {import("./images.js").ImageResolver | null | undefined} resolveImage
 * @returns {string}
 */
export function resolveMedia(html, resolveImage) {
    return rewriteTags(html, ["img", "source", "video"], (tag, attributes) => {
        if (resolveImage) {
            for (const name of ["src", "poster"]) {
                const value = attributes.get(name);
                const resolved = value ? resolveImage(value) : undefined;
                if (resolved !== undefined) attributes.set(name, resolved);
            }
            const srcset = attributes.get("srcset");
            if (srcset)
                attributes.set("srcset", resolveSrcset(srcset, resolveImage));
        }
        if (tag === "video" && !attributes.has("controls"))
            attributes.set("controls", null);
    });
}

/**
 * The markdown-it plugin for images and video in raw HTML.
 *
 * @param {import("markdown-it").default} md
 */
export function htmlMedia(md) {
    const render = md.renderer.render;
    md.renderer.render = function (tokens, options, env) {
        return resolveMedia(
            render.call(this, tokens, options, env),
            env?.resolveImage,
        );
    };
}

/** Where a YouTube or Vimeo video lives, by asciidoctor.js's poster name. */
const VIDEO_SITES = {
    youtube: (target) =>
        `https://www.youtube.com/watch?v=${encodeURIComponent(target.split("/")[0])}`,
    vimeo: (target) => `https://vimeo.com/${target}`,
};

/**
 * The asciidoctor.js plugin for images and video: `video::` renders a
 * player with its poster resolved, and the raw HTML of a passthrough
 * resolves the way Markdown's does.
 *
 * @param {import("./asciidoc.js").AsciiDoc} asciidoc
 */
export function asciiDocMedia(asciidoc) {
    asciidoc.converter(
        (Base) =>
            class extends Base {
                async convert_embedded(node) {
                    return resolveMedia(
                        await super.convert_embedded(node),
                        this.env.resolveImage,
                    );
                }

                async convert_video(node) {
                    const poster = String(node.getAttribute("poster") ?? "");
                    const site = VIDEO_SITES[poster];
                    if (site) {
                        const url = escapeHtml(
                            site(String(node.getAttribute("target") ?? "")),
                        );
                        const title = node.hasTitle()
                            ? `<div class="title">${node.title}</div>\n`
                            : "";
                        const id = node.id != null ? ` id="${node.id}"` : "";
                        return `${title}<p${id}><a href="${url}">${url}</a></p>`;
                    }
                    const resolved = poster
                        ? this.env.resolveImage?.(poster)
                        : undefined;
                    if (resolved !== undefined)
                        node.setAttribute("poster", resolved);
                    return super.convert_video(node);
                }
            },
    );
}
