# Pull requests

How to write the body of every pull request opened in this repo, by hand or by an agent. `.github/PULL_REQUEST_TEMPLATE.md` holds the same sections; fill them in rather than replacing them. Write every section, the title and any review comment the way `writing.md` says: active voice, simple tenses, American spelling, no em dashes and the glossary's terms.

## Title

A Conventional Commit subject, written the way the squash commit should read: `feat(model): add resolveView`, `fix: keep hash routes alive under file://`.

## Body

Three sections, in this order, each under its own `##` heading:

1. **What this changes.** One short paragraph on what the change is about and why it was needed. Link what it closes: `Closes #123`.
2. **How to verify it.** What a reviewer can see or try for themselves to know the change works: how to get it running (one command in a fenced code block), where to go (which page, which view, which workspace, which color scheme), what to do there and what they should notice. Say what should look the same as before too. Leave out "run the tests" and "CI is green": CI already says that, and it tells a reviewer nothing about the change. If part of the change has nothing visible yet, say so plainly and say when it will show. Write the commands the way `verification.md` says: the repo's own scripts, run against a versioned fixture.
3. **Additional notes.** Behavior changes a reader might notice, follow-up work left out on purpose, decisions taken along the way and anything that contradicts an ADR. Write "None." rather than dropping the section.

Keep the checklist from the template below the three sections, and say why when a box stays unchecked.
