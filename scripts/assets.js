import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Google only serves woff2 to browsers it recognizes. */
const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const isUrl = (value) => /^https?:\/\//i.test(value);

const readSource = async (source) =>
    isUrl(source)
        ? Buffer.from(
              await fetch(source).then((response) => {
                  if (!response.ok) {
                      throw new Error(
                          `${source} responded ${response.status} ${response.statusText}`,
                      );
                  }
                  return response.arrayBuffer();
              }),
          )
        : readFile(resolve(process.cwd(), source));

/* ------------------------------------------------------------------ images */

/**
 * Sniff type and intrinsic size from the bytes, so a mislabelled extension
 * cannot produce a broken <img> or a wrong aspect ratio.
 */
function describeImage(buffer) {
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
        return {
            mime: "image/png",
            width: buffer.readUInt32BE(16),
            height: buffer.readUInt32BE(20),
        };
    }

    if (buffer.length > 10 && buffer.subarray(0, 3).toString() === "GIF") {
        return {
            mime: "image/gif",
            width: buffer.readUInt16LE(6),
            height: buffer.readUInt16LE(8),
        };
    }

    if (buffer.length > 4 && buffer.readUInt16BE(0) === 0xffd8) {
        for (let at = 2; at < buffer.length - 9; ) {
            if (buffer[at] !== 0xff) {
                at += 1;
                continue;
            }
            const marker = buffer[at + 1];
            // SOF0-SOF15, skipping the four that are not frame headers.
            if (
                marker >= 0xc0 &&
                marker <= 0xcf &&
                ![0xc4, 0xc8, 0xcc].includes(marker)
            ) {
                return {
                    mime: "image/jpeg",
                    height: buffer.readUInt16BE(at + 5),
                    width: buffer.readUInt16BE(at + 7),
                };
            }
            at += 2 + buffer.readUInt16BE(at + 2);
        }
        return { mime: "image/jpeg" };
    }

    if (
        buffer.length > 30 &&
        buffer.subarray(0, 4).toString() === "RIFF" &&
        buffer.subarray(8, 12).toString() === "WEBP"
    ) {
        return { mime: "image/webp" };
    }

    const head = buffer.subarray(0, 1024).toString("utf8");
    if (/<svg[\s>]/i.test(head)) {
        const svg = buffer.toString("utf8");
        const viewBox = svg.match(
            /viewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)/i,
        );
        return {
            mime: "image/svg+xml",
            width: viewBox ? Math.round(Number(viewBox[1])) : undefined,
            height: viewBox ? Math.round(Number(viewBox[2])) : undefined,
        };
    }

    throw new Error("Unrecognized image format");
}

/** Editor cruft is where the savings are; path data is left alone. */
const minifySvg = (svg) =>
    svg
        .replace(/<\?xml[\s\S]*?\?>/g, "")
        .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
        .replace(/<(desc|title)[\s\S]*?<\/\1>/gi, "")
        .replace(/\s(sodipodi|inkscape|rdf|cc|dc):[\w-]+\s*=\s*"[^"]*"/gi, "")
        .replace(/\sxmlns:(sodipodi|inkscape|rdf|cc|dc)\s*=\s*"[^"]*"/gi, "")
        .replace(/>\s+</g, "><")
        .trim();

