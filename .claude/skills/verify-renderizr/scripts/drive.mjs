#!/usr/bin/env node
/**
 * Drive a Renderizr page in headless Chrome through a list of steps, and
 * save what it saw as evidence.
 *
 *   node drive.mjs <run-dir> <steps.json | -> [--name <prefix>]
 *       [--size 1440x900] [--scheme light|dark]
 *
 * Run it from the repository root: it finds Chrome the way the repo's tests
 * do (test/support/browser.js, or CHROME_PATH). It talks to Chrome over the
 * DevTools protocol on a pipe, so it needs no dependency.
 *
 * Steps are a JSON array, run in order; the first failing step stops the run
 * and exits 1. `{{build}}`, `{{serve}}`, `{{dev}}` and `{{edit}}` in any string
 * expand to the URL launch.sh recorded in the run dir (`{{build}}` becomes a
 * file:// URL). The braces stay clear of JavaScript's `${}`.
 *
 *   { "open": "{{edit}}#/?page=diagrams&view=Container-001&mode=edit" }
 *   { "hash": "#/?page=docs&section=02-usage" }        set location.hash
 *   { "ready": true }            wait for the drawn view: [data-ready="true"]
 *                                and a canvas that holds still
 *   { "waitFor": "<js>" }        wait until the expression is truthy (30 s)
 *   { "click": "<css>" }         click the element's center; "shift": true
 *                                adds Shift (adds to an edit-mode selection)
 *   { "clickLabel": "Save and close" }  click [aria-label="..."]
 *   { "drag": "<css>", "dx": 40, "dy": 0 }  press, move in steps, release
 *   { "key": "s", "code": "KeyS", "mods": ["Meta"] }  mods: Alt Ctrl Meta Shift
 *   { "eval": "<js>", "as": "name" }  save the value in results.json
 *   { "assert": "<js>", "message": "..." }  fail unless truthy
 *   { "shot": "name.png" }       screenshot of the viewport
 *   { "sleep": 500 }             only to let an animation end
 *
 * Evidence lands in <run-dir>/evidence/: each shot, <prefix>results.json
 * (every eval, every assert and the steps run) and <prefix>console.json
 * (console errors and uncaught exceptions the page raised).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args.splice(at, 2)[1] : fallback;
};
const prefix = option("name", "");
const [width, height] = option("size", "1440x900").split("x").map(Number);
const scheme = option("scheme", "light");
const [runArg, stepsArg] = args;
if (!runArg || !stepsArg) {
    console.error(
        "usage: node drive.mjs <run-dir> <steps.json | -> [--name p] [--size WxH] [--scheme light|dark]",
    );
    process.exit(2);
}
const run = resolve(runArg);
const evidence = join(run, "evidence");
const steps = JSON.parse(readFileSync(stepsArg === "-" ? 0 : stepsArg, "utf8"));

const urls = {};
for (const name of ["build", "serve", "dev", "edit"]) {
    try {
        const url = readFileSync(join(run, `${name}.url`), "utf8").trim();
        urls[name] = name === "build" ? pathToFileURL(url).href : url;
    } catch {}
}
const expand = (value) =>
    typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (all, name) => {
              if (!(name in urls))
                  throw new Error(
                      `${all}: launch.sh recorded no ${name} URL in ${run}`,
                  );
              return urls[name];
          })
        : value;

const { findChrome } = await import(
    pathToFileURL(resolve("test/support/browser.js")).href
);
const chrome = findChrome();
if (!chrome) {
    console.error("drive: no Chrome; set CHROME_PATH");
    process.exit(1);
}
const profile = mkdtempSync(join(tmpdir(), "verify-renderizr-chrome-"));
const child = spawn(
    chrome,
    [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--hide-scrollbars",
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
const listeners = [];
fromChrome.setEncoding("utf8");
fromChrome.on("data", (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
        const message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (message.method) for (const listen of listeners) listen(message);
        const waiting = pending.get(message.id);
        if (!waiting) continue;
        pending.delete(message.id);
        if (message.error) waiting.reject(new Error(message.error.message));
        else waiting.resolve(message.result);
    }
});
const send = (method, params, sessionId) =>
    new Promise((done, fail) => {
        const id = ++next;
        pending.set(id, { resolve: done, reject: fail });
        toChrome.write(
            `${JSON.stringify({ id, method, params: params ?? {}, sessionId })}\0`,
        );
    });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
});
const call = (method, params) => send(method, params, sessionId);
const console_ = [];
listeners.push(({ method, params, sessionId: from }) => {
    if (from !== sessionId) return;
    if (method === "Runtime.exceptionThrown")
        console_.push({
            kind: "exception",
            text:
                params.exceptionDetails.exception?.description ??
                params.exceptionDetails.text,
        });
    if (
        method === "Runtime.consoleAPICalled" &&
        (params.type === "error" || params.type === "warning")
    )
        console_.push({
            kind: params.type,
            text: params.args
                .map((arg) => arg.value ?? arg.description)
                .join(" "),
        });
});
await call("Runtime.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
});
await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: scheme }],
});

const evaluate = async (expression) => {
    const { result, exceptionDetails } = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (exceptionDetails)
        throw new Error(
            exceptionDetails.exception?.description ?? exceptionDetails.text,
        );
    return result.value;
};
const waitFor = async (expression, timeout = 30_000) => {
    const until = Date.now() + timeout;
    let last;
    while (Date.now() < until) {
        last = await Promise.race([
            evaluate(`!!(${expression})`).catch((error) => error.message),
            sleep(1000).then(() => "no answer"),
        ]);
        if (last === true) return;
        await sleep(150);
    }
    throw new Error(`never true: ${expression} (last: ${last})`);
};
const centerOf = async (selector) => {
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    return evaluate(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
};
const MODS = { Alt: 1, Ctrl: 2, Meta: 4, Shift: 8 };
const mouse = (type, { x, y }, buttons, modifiers = 0) =>
    call("Input.dispatchMouseEvent", {
        type,
        x,
        y,
        button: "left",
        buttons,
        clickCount: 1,
        modifiers,
    });
const click = async (at, modifiers) => {
    await mouse("mouseMoved", at, 0, modifiers);
    await mouse("mousePressed", at, 1, modifiers);
    await mouse("mouseReleased", at, 0, modifiers);
};

const results = { steps: [], values: {}, asserts: [] };
let failed = null;
try {
    for (const raw of steps) {
        const step = Object.fromEntries(
            Object.entries(raw).map(([k, v]) => [k, expand(v)]),
        );
        results.steps.push(raw);
        if (step.open) {
            await call("Page.navigate", { url: step.open });
            await call("Page.bringToFront");
            await waitFor(`document.readyState === "complete"`);
        } else if (step.hash)
            await evaluate(`location.hash = ${JSON.stringify(step.hash)}`);
        else if (step.ready) {
            await waitFor(
                `document.querySelector('[data-ready="true"] .react-flow__viewport')`,
            );
            await waitFor(
                `new Promise((done) => { const read = () => { const c = document.querySelector('[data-ready="true"]'); const v = c?.querySelector(".react-flow__viewport"); if (!v) return null; const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, v.style.transform].join(); }; const first = read(); setTimeout(() => done(first !== null && first === read()), 250); })`,
            );
        } else if (step.waitFor) await waitFor(step.waitFor, step.timeout);
        else if (step.click)
            await click(
                await centerOf(step.click),
                step.shift ? MODS.Shift : 0,
            );
        else if (step.clickLabel)
            await click(
                await centerOf(
                    `[aria-label=${JSON.stringify(step.clickLabel)}]`,
                ),
            );
        else if (step.drag) {
            const from = await centerOf(step.drag);
            const to = {
                x: from.x + (step.dx ?? 0),
                y: from.y + (step.dy ?? 0),
            };
            await mouse("mouseMoved", from, 0);
            await mouse("mousePressed", from, 1);
            for (let i = 1; i <= 10; i++)
                await mouse(
                    "mouseMoved",
                    {
                        x: from.x + ((to.x - from.x) * i) / 10,
                        y: from.y + ((to.y - from.y) * i) / 10,
                    },
                    1,
                );
            await mouse("mouseReleased", to, 0);
        } else if (step.key) {
            const modifiers = (step.mods ?? []).reduce(
                (sum, mod) => sum | MODS[mod],
                0,
            );
            for (const type of ["rawKeyDown", "keyUp"])
                await call("Input.dispatchKeyEvent", {
                    type,
                    key: step.key,
                    code: step.code ?? step.key,
                    modifiers,
                });
        } else if (step.eval)
            results.values[step.as ?? `eval${results.steps.length}`] =
                await evaluate(step.eval);
        else if (step.assert) {
            const ok = await evaluate(`!!(${step.assert})`);
            results.asserts.push({
                assert: step.assert,
                message: step.message,
                ok,
            });
            if (!ok)
                throw new Error(
                    `assert failed: ${step.message ?? step.assert}`,
                );
        } else if (step.shot) {
            await sleep(300);
            const { data } = await call("Page.captureScreenshot", {
                format: "png",
            });
            writeFileSync(
                join(evidence, `${prefix}${step.shot}`),
                Buffer.from(data, "base64"),
            );
            console.log(`shot   evidence/${prefix}${step.shot}`);
        } else if (step.sleep) await sleep(step.sleep);
        else throw new Error(`unknown step ${JSON.stringify(raw)}`);
    }
} catch (error) {
    failed = error.message;
    results.failed = { step: results.steps.at(-1), error: failed };
    try {
        const { data } = await call("Page.captureScreenshot", {
            format: "png",
        });
        writeFileSync(
            join(evidence, `${prefix}failure.png`),
            Buffer.from(data, "base64"),
        );
    } catch {}
} finally {
    results.url = await evaluate("location.href").catch(() => null);
    writeFileSync(
        join(evidence, `${prefix}results.json`),
        `${JSON.stringify(results, null, 2)}\n`,
    );
    writeFileSync(
        join(evidence, `${prefix}console.json`),
        `${JSON.stringify(console_, null, 2)}\n`,
    );
    const exited = new Promise((done) => child.once("exit", done));
    child.kill();
    await exited;
    rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
    });
}
console.log(`values ${JSON.stringify(results.values)}`);
console.log(
    `asserts ${results.asserts.filter((a) => a.ok).length}/${results.asserts.length} passed; console errors ${console_.filter((c) => c.kind !== "warning").length}`,
);
if (failed) {
    console.error(`drive: ${failed} (see evidence/${prefix}failure.png)`);
    process.exit(1);
}
