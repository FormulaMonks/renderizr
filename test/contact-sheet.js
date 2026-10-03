#! /usr/bin/env node

/**
 * The contact sheet (spec 15.2, ADR 11): every view of the acceptance set
 * screenshotted with Chrome's `--screenshot`, once under the vendored
 * Structurizr renderer and once under the React Flow engine, side by side in
 * one self-contained HTML page. A person works through it and accepts each
 * view or files an issue against it; nothing here compares pixels.
 *
 *   node test/contact-sheet.js [out-dir]        (default: ./contact-sheet)
 *
 * CI uploads `<out-dir>/index.html` as a workflow artifact. It is a review
 * aid and never a required check, so it fails only when it cannot produce a
 * sheet at all.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
    ACCEPTANCE_SET,
    buildForAcceptance,
    mapLimit,
    missingReason,
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "./support/acceptance.js";
import { findChrome, screenshot } from "./support/browser.js";

/** The two engines a build can carry, in the order the sheet shows them. */
const ENGINES = [
    { engine: "structurizr", label: "Structurizr renderer" },
    { engine: "react-flow", label: "React Flow engine" },
];

/** How many Chromes run at once. */
const BROWSERS = 4;

const escapeHtml = (text) =>
    String(text).replace(
        /[&<>"']/g,
        (character) => `&#${character.charCodeAt(0)};`,
    );

/** Screenshot every view of `entry` under both engines. */
async function shootWorkspace(entry, scratch) {
    const workspace = prepareWorkspace(entry);
    const keys = viewKeys(workspace);
    const sites = await Promise.all(
        ENGINES.map(({ engine }) =>
            buildForAcceptance(workspace, join(scratch, entry.name, engine), {
                engine,
            }),
        ),
    );
    const shots = keys.flatMap((key) =>
        ENGINES.map((_, at) => ({ key, at, site: sites[at] })),
    );
    const images = await mapLimit(shots, BROWSERS, async (shot, index) => {
        const path = join(scratch, `${index}-${entry.name}.png`);
        await screenshot(chrome, viewUrl(shot.site, shot.key), path);
        return (await readFile(path)).toString("base64");
    });
    return keys.map((key, row) => ({
        key,
        images: ENGINES.map((_, at) => images[row * ENGINES.length + at]),
    }));
}

const figure = (label, image) => `
        <figure>
          <img src="data:image/png;base64,${image}" alt="${escapeHtml(label)}" loading="lazy">
          <figcaption>${escapeHtml(label)}</figcaption>
        </figure>`;

const section = ({ entry, views, skipped }) => `
  <section>
    <h2>${escapeHtml(entry.name)}</h2>${
        skipped
            ? `
    <p class="skipped">Skipped: ${escapeHtml(skipped)}</p>`
            : views
                  .map(
                      ({ key, images }) => `
    <article>
      <h3>${escapeHtml(key)}</h3>
      <div class="pair">${ENGINES.map(({ label }, at) => figure(label, images[at])).join("")}
      </div>
    </article>`,
                  )
                  .join("")
    }
  </section>`;

const page = (sections, built) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Renderizr contact sheet</title>
<style>
  body { font-family: Helvetica, Arial, sans-serif; margin: 2rem; color: #222; background: #fff; }
  h2 { border-bottom: 1px solid #ccc; padding-bottom: 0.25rem; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  figure { margin: 0; }
  img { width: 100%; border: 1px solid #ccc; }
  figcaption { font-size: 0.85rem; color: #555; }
  .skipped { color: #a00; }
</style>
</head>
<body>
<h1>Contact sheet</h1>
<p>Every acceptance view under the Structurizr renderer and the React Flow engine, built ${escapeHtml(built)}. Accept each view, or open an issue against it.</p>
${sections.map(section).join("\n")}
</body>
</html>
`;

const chrome = findChrome();
if (!chrome) {
    process.stderr.write(
        "No Chrome or Chromium on this machine; set CHROME_PATH to make a contact sheet.\n",
    );
    process.exit(1);
}

const out = resolve(process.cwd(), process.argv[2] ?? "contact-sheet");
const scratch = await mkdtemp(join(tmpdir(), "renderizr-contact-sheet-"));
try {
    const sections = [];
    for (const entry of ACCEPTANCE_SET) {
        const skipped = missingReason(entry);
        if (skipped) {
            process.stderr.write(`warning: ${skipped}\n`);
            sections.push({ entry, skipped });
            continue;
        }
        process.stdout.write(`Screenshotting ${entry.name}...\n`);
        sections.push({ entry, views: await shootWorkspace(entry, scratch) });
    }

    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    await writeFile(
        join(out, "index.html"),
        page(sections, new Date().toISOString()),
    );
    process.stdout.write(
        `Contact sheet written to ${join(out, "index.html")}\n`,
    );
} finally {
    await rm(scratch, { recursive: true, force: true });
}
