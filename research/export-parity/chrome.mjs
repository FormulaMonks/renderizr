// The reference side: build each fixture with --font in a report build, open every
// view in headless Chrome and save the toolbar's own SVG and PNG through the
// report build's `renderizrExportView` hook, at every animation step and in dark.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "../../test/support/acceptance.js";
import { findChrome, openBrowser } from "../../test/support/browser.js";
import { runCli } from "../../scripts/__fixtures__/helpers.js";
import { FIXTURES, FONTS, DARK, OUT } from "./cases.mjs";
import { describe } from "./driver.mjs";

const chrome = findChrome();
if (!chrome) throw new Error("no Chrome");
const MANIFEST = join(OUT, "chrome", "manifest.json");
// Runs over some fixtures keep the others' entries.
const manifest = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8")).filter(
          (c) => !FIXTURES.includes(c.fixture),
      )
    : [];

const exportBoth = async (page, dir, name) => {
    const out = await page.evaluate(`(async () => {
        await document.fonts.ready;
        const read = async (format) => {
            const blob = await window.renderizrExportView(format);
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let s = ""; for (const b of bytes) s += String.fromCharCode(b);
            return btoa(s);
        };
        const family = getComputedStyle(document.documentElement).getPropertyValue("--diagram-font");
        return { svg: await read("svg"), png: await read("png") };
    })()`);
    writeFileSync(join(dir, `${name}.svg`), Buffer.from(out.svg, "base64"));
    writeFileSync(join(dir, `${name}.png`), Buffer.from(out.png, "base64"));
};

const browser = await openBrowser(chrome);
try {
    for (const fixture of FIXTURES) {
        const workspace = prepareWorkspace({
            source: new URL(
                `../../test/__fixtures__/${fixture}.json`,
                import.meta.url,
            ).pathname,
        });
        for (const font of FONTS) {
            const dir = join(OUT, "chrome", fixture, font);
            mkdirSync(dir, { recursive: true });
            const source = join(dir, "workspace.json");
            writeFileSync(source, JSON.stringify(workspace));
            const t0 = performance.now();
            const built = await runCli(
                [
                    source,
                    "--out",
                    join(dir, "site"),
                    "--single-file",
                    "--font",
                    font,
                ],
                {
                    env: { RENDERIZR_ENGINE_REPORT: "1" },
                },
            );
            if (built.code !== 0) throw new Error(built.stderr);
            console.log(
                `built ${fixture} --font ${font} in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
            );
            for (const key of viewKeys(workspace)) {
                const { steps, drawable } = describe(workspace, key, () => 10);
                if (!drawable) continue;
                for (const scheme of DARK.includes(fixture)
                    ? ["light", "dark"]
                    : ["light"]) {
                    const page = await browser.open(
                        viewUrl(join(dir, "site"), key),
                    );
                    // The OS's own scheme reaches headless Chrome: pin it either way.
                    await page.waitFor(
                        `location.protocol === "file:" && document.readyState === "complete"`,
                    );
                    await page.evaluate(
                        `localStorage.setItem("renderizr:theme", "${scheme}"); location.reload()`,
                    );
                    await new Promise((r) => setTimeout(r, 500));
                    await page.waitFor(
                        `document.documentElement.dataset.theme === "${scheme}" && document.querySelector('[data-ready="true"][data-view-key=${JSON.stringify(key)}]') && typeof window.renderizrExportView === "function"`,
                    );
                    await page.settle();
                    const metrics = await page.evaluate(`(() => {
                        const c = document.createElement("canvas").getContext("2d");
                        c.font = '100px "${font}", Helvetica, Arial, sans-serif';
                        const m = c.measureText("Hg");
                        return { ascent: m.fontBoundingBoxAscent / 100, descent: m.fontBoundingBoxDescent / 100, theme: document.documentElement.dataset.theme ?? null };
                    })()`);
                    const suffix = scheme === "dark" ? "-dark" : "";
                    await exportBoth(page, dir, `${key}${suffix}`);
                    manifest.push({
                        fixture,
                        font,
                        key,
                        scheme,
                        step: null,
                        name: `${key}${suffix}`,
                        metrics,
                    });
                    // Only the light scheme walks the steps.
                    for (
                        let step = 1;
                        scheme === "light" && step <= steps;
                        step++
                    ) {
                        await page.evaluate(
                            `document.querySelector('button.next-step').click()`,
                        );
                        await new Promise((r) => setTimeout(r, 150));
                        await exportBoth(page, dir, `${key}-step-${step}`);
                        manifest.push({
                            fixture,
                            font,
                            key,
                            scheme,
                            step,
                            name: `${key}-step-${step}`,
                            metrics,
                        });
                    }
                    await page.evaluate(`localStorage.clear()`);
                }
            }
        }
    }
} finally {
    await browser.close();
}
mkdirSync(join(OUT, "chrome"), { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`${manifest.length} toolbar exports`);
