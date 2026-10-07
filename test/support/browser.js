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
 *
 * The same run logs every console message to stderr, which is how the
 * acceptance harness hears about warnings, and `--screenshot` saves the window
 * as a PNG for the contact sheet, all with the same one executable.
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
    // Every console message the page writes goes to stderr as a
    // `:CONSOLE` line, which is how the acceptance harness hears about
    // warnings and uncaught errors without a protocol client.
    "--enable-logging=stderr",
    "--v=0",
];

/**
 * For a page built to need no network (`offline`): no host resolves but the
 * loopback `serveDirectory` listens on, so a page that reaches for the network
 * fails at once instead of loading something, or waiting on it. A pending
 * request holds virtual time still, and the page would never finish.
 */
const OFFLINE_FLAGS = [
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
];

/**
 * Run Chrome on `url` with `FLAGS` plus `extra`, and resolve with its stdout
 * and stderr once `isDone(stdout, stderr)` says the output is complete or
 * Chrome exits. Rejects if Chrome fails or takes longer than `timeout`.
 */
function runChrome(chrome, url, extra, { timeout, isDone }) {
    const profile = mkdtempSync(join(tmpdir(), "renderizr-chrome-"));

    return new Promise((resolve, reject) => {
        const child = spawn(
            chrome,
            [...FLAGS, ...extra, `--user-data-dir=${profile}`, url],
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
            // Chrome has printed everything it was asked for; it does not
            // reliably exit afterwards, so stop waiting for it to.
            if (isDone(out, err)) finish(null, { out, err });
        });

        child.stderr.on("data", (chunk) => {
            err += chunk;
            if (isDone(out, err)) finish(null, { out, err });
        });

        child.on("error", finish);
        child.on("exit", (code) => {
            if (isDone(out, err)) finish(null, { out, err });
            else finish(new Error(`Chrome exited with ${code}\n${err}`));
        });
    });
}

const documentComplete = (out) => out.trimEnd().endsWith("</html>");

/**
 * The console messages in Chrome's stderr log, in order. Chrome writes each
 * as `[…:INFO:CONSOLE:12] "message", source: url (12)` (older builds put the
 * line number in parentheses), whatever the level it was logged at.
 */
export function consoleMessages(stderr) {
    const messages = [];
    for (const match of stderr.matchAll(
        /:CONSOLE[:(]?\d*\)?\] "([\s\S]*?)", source: /g,
    )) {
        messages.push(match[1]);
    }
    return messages;
}

/**
 * Load `url` and resolve with the serialized DOM, every console message the
 * page wrote while it loaded, and `elapsed`: the wall-clock milliseconds from
 * launching Chrome to the document arriving. Rejects if Chrome fails or takes
 * longer than `timeout`. `flags` are extra Chrome switches for this run, such
 * as `--force-prefers-reduced-motion`.
 *
 * The page cannot time itself here. `--virtual-time-budget` fakes every clock
 * inside it, `performance.now()` and `Date.now()` alike, and skips the waits
 * on timers, so a page that took seconds can report milliseconds. `elapsed`
 * is read from Node's own clock instead, which virtual time does not touch.
 * It includes Chrome's own start: take `launchCost` off it for the page's
 * share. Chromes running beside it slow it down too, so time one page at a
 * time.
 */
export async function renderPage(
    chrome,
    url,
    { timeout = 60_000, offline = false, flags = [] } = {},
) {
    const launched = performance.now();
    const { out, err } = await runChrome(
        chrome,
        url,
        ["--dump-dom", ...(offline ? OFFLINE_FLAGS : []), ...flags],
        { timeout, isDone: documentComplete },
    );
    return {
        html: out,
        console: consoleMessages(err),
        elapsed: performance.now() - launched,
    };
}

/** A page with nothing to load or run. */
const BLANK_PAGE = "data:text/html,<!doctype html><title>blank</title>";

/**
 * What `renderPage` spends on Chrome rather than on the page: the wall-clock
 * milliseconds to launch Chrome and dump a blank page. The least of `runs`,
 * since the first launch also pays for a cold disk cache.
 */
export async function launchCost(chrome, { runs = 3 } = {}) {
    let least = Number.POSITIVE_INFINITY;
    for (let run = 0; run < runs; run++) {
        const { elapsed } = await renderPage(chrome, BLANK_PAGE, {
            offline: true,
        });
        least = Math.min(least, elapsed);
    }
    return least;
}

/**
 * Load `url` and save a PNG of the window to `path`, once virtual time has
 * run the page's timers out. `offline` is as for `renderPage`.
 */
export async function screenshot(
    chrome,
    url,
    path,
    { timeout = 60_000, offline = false } = {},
) {
    const extra = [`--screenshot=${path}`, ...(offline ? OFFLINE_FLAGS : [])];
    await runChrome(chrome, url, extra, {
        timeout,
        // Chrome says so on stderr once the file is written, and may then
        // linger like it does after `--dump-dom`.
        isDone: (out, err) => /bytes written to file/.test(`${out}${err}`),
    });
}

