/**
 * Render a page in headless Chrome and hand back the DOM it produced.
 *
 * The alternative — grepping the built bundle for strings — proves the
 * workspace was embedded and nothing about whether the document opens to
 * anything. This runs the real artifact in a real browser and reads the real
 * document out of it, which is the only way to catch a build that ships
 * perfectly and renders a blank page.
 *
 * `--dump-dom` prints the serialized document *after* scripts have run, which
 * is all that is needed and needs no protocol client, no WebSocket and no new
 * dependency. Chrome does not always exit once it has printed, so the process
 * is killed as soon as the document is complete.
 */

import { spawn } from "node:child_process";
import { accessSync, constants, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const CANDIDATES = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

/**
 * The first Chrome-shaped executable on this machine, or null.
 *
 * `RENDERIZR_NO_BROWSER=1` forces the null, which is how the skip path itself
 * gets exercised on a machine that does have a browser.
 */
export function findChrome() {
    if (process.env.RENDERIZR_NO_BROWSER) return null;

    for (const candidate of CANDIDATES) {
        if (!candidate) continue;
        try {
            accessSync(candidate, constants.X_OK);
            return candidate;
        } catch {
            /* try the next one */
        }
    }
    return null;
}

const FLAGS = [
    "--headless=new",
    // Headless defaults to 800x600, which is below the application's own
    // 900px breakpoint: the sidebar would render as a <select> and the tests
    // would be asserting the phone layout without meaning to.
    "--window-size=1400,1000",
    "--disable-gpu",
    // The sandbox needs privileges a CI container usually does not have, and
    // the page being rendered is one this suite just built.
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-client-side-phishing-detection",
    "--metrics-recording-only",
    "--mute-audio",
    "--disable-features=Translate,MediaRouter,OptimizationHints",
    // Virtual time runs the page's timers as fast as they can be run, so the
    // deferred first paint and the diagram's settle pass both happen at once
    // rather than in real seconds.
    "--virtual-time-budget=8000",
    "--dump-dom",
];

/**
 * Load `url` and resolve with the serialized DOM once the document is
 * complete. Rejects if Chrome fails or takes longer than `timeout`.
 */
export function dumpDOM(chrome, url, { timeout = 60_000 } = {}) {
    const profile = mkdtempSync(join(tmpdir(), "renderizr-chrome-"));

    return new Promise((resolve, reject) => {
        const child = spawn(
            chrome,
            [...FLAGS, `--user-data-dir=${profile}`, url],
            { stdio: ["ignore", "pipe", "pipe"] },
        );

        let out = "";
        let err = "";
        let settled = false;

        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.kill("SIGKILL");
            // SIGKILL is not synchronous, and Chrome's helper processes go on
            // writing into the profile for a moment after the parent is gone —
            // so this raced and threw ENOTEMPTY on `<profile>/Default`. Because
            // `finish` runs from a socket handler, that surfaced as an uncaught
            // exception and failed whichever test happened to be in flight.
            //
            // Retry a few times, and never let cleanup fail a run: a leftover
            // directory under the OS temp root is not worth a red build, and
            // the suite removes its scratch root on `after` regardless.
            try {
                rmSync(profile, {
                    recursive: true,
                    force: true,
                    maxRetries: 10,
                    retryDelay: 50,
                });
            } catch {
                // Left for the OS to reap.
            }
            if (error) reject(error);
            else resolve(value);
        };

        const timer = setTimeout(
            () =>
                finish(
                    new Error(
                        `headless Chrome did not finish ${url} within ${timeout}ms\n${err}`,
                    ),
                ),
            timeout,
        );

        child.stdout.on("data", (chunk) => {
            out += chunk;
            // Chrome has printed the whole document; it does not reliably exit
            // afterwards, so stop waiting for it to.
            if (out.trimEnd().endsWith("</html>")) finish(null, out);
        });

        child.stderr.on("data", (chunk) => {
            err += chunk;
        });

        child.on("error", finish);
        child.on("exit", (code) => {
            if (out.trimEnd().endsWith("</html>")) finish(null, out);
            else finish(new Error(`Chrome exited with ${code}\n${err}`));
        });
    });
}

const CONTENT_TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
    ".woff2": "font/woff2",
};

/**
 * Serve `root` over HTTP on a free port.
 *
 * The multi-file build loads its bundle with `<script type="module">`, which a
 * browser refuses to do over `file:` — so testing that output at all means
 * serving it, exactly as a reader would.
 */
export async function serveDirectory(root) {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(request.url.split("?")[0]);
        const file = join(root, normalize(path === "/" ? "/index.html" : path));

        if (!file.startsWith(root)) {
            response.writeHead(403).end();
            return;
        }

        readFile(file).then(
            (body) => {
                response.writeHead(200, {
                    "content-type":
                        CONTENT_TYPES[extname(file)] ??
                        "application/octet-stream",
                });
                response.end(body);
            },
            () => response.writeHead(404).end(),
        );
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    return {
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}