function encodeSvg(svg) {
    // Percent-encoding usually beats base64 for markup; take whichever is smaller.
    const percent = `data:image/svg+xml,${encodeURIComponent(svg)
        .replace(/'/g, "%27")
        .replace(/%20/g, " ")
        .replace(/%3D/g, "=")
        .replace(/%3A/g, ":")
        .replace(/%2F/g, "/")}`.replace(/"/g, "'");
    const base64 = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

    return percent.length <= base64.length ? percent : base64;
}

export function toDataUri(buffer, mime) {
    if (mime === "image/svg+xml") {
        return encodeSvg(minifySvg(buffer.toString("utf8")));
    }

    return `data:${mime};base64,${buffer.toString("base64")}`;
}

/* -------------------------------------------------------------------- logo */

const SVG_SCRIPT = /<script[\s>]|\son\w+\s*=/i;

export async function loadLogo(logo) {
    if (!logo) return null;

    const buffer = await readSource(logo.source);
    const { mime, width, height } = describeImage(buffer);

    if (mime === "image/svg+xml" && SVG_SCRIPT.test(buffer.toString("utf8"))) {
        throw new Error(
            `${logo.source} contains script, which would run in the page. Export a flattened SVG instead.`,
        );
    }

    // The logo renders at 40px tall; anything beyond 4x that is wasted bytes.
    if (height && height > 160) {
        process.stderr.write(
            `warning: logo is ${width ?? "?"}x${height}px but renders at 40px tall — scale it down to save ${Math.round(buffer.length / 1024)}KB\n`,
        );
    }

    return {
        src: toDataUri(buffer, mime),
        alt: logo.alt || "",
        href: logo.href || null,
        width: width ?? null,
        height: height ?? null,
    };
}

/* -------------------------------------------------------------------- font */

const FACE_RE = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
const familyParam = (family) => family.trim().replace(/\s+/g, "+");

function fontCandidates({ family, weights, italic }) {
    const numeric = weights
        .map(Number)
        .filter((weight) => Number.isFinite(weight))
        .sort((a, b) => a - b);
    const min = numeric[0] ?? 400;
    const max = numeric[numeric.length - 1] ?? 700;
    const name = familyParam(family);
    const list = numeric.length ? numeric.join(";") : "400";

    // A variable range is one file for every weight, and usually half the bytes
    // of two static faces. Not every family has one, hence the ladder.
    return italic
        ? [
              `${name}:ital,wght@0,${min}..${max};1,${min}..${max}`,
              `${name}:ital,wght@${numeric.flatMap((w) => [`0,${w}`, `1,${w}`]).join(";")}`,
              name,
          ]
        : [`${name}:wght@${min}..${max}`, `${name}:wght@${list}`, name];
}

export async function loadFont(font) {
    if (!font) return null;

    let css = null;

    for (const candidate of fontCandidates(font)) {
        const response = await fetch(
            `https://fonts.googleapis.com/css2?family=${candidate}&display=block`,
            { headers: { "User-Agent": BROWSER_UA } },
        );

        if (response.ok) {
            css = await response.text();
            break;
        }
    }

    if (!css) {
        throw new Error(
            `Google Fonts has no family called "${font.family}". Check the name at fonts.google.com.`,
        );
    }

    if (!css.includes("format('woff2')")) {
        throw new Error(
            "Google Fonts returned a format other than woff2, which would triple the embedded size.",
        );
    }

    // css2 ignores &subset=; the subset name only appears in a comment per face.
    const wanted = new Set(font.subsets);
    const faces = [];

    for (const [, subset, face] of css.matchAll(FACE_RE)) {
        if (!wanted.has(subset)) continue;
        faces.push(face);
    }

    if (!faces.length) {
        throw new Error(
            `"${font.family}" has no ${font.subsets.join("/")} subset.`,
        );
    }

    const urls = new Map();
    for (const face of faces) {
        for (const [, url] of face.matchAll(/url\((https:\/\/[^)]+)\)/g)) {
            urls.set(url, null);
        }
    }

    await Promise.all(
        [...urls.keys()].map(async (url) => {
            const response = await fetch(url, {
                headers: { "User-Agent": BROWSER_UA },
            });
            const buffer = Buffer.from(await response.arrayBuffer());
            urls.set(
                url,
                `data:font/woff2;base64,${buffer.toString("base64")}`,
            );
        }),
    );

    const embedded = faces
        .map((face) =>
            face.replace(
                /url\((https:\/\/[^)]+)\)/g,
                (match, url) => `url(${urls.get(url) ?? match})`,
            ),
        )
        .join("");

    const bytes = embedded.length;
    process.stdout.write(
        `Embedded ${font.family} (${faces.length} face${faces.length === 1 ? "" : "s"}, ${Math.round(bytes / 1024)}KB)\n`,
    );

    return {
        family: font.family,
        css: `${embedded}:root{--renderizr-font:'${font.family.replace(/'/g, "")}',Helvetica,Arial,sans-serif}`,
    };
}

/* --------------------------------------------------------------- workspace */

/**
 * Themes, element icons and the branding logo are all fetched by the
 * Structurizr UI at runtime. A self-contained page cannot do that, so every
 * one of them is resolved here and folded into the workspace.
 */
async function inlineWorkspaceAssets(workspace) {
    const views = workspace.views ?? {};
    views.configuration ??= {};
    const configuration = views.configuration;
    configuration.styles ??= {};
    const styles = configuration.styles;
    const themes = configuration.themes ?? [];

    for (const themeUrl of themes) {
        try {
            const theme = await fetch(themeUrl).then((response) =>
                response.json(),
            );
            styles.elements = [
                ...(theme.elements ?? []),
                ...(styles.elements ?? []),
            ];
            styles.relationships = [
                ...(theme.relationships ?? []),
                ...(styles.relationships ?? []),
            ];
        } catch (error) {
            process.stderr.write(
                `warning: could not load theme ${themeUrl} — ${error.message}\n`,
            );
        }
    }

    if (themes.length) {
        // Leaving these in makes the renderer wait on the network at startup.
        configuration.themes = [];
    }

    const remote = new Map();
    const collect = (value) => {
        if (typeof value === "string" && isUrl(value)) remote.set(value, null);
    };

    for (const style of styles.elements ?? []) collect(style.icon);
    collect(configuration.branding?.logo);

    await Promise.all(
        [...remote.keys()].map(async (url) => {
            try {
                const buffer = await readSource(url);
                remote.set(url, toDataUri(buffer, describeImage(buffer).mime));
            } catch (error) {
                process.stderr.write(
                    `warning: could not inline ${url} — ${error.message}\n`,
                );
            }
        }),
    );

    for (const style of styles.elements ?? []) {
        if (style.icon && remote.get(style.icon)) {
            style.icon = remote.get(style.icon);
        }
    }
    if (
        configuration.branding?.logo &&
        remote.get(configuration.branding.logo)
    ) {
        configuration.branding.logo = remote.get(configuration.branding.logo);
    }

    return workspace;
}

export async function loadWorkspace(source, { font } = {}) {
    const raw = isUrl(source)
        ? await fetch(source).then((response) => {
              if (!response.ok) {
                  throw new Error(
                      `${source} responded ${response.status} ${response.statusText}`,
                  );
              }
              return response.text();
          })
        : await readFile(resolve(process.cwd(), source), "utf-8");

    let workspace;
    try {
        workspace = JSON.parse(raw);
    } catch (error) {
        throw new Error(`${source} is not valid JSON — ${error.message}`);
    }

    await inlineWorkspaceAssets(workspace);

    if (font) {
        // Makes the diagram engine render its labels in the chosen face too.
        workspace.views ??= {};
        const configuration = workspace.views.configuration ?? {};
        configuration.branding ??= {};
        configuration.branding.font = { name: font.family };
        workspace.views.configuration = configuration;
    }

    return workspace;
}
