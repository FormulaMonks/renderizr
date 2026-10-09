#! /usr/bin/env node

/**
 * The contact sheet (spec 15.2, ADR 11): every view of the acceptance set
 * screenshotted with Chrome's `--screenshot` in one self-contained HTML page.
 * A person reviewing a change to the engine works through it and files an
 * issue against any view that reads worse; nothing here compares pixels.
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
    BROWSERS,
    buildForAcceptance,
    mapLimit,
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "./support/acceptance.js";
import { findChrome, screenshot } from "./support/browser.js";

const escapeHtml = (text) =>
    String(text).replace(
        /[&<>"']/g,
        (character) => `&#${character.charCodeAt(0)};`,
    );

/** Screenshot every view of `entry` with `chrome`. */
async function shootWorkspace(chrome, entry, scratch) {
    const workspace = prepareWorkspace(entry);
    const keys = viewKeys(workspace);
    const site = await buildForAcceptance(workspace, join(scratch, entry.name));
    const images = await mapLimit(keys, BROWSERS, async (key, index) => {
        const path = join(scratch, `${index}-${entry.name}.png`);
        try {
            await screenshot(chrome, viewUrl(site, key), path, {
                offline: true,
            });
            return { image: (await readFile(path)).toString("base64") };
        } catch (error) {
            // One view the engine cannot draw in time is a finding for the
            // sheet, not a reason to lose every other screenshot.
            const failure = String(error.message).split("\n")[0];
            process.stderr.write(`warning: ${entry.name} ${key}: ${failure}\n`);
            return { failure };
        }
    });
    return keys.map((key, row) => ({ key, image: images[row] }));
}

const figure = (label, { image, failure }) => `
        <figure>${
            failure
                ? `
          <p class="failed">No screenshot: ${escapeHtml(failure)}</p>`
                : `
          <img src="data:image/png;base64,${image}" alt="${escapeHtml(label)}" loading="lazy">`
        }
        </figure>`;

const section = ({ entry, views }) => `
  <section>
    <h2>${escapeHtml(entry.name)}</h2>${views
        .map(
            ({ key, image }) => `
    <article>
      <h3>${escapeHtml(key)}</h3>${figure(key, image)}
    </article>`,
        )
        .join("")}
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
  figure { margin: 0; }
  img { width: 100%; border: 1px solid #ccc; }
  .failed { color: #a00; }
</style>
</head>
<body>
<h1>Contact sheet</h1>
<p>Every acceptance view, built ${escapeHtml(built)}. Open an issue against any view that reads worse than before.</p>
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
        process.stdout.write(`Screenshotting ${entry.name}...\n`);
        sections.push({
            entry,
            views: await shootWorkspace(chrome, entry, scratch),
        });
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
