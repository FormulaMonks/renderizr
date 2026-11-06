# Render a workspace

`pnpm render <workspace>` (the `npx github:FormulaMonks/renderizr` CLI in a clone) writes a static site for a workspace: by default `index.html`, an `assets/` folder and a favicon with relative URLs, with `--single-file` one self-contained `index.html` that makes no network requests, and with `--artifact` a folder to publish as a Claude artifact, listed by its `manifest.json`.

## Sub-features

- `render-multi` writes the multi-file site, which works from any folder over HTTP.
- `render-single` writes one `index.html` with every asset inlined.
- `render-artifact` writes the `--artifact` folder: a shell `index.html`, the runtime, the workspace payloads and `manifest.json`, which works over HTTP.
- `render-offline` opens the single file over `file://` with no request leaving the page.
- `render-branding` applies `--logo`, `--font` and `--primary-color` to the header and the page.
- `render-errors` stops with a clear message for a workspace that is missing or invalid.

## How to get to it (user POV)

- Run `pnpm render <workspace> [flags]` in a clone (what `npx github:FormulaMonks/renderizr` runs for a user, after `tsc`).
- Open `structurizr-output/index.html` in a browser, or serve the folder for a multi-file build.

## Driving it with drive.mjs

Preconditions:

- `pnpm install` is done; `$S/doctor.sh $RUN` finds Chrome.

- **Single file.** Run `$S/launch.sh $RUN build architecture/workspace.json --single-file`. `$RUN/site` holds exactly `index.html` (`ls $RUN/site > $RUN/evidence/render-files.txt`).
- **Offline.** Drive `[{ "open": "{{build}}#/?page=diagrams&view=Container-001" }, { "ready": true }, { "assert": "performance.getEntriesByType('resource').every((r) => r.name.startsWith('data:') || r.name.startsWith('file:') || r.name.startsWith('blob:'))", "message": "no request leaves the page" }, { "shot": "single.png" }]` with `--name render-`. The view draws and the assert holds.
- **Multi-file.** Run `$S/launch.sh $RUN build architecture/workspace.json`, then `$S/launch.sh $RUN serve`, and drive the same steps with `{{serve}}` in place of `{{build}}` (leave out the offline assert). `$RUN/site/assets/` exists and the view draws.
- **Artifact.** Run `$S/launch.sh $RUN build architecture/workspace.json --artifact`, then `$S/launch.sh $RUN serve`, and drive the same steps with `{{serve}}` (leave out the offline assert). `$RUN/site` holds the files `manifest.json` lists, the view draws, and the documentation and decisions pages open.
- **Branding.** Build with `--primary-color "#e4572e" --logo public/favicon.png`. On the diagrams page, assert `getComputedStyle(document.querySelector('a[data-page="docs"]')).color === 'rgb(228, 87, 46)'` (an inactive header link) and `document.querySelector('#workspace-navigation img').src.startsWith('data:image/png')`, plus a shot of the header.
- **Errors.** Run `pnpm render does-not-exist.json; echo "exit=$?"` and keep the output in `$RUN/evidence/render-error.txt`: it names the missing workspace and exits non-zero.

## Gotchas

- `pnpm render` takes its flags with no `--`; `pnpm dev` needs one. A stray `--` before a flag in `pnpm render` arrives as a second workspace.
- A multi-file or `--artifact` build loads a module script, which browsers refuse over `file://`: serve it.
- The build empties `--out` first. `launch.sh build` always writes into `$RUN/site`, never into `structurizr-output`.
- Remote themes, icons, logos and fonts are fetched at build time; a build of a workspace that references them needs the network even though the output never does.
