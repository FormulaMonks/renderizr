# Pull requests

How to write the body of every pull request opened in this repo, by hand or by an agent. `.github/PULL_REQUEST_TEMPLATE.md` holds the same sections; fill them in rather than replacing them.

## Title

A Conventional Commit subject, written the way the squash commit should read: `feat(model): add resolveView`, `fix: keep hash routes alive under file://`.

## Body

Three sections, in this order, each under its own `##` heading:

1. **What this changes.** One short paragraph on what the change is about and why it was needed. Link what it closes: `Closes #123`.
2. **How to verify it.** Steps a reviewer can follow without reading the diff: the exact commands to run in their own fenced code blocks, which tests cover the change, and what to look at in a rendered workspace (which page, which view, which colour scheme) with the expected result. Say what should look the same as before, not only what changed.
3. **Additional notes.** Behaviour changes a reader might notice, follow-up work left out on purpose, decisions taken along the way and anything that contradicts an ADR. Write "None." rather than dropping the section.

Keep the checklist from the template below the three sections, and say why when a box stays unchecked.
