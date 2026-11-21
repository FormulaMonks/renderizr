/**
 * The PNG of `renderizr export` (ADR 32): resvg draws the SVG the export
 * wrote, with the static faces `loadFont` instanced from the same woff2 the
 * SVG embeds and fontkit measured. The native resvg-js ignores
 * `fontBuffers`, so the faces go in as files. The SVG's icons are already
 * `data:` URLs, and the raster never calls `imagesToResolve()`, so resvg
 * fetches nothing. `@resvg/resvg-js` loads only on the first PNG.
 */

/** The `Resvg` class, loaded once. */
let resvgClass;

async function loadResvg() {
    if (!resvgClass) {
        const module = await import("@resvg/resvg-js");
        resvgClass = (module.default ?? module).Resvg;
    }
    return resvgClass;
}

/**
 * `svg` with its root's `width` and `height` set to `size`, stretched to
 * fill it the way the page's canvas stretches the SVG it draws. resvg's
 * own `fitTo` rounds the height up, so the size goes into the SVG instead.
 */
export const sizedSvg = (svg, { width, height }) =>
    svg.replace(
        /^<svg([^>]*?) width="[^"]*" height="[^"]*"/,
        `<svg$1 width="${width}" height="${height}" preserveAspectRatio="none"`,
    );

/**
 * `svg` with every `font-family` it names set to `family` alone. With the
 * system fonts loaded, resvg would draw the fallback stack in an installed
 * Helvetica or Arial, and a family a Mermaid source names in an installed
 * Georgia; pinned, the text draws in the faces fontkit measured, and only
 * the glyphs they lack fall back to a system font. The `@font-face` rules
 * inside `<style>` stay as they are.
 */
export const pinnedFamilies = (svg, family) =>
    svg.replace(
        /(\sfont-family=)"[^"]*"/g,
        `$1"&quot;${family.replace(/["&<]/g, "")}&quot;"`,
    );

/**
 * The PNG of `svg` at `size`, drawn in `family` from the TTF `files`. Only
 * those faces draw: a family the SVG names that is not among them, such as
 * the fallback stack when Arimo stands in, draws in `family`. With
 * `systemFonts`, for a view whose text holds characters the faces lack,
 * resvg also loads the system fonts and draws those characters from them,
 * the rest still in `family` (`pinnedFamilies`). Loading them takes a
 * fifth of a second, so views the faces cover whole skip it.
 */
export async function rasterize(
    svg,
    size,
    { family, files, systemFonts = false },
) {
    const Resvg = await loadResvg();
    const drawn = systemFonts ? pinnedFamilies(svg, family) : svg;
    const resvg = new Resvg(sizedSvg(drawn, size), {
        font: {
            fontFiles: files,
            loadSystemFonts: systemFonts,
            defaultFontFamily: family,
            sansSerifFamily: family,
        },
    });
    return resvg.render().asPng();
}