/**
 * Start Chrome with the DevTools protocol on a pipe, for the few tests that
 * have to drive a page: drag with the mouse, press keys and read state back.
 * `--remote-debugging-pipe` talks NUL-separated JSON over file descriptors 3
 * (to Chrome) and 4 (from Chrome), so it needs no WebSocket and no new
 * dependency either.
 *
 * Resolves with `open(url)`, which opens a tab and hands back a `page` to
 * drive, and `close()`, which ends Chrome.
 */
export async function openBrowser(chrome) {
    const profile = mkdtempSync(join(tmpdir(), "renderizr-chrome-"));
    const flags = FLAGS.filter(
        // Virtual time would run the page's timers ahead of the pointer.
        (flag) => !flag.startsWith("--virtual-time-budget"),
    );
    const child = spawn(
        chrome,
        [
            ...flags,
            "--remote-debugging-pipe",
            `--user-data-dir=${profile}`,
            "about:blank",
        ],
        { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
    );
    const [, , , toChrome, fromChrome] = child.stdio;

    let next = 0;
    let buffer = "";
    const pending = new Map();
    fromChrome.setEncoding("utf8");
    fromChrome.on("data", (chunk) => {
        buffer += chunk;
        for (let end = buffer.indexOf("\0"); end >= 0; ) {
            const message = JSON.parse(buffer.slice(0, end));
            buffer = buffer.slice(end + 1);
            end = buffer.indexOf("\0");
            const waiting = pending.get(message.id);
            if (!waiting) continue;
            pending.delete(message.id);
            if (message.error) waiting.reject(new Error(message.error.message));
            else waiting.resolve(message.result);
        }
    });
    const send = (method, params = {}, sessionId = undefined) =>
        new Promise((resolve, reject) => {
            const id = ++next;
            pending.set(id, { resolve, reject });
            toChrome.write(
                `${JSON.stringify({ id, method, params, sessionId })}\0`,
            );
        });

    return {
        async open(url) {
            const { targetId } = await send("Target.createTarget", { url });
            const { sessionId } = await send("Target.attachToTarget", {
                targetId,
                flatten: true,
            });
            const call = (method, params) => send(method, params, sessionId);
            const evaluate = async (expression) => {
                const { result, exceptionDetails } = await call(
                    "Runtime.evaluate",
                    { expression, awaitPromise: true, returnByValue: true },
                );
                if (exceptionDetails)
                    throw new Error(
                        exceptionDetails.exception?.description ??
                            exceptionDetails.text,
                    );
                return result.value;
            };
            return {
                evaluate,
                /** Wait until `expression` is truthy in the page, then return it. */
                async waitFor(expression, timeout = 30_000) {
                    const until = Date.now() + timeout;
                    while (Date.now() < until) {
                        // A call sent while the tab navigates may never be
                        // answered, so each try gives up after a second.
                        const value = await Promise.race([
                            evaluate(expression).catch(() => null),
                            new Promise((done) =>
                                setTimeout(() => done(null), 1000),
                            ),
                        ]);
                        if (value) return value;
                        await new Promise((done) => setTimeout(done, 100));
                    }
                    throw new Error(`The page never got to ${expression}`);
                },
                /** Click at `at` with `modifiers` held (DevTools bits). */
                async click(at, modifiers = 0) {
                    for (const [type, buttons] of [
                        ["mouseMoved", 0],
                        ["mousePressed", 1],
                        ["mouseReleased", 0],
                    ])
                        await call("Input.dispatchMouseEvent", {
                            type,
                            ...at,
                            button: "left",
                            buttons,
                            clickCount: 1,
                            modifiers,
                        });
                },
                /** Press at `from`, move in `steps` to `to` and release. */
                async drag(from, to, steps = 10) {
                    const mouse = (type, { x, y }, buttons) =>
                        call("Input.dispatchMouseEvent", {
                            type,
                            x,
                            y,
                            button: "left",
                            buttons,
                            clickCount: 1,
                        });
                    await mouse("mouseMoved", from, 0);
                    await mouse("mousePressed", from, 1);
                    for (let step = 1; step <= steps; step++) {
                        await mouse(
                            "mouseMoved",
                            {
                                x: from.x + ((to.x - from.x) * step) / steps,
                                y: from.y + ((to.y - from.y) * step) / steps,
                            },
                            1,
                        );
                    }
                    await mouse("mouseReleased", to, 0);
                },
                /** Double-click at `at`. */
                async doubleClick(at) {
                    const mouse = (type, clickCount, buttons) =>
                        call("Input.dispatchMouseEvent", {
                            type,
                            ...at,
                            button: "left",
                            buttons,
                            clickCount,
                        });
                    await mouse("mouseMoved", 0, 0);
                    for (const clickCount of [1, 2]) {
                        await mouse("mousePressed", clickCount, 1);
                        await mouse("mouseReleased", clickCount, 0);
                    }
                },
                /** Press a key by its physical `code`, with `modifiers` (DevTools bits). */
                async press(key, code, modifiers = 0) {
                    for (const type of ["rawKeyDown", "keyUp"])
                        await call("Input.dispatchKeyEvent", {
                            type,
                            key,
                            code,
                            modifiers,
                        });
                },
            };
        },
        async close() {
            const exited = new Promise((done) => child.once("exit", done));
            child.kill();
            await exited;
            rmSync(profile, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100,
            });
        },
    };
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
