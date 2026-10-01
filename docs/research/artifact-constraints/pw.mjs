// Real-time runs: load each test page over HTTP (see serve.mjs), let it run
// for four seconds, then read back the report the page wrote into the DOM and
// every console message, page error and network request.
//
// Headless Chrome's --dump-dom path was tried first and is not usable here:
// its --virtual-time-budget advances timers without rendering frames, and
// ResizeObserver callbacks only run at a rendering opportunity, so the resize
// scenarios never fire under it.
//
// PLAYWRIGHT_MODULE: path to an installed `playwright` package's index.mjs.
// CHROME_PATH: a Chrome or Chromium executable (Playwright's own download
// works too; leave CHROME_PATH unset for that).
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
);

const names = process.argv.slice(2);
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH,
});

for (const name of names) {
    const page = await browser.newPage({
        viewport: { width: 1400, height: 1000 },
    });
    const messages = [];
    const requests = [];
    page.on("console", (m) =>
        messages.push(`${m.type()}: ${m.text().slice(0, 200)}`),
    );
    page.on("pageerror", (e) =>
        messages.push(`pageerror: ${String(e).slice(0, 200)}`),
    );
    page.on("requestfailed", (r) =>
        messages.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`),
    );
    page.on("request", (r) => requests.push(r.url()));

    await page.goto(`http://127.0.0.1:4173/${name}.html`);
    await page.waitForTimeout(4000);

    const report = await page.evaluate(() =>
        JSON.parse(document.getElementById("report").textContent),
    );
    const dom = await page.evaluate(() => {
        const flow = document.querySelector(".react-flow");
        const target = document.getElementById("structurizr-diagram-target");
        return {
            nodes: document.querySelectorAll(".react-flow__node").length,
            edgePaths: document.querySelectorAll(".react-flow__edge-path")
                .length,
            styleAttributes: document.querySelectorAll("[style]").length,
            viewportTransform:
                document.querySelector(".react-flow__viewport")?.style
                    .transform ?? null,
            flowSize: flow ? [flow.clientWidth, flow.clientHeight] : null,
            container: [target.clientWidth, target.clientHeight],
        };
    });

    console.log(`\n===== ${name} =====`);
    console.log("requests:", requests.length, requests.join(" "));
    console.log("dom:", JSON.stringify(dom));
    console.log("console:", JSON.stringify(messages, null, 1));
    console.log("report:", JSON.stringify(report, null, 1));
    await page.close();
}

await browser.close();
