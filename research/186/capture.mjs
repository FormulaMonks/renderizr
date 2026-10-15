import puppeteer from "puppeteer-core";
import fs from "node:fs";
const dir = new URL(".", import.meta.url).pathname;
const browser = await puppeteer.launch({
    executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
});
const out = {};
for (const name of process.argv.slice(2)) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("ERR", e.message));
    await page.setContent('<html><body><div id="c"></div></body></html>');
    if (process.env.LAYOUT)
        await page.evaluate((l) => {
            window.__layout = l;
        }, process.env.LAYOUT);
    await page.addScriptTag({ path: `${dir}mermaid-patched.js` });
    const src = fs.readFileSync(`${dir}fixtures/${name}.mmd`, "utf8");
    const res = await page.evaluate(async (src) => {
        window.mermaid.initialize({
            startOnLoad: false,
            ...(window.__layout ? { layout: window.__layout } : {}),
        });
        const { svg } = await window.mermaid.render("d", src);
        return { svg, calls: window.__dagreCalls, data: window.__data4Layout };
    }, src);
    fs.writeFileSync(
        `${dir}out-${process.env.LAYOUT || "default"}-${name}.svg`,
        res.svg,
    );
    out[name] = { data: res.data, calls: res.calls };
    await page.close();
}
fs.writeFileSync(
    `${dir}captured-${process.env.LAYOUT || "default"}.json`,
    JSON.stringify(out, null, 1),
);
await browser.close();
