# Renderizr verification map

This directory is the maintained source for verifying what a Renderizr user sees and does. Read this index before driving, then use the matching feature file as the recipe. The helpers and the step vocabulary are in `../SKILL.md`.

## Baseline preconditions

- Work from the repository root of the checkout under test, with `pnpm install` done.
- `S=.claude/skills/verify-renderizr/scripts` and a fresh `RUN=.claude/verify-runs/<timestamp>` for each run.
- Launch only what the recipe asks for, with `$S/launch.sh`, against `architecture/workspace.json` or a workspace under `test/__fixtures__/`.
- `$S/doctor.sh $RUN` exits 0 before the first drive.
- Never drive an instance another run started, and never run edit mode on a tracked file.

## Driving conventions

- Start each recipe from a fresh `open` step: routes live in the URL hash, so the page holds no state between drives.
- Prefer the handles listed in `../SKILL.md` (hash routes, `data-*` attributes, `aria-label`s) over coordinates or DOM order.
- Wait on state (`ready`, `waitFor`), never on a fixed `sleep`, except to let an animation end.
- Use the light scheme for shots unless the change is about theming; then shoot both with `--scheme`.
- Name each drive with `--name <feature>-` so its artifacts group together.

## Proof and skip reporting

- Capture the user action and the resulting state: a shot on each side of the action and an `assert` on the result.
- For anything that writes (edit mode, builds), check the written file outside the page as well.
- Keep `console.json` clean, or explain each entry.
- Report the feature file, the sub-feature IDs and the entry points covered with the evidence paths.
- Report an entry point you could not reach with the step that failed (`results.json` names it) and `failure.png`. Do not report it as verified through another entry point.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections in this order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)` (every entry point), `Driving it with drive.mjs` (starts with `Preconditions:`, then labeled bullets pairing each action with a step and its observable result), and `Gotchas`.

## Features

- [Render a workspace](./render-site.md) covers `pnpm render`: the multi-file site, the single file, and what lands on disk.
- [Diagrams](./diagrams.md) covers the view list, deep links to a view, and the drawn view with its controls.
- [Documentation](./documentation.md) covers the documentation pages: section order, table of contents, links between sections, and embedded images.
- [Decisions](./decisions.md) covers the decision log, a decision's page, its status and links, and the decision graph.
- [Edit mode](./edit-mode.md) covers `pnpm render edit`: selecting, arranging, saving into `workspace.json`, and leaving edit mode.
