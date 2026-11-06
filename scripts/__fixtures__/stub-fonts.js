/**
 * Preloaded into the CLI's child process (via `--import`) in place of
 * `no-network.js` when a build embeds a font: Google Fonts answers with one
 * latin face for any family, and the face's file is bootstrap-icons' woff2,
 * which a browser loads as a real font. Every other request still fails, so
 * the build proves it reaches the network for nothing else.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const FACE_URL = "https://fonts.gstatic.com/s/stub/face.woff2";

const WOFF2 = readFileSync(
    createRequire(import.meta.url).resolve(
        "bootstrap-icons/font/fonts/bootstrap-icons.woff2",
    ),
);

const respond = (body) => new Response(body, { status: 200 });

globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.startsWith("https://fonts.googleapis.com/css2?")) {
        const family = new URL(href).searchParams
            .get("family")
            .split(":")[0]
            .replace(/\+/g, " ");
        return respond(
            `/* latin */\n@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: 400 700;\n  font-display: block;\n  src: url(${FACE_URL}) format('woff2');\n}\n`,
        );
    }
    if (href === FACE_URL) return respond(WOFF2);
    throw new Error(
        `the build reached the network for ${href}; the fixture build must be offline`,
    );
};
