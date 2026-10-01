// Run the harness's production bundle through Renderizr's makeArtifactSafe,
// report sizes and whatever findUnspellable flags, then assemble the
// single-file test pages the browser runs open: stylesheet in a <style>, the
// escaped code in a <script type="module">, as scripts/plugins.js does.
//
// RENDERIZR_ROOT must point at a checkout with its dependencies installed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const root =
    process.env.RENDERIZR_ROOT ?? resolve(import.meta.dirname, "../../..");
const { findUnspellable, makeArtifactSafe } = await import(
    pathToFileURL(resolve(root, "scripts/escapes.js")).href
);

const dist = new URL("./dist/assets/", import.meta.url);
const files = readdirSync(dist);
const js = readFileSync(
    new URL(
        files.find((f) => f.endsWith(".js")),
        dist,
    ),
    "utf8",
);
const css = readFileSync(
    new URL(
        files.find((f) => f.endsWith(".css")),
        dist,
    ),
    "utf8",
);

const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
const count = (s, re) => (s.match(re) || []).length;

console.log("js  bytes", js.length, "gzip", gz(js));
console.log("css bytes", css.length, "gzip", gz(css));
console.log("findUnspellable(js) before:", findUnspellable(js).length);
console.log("findUnspellable(css):", findUnspellable(css).length);

const safe = makeArtifactSafe(js.replace(/__VITE_PRELOAD__/g, "void 0"));
console.log("changed by makeArtifactSafe:", safe !== js);
console.log("safe bytes", safe.length, "gzip", gz(safe));
console.log("findUnspellable(js) after:", findUnspellable(safe).length);
console.log(
    "String.fromCharCode terms added:",
    count(safe, /String\.fromCharCode\(/g) -
        count(js, /String\.fromCharCode\(/g),
);
console.log(
    "RegExp( terms added:",
    count(safe, /RegExp\(/g) - count(js, /RegExp\(/g),
);

// The header Simon Willison captured from a claude.ai artifact, as a meta tag
// (frame-ancestors is not valid in a meta tag and is dropped). The second
// policy removes 'unsafe-inline' from style-src to see what React Flow needs.
const CSP_ARTIFACT =
    "default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline'; connect-src 'none'; worker-src blob:; style-src 'unsafe-inline'; img-src blob: data:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
const CSP_NO_INLINE_STYLE =
    "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; style-src 'sha256-PLACEHOLDER'; img-src blob: data:; font-src data:; object-src 'none'";

const page = ({ scenario, csp, containerStyle }) => `<!doctype html>
<html><head><meta charset="utf-8">
${csp ? `<meta http-equiv="Content-Security-Policy" content="${csp}">` : ""}
<style>${css}</style>
<style>body{margin:0} #structurizr-diagram-target{${containerStyle}}</style>
</head>
<body data-scenario="${scenario}">
<div id="structurizr-diagram-target"></div>
<pre id="report">{}</pre>
<script type="module">${safe}</script>
</body></html>`;

const box = "width:640px;height:400px";
const pages = {
    plain: { scenario: "plain", csp: null, containerStyle: box },
    csp: { scenario: "csp", csp: CSP_ARTIFACT, containerStyle: box },
    "csp-no-inline-style": {
        scenario: "csp",
        csp: CSP_NO_INLINE_STYLE,
        containerStyle: box,
    },
    zero: { scenario: "zero", csp: null, containerStyle: "width:0;height:0" },
    hidden: { scenario: "hidden", csp: null, containerStyle: "display:none" },
    remount: { scenario: "remount", csp: null, containerStyle: box },
};

mkdirSync(new URL("./dist/pages/", import.meta.url), { recursive: true });
for (const [name, options] of Object.entries(pages)) {
    const html = page(options);
    const rejected = findUnspellable(html);
    if (rejected.length)
        console.log(`page ${name} still unspellable:`, rejected.length);
    writeFileSync(new URL(`./dist/pages/${name}.html`, import.meta.url), html);
}
console.log("pages written:", Object.keys(pages).join(", "));
