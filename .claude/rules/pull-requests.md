# Pull requests

How to write the body of every pull request opened in this repo, by hand or by an agent. `.github/PULL_REQUEST_TEMPLATE.md` holds the same sections; fill them in rather than replacing them. Write every section, the title and any review comment the way `writing.md` says: active voice, simple tenses, American spelling, no em dashes and the glossary's terms.

## Title

A Conventional Commit subject, written the way the squash commit should read: `feat(model): add resolveView`, `fix: keep hash routes alive under file://`.

## Body

Four sections, in this order, each under its own `##` heading that starts with its emoji: 📝, 🔍, a colored circle for _Merge danger_ and 🗒️. The `pr` skill (`.claude/skills/pr/SKILL.md`) shows each one with examples.

1. **What this changes.** A summary of what the change does, in plain words and less than a paragraph. Put `Closes #123` on its own line below it.
2. **How to verify it.** What a reviewer can see or try for themselves to know the change works, as an ordered list: how to get it running (one command in a fenced code block), where to go (which page, which view, which workspace, which color scheme), what to do there and what they should notice. Say what should look the same as before too. When the reviewer has more than one case to check, give each case its own collapsed section (`<details>` with a `<summary>`) holding its own ordered list. Leave out "run the tests" and "CI is green": CI already says that, and it tells a reviewer nothing about the change. If part of the change has nothing visible yet, say so plainly and say when it will show. Write the commands the way `verification.md` says: the repo's own scripts, run against a versioned fixture.
3. **Merge danger.** Whether the change is a one-way or a two-way door (can a revert walk it back cleanly?) and its blast radius: what the change can reach and what could break once it merges. Start the heading with 🔴 for a one-way door, 🟡 for a two-way door that needs caution and 🟢 for a two-way door with no major implication.
4. **Additional notes.** Inside one collapsed section: behavior changes a reader might notice, follow-up work left out on purpose, decisions taken along the way and anything that contradicts an ADR. Write "None." rather than dropping the section.

Keep the checklist from the template below the four sections, and say why when a box stays unchecked.

## Links and screenshots

- Cite a link the prose points at with a footnote (`[^name]`), and put every footnote definition at the end of the body. Issue references and `Closes #123` stay as they are.
- Attach screenshots with `gh pr create --attach` (or `gh pr edit --attach`), referencing each file in the body at the step that shows it. The `pr` skill gives the steps.
