---
name: verify-renderizr
description: Drive Renderizr the way a user does and capture proof. Covers the rendered site (diagrams, documentation, decisions) built by `pnpm render`, the dev server, and edit mode (`pnpm render edit`), driven in headless Chrome over the DevTools protocol. Reach for it to show that a change to the page, the docs pages, the decision log, edit mode or the architecture site works in the real app, with screenshots and asserted state as evidence.
---

# Verify Renderizr

Renderizr is a CLI that turns a Structurizr workspace JSON into a static site (or one self-contained HTML file), plus an edit mode that serves a local page for arranging view layouts and saves them into `workspace.json`. What a user touches is the **rendered page** in a browser: the diagrams page, the documentation pages and the decision log, and in edit mode the edit toolbar on the canvas. The CLI itself is the other surface; its proof is the files it writes.

Everything here runs from the **repository root** of the checkout under test. Read `features/README.md` before driving, then the feature file that matches the change.

## Helpers

All in `.claude/skills/verify-renderizr/scripts/`, all executable. `S` below is that folder, `RUN` a run directory of your own.

```bash
S=.claude/skills/verify-renderizr/scripts
RUN=.claude/verify-runs/$(date +%Y%m%d-%H%M%S)   # gitignored by /.claude/*
```

| Helper | Does |
| --- | --- |
| `$S/launch.sh $RUN build <workspace> [flags]` | `pnpm render <workspace> --out $RUN/site [flags]`; writes `build.url` (the `index.html` path) |
| `$S/launch.sh $RUN serve` | Serves `$RUN/site` over HTTP on a free port (python3 `http.server`, verification scaffolding); needed for a multi-file build, which loads a module script that `file://` refuses |
| `$S/launch.sh $RUN dev <workspace> [flags]` | `pnpm dev --port <free> --strictPort -- <workspace> [flags]` in the background; ready on Vite's `Local:` line; writes `dev.url` |
| `$S/launch.sh $RUN edit <path> [flags]` | Copies the workspace into `$RUN/edit/` (a JSON file, or a DSL's whole folder) and runs `pnpm render edit` on the copy on a free port; ready on the `Open http://127.0.0.1:<port>/?token=…` line; writes `edit.url` with the token |
| `$S/doctor.sh $RUN` | Read-only health check (see Doctor) |
| `node $S/drive.mjs $RUN <steps.json \| -> [--name p] [--size 1440x900] [--scheme light\|dark]` | Runs a JSON list of steps in headless Chrome; writes shots, `<p>results.json` and `<p>console.json` into `$RUN/evidence/` |
| `$S/cleanup.sh $RUN` | Stops every process group this run started; removes `site/` and `edit/`; keeps `evidence/` and the logs |

Ready-made step files live in `.claude/skills/verify-renderizr/steps/`. The step vocabulary is in the header of `drive.mjs`: `open`, `hash`, `ready`, `waitFor`, `click` (with `shift`), `clickLabel`, `drag`, `key` (with `mods`), `eval` (with `as`), `assert` (with `message`), `shot`, `sleep`. `{{build}}`, `{{serve}}`, `{{dev}}` and `{{edit}}` expand to the URLs `launch.sh` recorded.

## Launch

Pick the instance the change needs. Builds are short-lived; dev and edit run in the background until cleanup.

```bash
$S/launch.sh $RUN build architecture/workspace.json --single-file   # the architecture site, offline in one file
$S/launch.sh $RUN dev test/__fixtures__/edge-routing.json --font Inter
$S/launch.sh $RUN edit architecture/workspace.json                  # edit mode on a copy
```

- Point builds and the dev server at a **versioned workspace**: `architecture/workspace.json` (Renderizr's own, with documentation, decisions and images) or one under `test/__fixtures__/` (`big-bank-plc.json` has views only). When no fixture shows the change, add one in the same change (`.claude/rules/verification.md`).
- Edit mode **writes** the file it opens, so `launch.sh edit` always works on a copy in `$RUN/edit/`. Never run `pnpm render edit` on a tracked file during verification.
- `pnpm render` runs `tsc` first: a type error fails the launch with the log's tail.
- Each instance takes its own free port, so several runs can sit side by side. A run never drives an instance another run started.

## Doctor

Run it first, and again whenever a drive behaves oddly:

```bash
$S/doctor.sh $RUN
```

It prints the commit under test, warns when `test/__fixtures__` or `architecture/` differ from `HEAD` (something wrote a tracked workspace), checks that Chrome is found, and for every background instance checks that its pid is alive, that the port in its URL is held by that pid's process group, and that the URL answers. Exit 1 means do not drive: read `$RUN/<mode>.log`.

## Drive

```bash
node $S/drive.mjs $RUN .claude/skills/verify-renderizr/steps/documentation.json --name docs-
node $S/drive.mjs $RUN .claude/skills/verify-renderizr/steps/edit-align.json --name edit-align-
```

Or pass steps inline with `-`:

```bash
node $S/drive.mjs $RUN - --name views- <<'EOF'
[{ "open": "{{build}}#/?page=diagrams&view=Container-001" }, { "ready": true }, { "shot": "container.png" }]
EOF
```

Stable handles, from the source:

- Routes live in the hash: `#/?page=diagrams&view=<key>`, `#/?page=diagrams&view=<key>&mode=edit`, `#/?page=docs&section=<file-without-.md>&subsection=<heading-id>`, `#/?page=adrs&adr=<id>`.
- A drawn view: `[data-ready="true"]` on the canvas (the `ready` step waits for it and for the viewport to hold still). Elements: `.react-flow__node[data-id="<element id>"]`; edges: `.react-flow__edge[data-id="<relationship id>"]`; selection: `.react-flow__node.selected`.
- Header links: `a[data-page="diagrams|docs|adrs"]`. Menu entries: `a[data-item-id]` (`section:<id>` in the docs menu, the decision id in the decisions menu). View list: `li[data-viewkey="<key>"] button`.
- Documentation body: `#docs-content`; pager: `#docs-pager button[data-page-index]`. Decision title, date and status: `#decision-title h2`; body: `#decision-content`, where a link to another decision reads `href="#<id>"`; graph dots: `circle[data-mark="dot"][data-decision="<id>"][data-status="accepted|amended|superseded"]`.
- Edit toolbar buttons by `aria-label`: `Edit the layout`, `Align left|Align horizontal centers|Align right|Align top|Align vertical centers|Align bottom`, `Distribute horizontally|vertically`, `Undo`, `Redo`, `Calculate layout`, `Keyboard shortcuts`, `Discard changes and close`, `Save and close`. Save state: `.save-status[data-state="saved|unsaved|saving|failed"]`.

## Evidence

Everything lands in `$RUN/evidence/` and survives cleanup. A proof holds:

- **The user path.** Drive what a user does (clicks, keys, routes), never internal setters or test-only hooks. When the feature map lists several entry points, drive each or report the ones skipped.
- **The action and the result.** A shot before and after the action, and `eval`/`assert` steps that read the resulting state off the page; `results.json` keeps every value and assert.
- **Side effects.** Check what the action wrote, outside the page: after an edit-mode save, compare `$RUN/edit/workspace.json` with the original; after a build, list `$RUN/site`. Copy anything worth keeping into `$RUN/evidence/` before cleanup, which removes `site/` and `edit/`.
- **A clean console.** `console.json` lists console errors and uncaught exceptions; a proof with an unexplained error is not a proof.
- **Offline means offline.** A single file proves "no network" only when nothing else served it: open it with `{{build}}` (a `file://` URL), never through `serve` or the dev server.
- **Tracked files untouched.** `$S/doctor.sh $RUN` (or `git status`) at the end shows no change under `test/__fixtures__` or `architecture/` unless the change under test made it.

## Cleanup

```bash
$S/cleanup.sh $RUN
```

It stops each instance by the process group it recorded (never by process name), deletes `site/` and `edit/`, and lists what stays in `evidence/`. Run it after every attempt, failed ones too. Delete a run directory only when its evidence is no longer needed.
