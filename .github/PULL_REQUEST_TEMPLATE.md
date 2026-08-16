<!--
Title this PR the way you would write the squash commit: a Conventional Commit subject, e.g. "fix: keep hash routes alive under file://" or "feat(cli): add --router".

CONTRIBUTING.md is the long version of everything below: https://github.com/FormulaMonks/renderizr/blob/main/CONTRIBUTING.md -->

## What this changes

<!-- One or two sentences. Link the issue it closes: "Closes #123". -->

## Why

<!-- The behaviour that was wrong, or the thing that was impossible before. -->

## How to see it

<!--
For anything touching the renderer, the build pipeline or the output, paste the command a reviewer should run and say what to look at. For example:

    pnpm build architecture/workspace.json --single-file
    # then open structurizr-output/index.html in a browser — it needs no server

Screenshots or a before/after pair help a lot for visual changes. -->

## Checklist

- [ ] The PR title is a valid Conventional Commit subject (`feat:`, `fix:`, `docs:`, `chore:`, …).
- [ ] `pnpm install --frozen-lockfile` succeeds — the lockfile matches `package.json`.
- [ ] `pnpm exec biome ci .` reports no errors. (The pre-commit hook runs it over staged files.)
- [ ] `pnpm exec tsc --noEmit` is clean.
- [ ] `pnpm test` passes.
- [ ] Tests cover the change, or there is a note below explaining why they cannot.
- [ ] `README.md` and `--help` in `scripts/cli.js` match the new behaviour — a renamed flag needs both.
- [ ] I rendered a real workspace and looked at it, in both default and `--single-file` modes if either could be affected.

<!--
Those four commands are the four CONTRIBUTING.md asks you to run before opening a PR, in that order. If a box stays unchecked, say so here rather than deleting the line. -->
