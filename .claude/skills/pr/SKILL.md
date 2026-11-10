---
name: pr
description: "Use when writing a PR body, opening a pull request with `gh pr create`, or editing one with `gh pr edit`."
---

# Writing a pull request

Write every pull request for this repo from the configured pull request template, and follow the guidance below for each of its sections. Keep the emoji at the start of each heading: it gives the reader a visual cue to find each section. The _Merge danger_ heading carries a colored circle that says how risky the merge is. `.claude/rules/pull-requests.md` holds the rules, so a PR opened in the browser and one opened by an agent read alike. Write every word the way `.claude/rules/writing.md` says: active voice, simple tenses, American spelling, no em dashes and the terms in `GLOSSARY.md`.

## Steps

1. Read the diff against `main` (`git diff main...HEAD`) and the issue it closes (`gh issue view <number> --comments`).
2. Check the change by hand the way `.claude/rules/verification.md` says, and capture a screenshot of every visual change while you do (see [Screenshots](#screenshots)).
3. Write the title: a Conventional Commit subject, written the way the squash commit should read (`feat(model): add resolveView`).
4. Write the body from the template (see [Body](#body)) into a file in your scratchpad, never inline in `--body`, so backticks and `<details>` survive the shell.
5. Open the pull request with `gh pr create --body-file`, passing one `--attach` per screenshot.

## Body

Use the configured pull request template file. If none found, use these instructions.

GitHub looks for the template in `.github/`, at the repo root and in `docs/`, as `pull_request_template.md` in any case, or as one file of several in a `PULL_REQUEST_TEMPLATE/` folder. Read the first one you find and fill in its sections in its order: replace each HTML comment with the content it asks for and keep every heading as the template writes it, unless a comment asks you to change it (this repo's template asks you to keep one circle on _Merge danger_). When the folder holds several templates, pick the one whose name matches the change, or ask.

When the repo has no template, write this body:

```markdown
## 📝 What this changes

<one to three plain sentences on what the change does>

Closes #<issue>

## 🔍 How to verify it

1. <how to get it running, with the command in a fenced code block>
2. <where to go: which page, view, workspace or color scheme>
3. <what to do there>
4. <what the reviewer should notice, and what should look the same as before>

## <🔴, 🟡 or 🟢> Merge danger

**Door:** <one-way, two-way with caution or two-way>

<optional: why>

**Blast radius:** <one or two words>

<optional: what could break once it merges>

## 🗒️ Additional notes

<details>
<summary>Behavior changes, follow-ups and decisions</summary>

- <a behavior change a reader might notice>
- <follow-up work left out on purpose>
- <a decision taken along the way, or a conflict with an ADR>

</details>

[^1]: <a link the prose above points at>
```

### What this changes

Say what the change does, in plain words, in less than a paragraph: one to three short sentences a reviewer reads in a few seconds. Lead with what someone using Renderizr notices; leave out how the code does it, since the diff shows that. Skip preambles such as "This PR".

Put `Closes #<issue>` on its own line below the summary, so GitHub links and closes the issue. When the change has no issue, leave the line out.

Put no screenshots here. They belong in _🔍 How to verify it_, next to the step that shows them.

### How to verify it

Write the steps as an ordered list, in the order the reviewer follows them: get it running, go somewhere, do something, notice something. Put each command in its own fenced code block inside its step, indented under it so the list keeps counting. Write commands the way `.claude/rules/verification.md` says: the repo's own scripts, against a versioned fixture.

Say what should look the same as before, too. Leave out "run the tests" and "CI is green": CI already says that. When part of the change has nothing visible yet, say so plainly and say when it will show.

When the reviewer has more than one case to check (two engines, both color schemes, the dev server and a single-file build), give each case its own collapsed section[^collapsed] with its own ordered list. Open the first one with `open`, so the reviewer lands on a case without clicking:

````markdown
## 🔍 How to verify it

<details open>
<summary>Dev server</summary>

1. Start the dev server on the fixture:

   ```bash
   pnpm dev -- test/__fixtures__/edge-routing.json
   ```

2. Open the URL Vite prints and go to the _Containers_ view.
3. Notice that the edges route around the boundary.

</details>

<details>
<summary>Single-file build</summary>

1. Render the fixture with `--single-file`:

   ```bash
   pnpm render test/__fixtures__/edge-routing.json --single-file
   ```

2. Open `structurizr-output/index.html` straight from disk.
3. Notice the same routing as on the dev server.

</details>
````

Leave a blank line after every `<summary>` line and before every `</details>`, or GitHub renders the Markdown inside as plain text. Name each case in its `<summary>` by what differs, in a few words.

### Merge danger

Tell the reviewer how risky the merge is, in two short parts. Start the heading with the circle that matches the door, so a reviewer sees at a glance whether to slow down:

| Heading              | Door                 | When                                                                                                                                                                         |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## 🔴 Merge danger` | One-way              | A revert cannot walk the change back. Review it with care before it merges.                                                                                                  |
| `## 🟡 Merge danger` | Two-way with caution | A revert walks it back, but people notice in the meantime: a visible change to every diagram, a CLI flag that behaves differently, a dependency bump that changes the build. |
| `## 🟢 Merge danger` | Two-way              | A revert walks it back and nobody outside the repo notices: docs, tests, dev tooling, a fix confined to one view. The reviewer can skim this section.                        |

When a change falls between two colors, pick the riskier one.

- **Door.** Write the door the circle stands for. Write _one-way_ when a revert cannot walk the change back: a published package, a renamed flag or file format people already depend on, a migration, a deleted branch or data. Add one sentence on why when the answer is not obvious from the summary.
- **Blast radius.** Name in one or two words what the change can reach: _docs only_, _dev tooling_, _one view_, _every diagram_, _CLI users_. Then list what could break once it merges, such as layout shifts, a slower render, a broken `--single-file` build or a change for people who embed the output. Leave the list out when the radius is _docs only_ or _dev tooling_.

### Additional notes

Put every note inside one collapsed section, so a reviewer opens it only when they want the detail. List behavior changes a reader might notice, follow-up work left out on purpose, decisions taken along the way and anything that contradicts an ADR. Flag an ADR conflict the way `.claude/rules/domain.md` says.

When there is nothing to note, write "None." under the heading, with no collapsed section around it.

### Checklist

When the template has a checklist, keep it below the other sections as the template writes it. Check a box only when you ran the step, and say why under the list when a box stays unchecked. When the template has no checklist, or the repo has no template, leave the section out.

## Links

When the prose points at a page outside the diff (a GitHub doc, an upstream issue, a spec), cite it with a footnote[^footnotes] instead of an inline link, so the sentences stay readable:

```markdown
The engine routes edges with ELK's orthogonal router[^elk].

[^elk]: [ELK layered algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
```

- Name each footnote by its source (`[^elk]`, `[^adr-21]`) rather than a number, so adding one never renumbers the rest. GitHub numbers them in the order they appear.
- Put every footnote definition at the very end of the body, after the checklist. A definition inside a `<details>` block still works, but it hides from a reviewer who reads the source.
- Keep `Closes #<issue>`, issue and PR references (`#123`) and file paths in code spans as they are. GitHub links them already, and a footnote adds nothing.

## Screenshots

Attach screenshots with the GitHub CLI[^attach]: `gh pr create`, `gh pr edit` and `gh pr comment` take `--attach`, upload the file and rewrite its local path in the body to the uploaded URL. You need push access to the repository.

1. Capture each screenshot into your scratchpad while you check the change by hand. The `verify-renderizr` skill drives the rendered site in headless Chrome and saves screenshots. Name each file by what it shows: `before-containers-view.png`, `after-containers-view.png`.
2. Reference each file in the body at the step that shows it, with a relative path and alt text that says what the reviewer should notice:

   ```markdown
   4. Notice that the edges route around the boundary.

      ![Edges routed around the Payments boundary](./after-containers-view.png)
   ```

3. Run `gh pr create` from the folder that holds the body and the screenshots, so the relative paths in the body match the `--attach` paths:

   ```bash
   gh pr create \
     --title "fix(engine): route edges around boundaries" \
     --body-file pr-body.md \
     --attach ./before-containers-view.png \
     --attach ./after-containers-view.png
   ```

4. Read the URL `gh` prints and open the pull request to check that every image rendered where you put it. When some attachments fail, `gh` still creates the pull request with the ones that uploaded and exits non-zero, so fix the body with `gh pr edit <number> --body-file pr-body.md --attach <file>`.

Keep these rules in mind:

- Show a before and after pair for a visual change, inside the step where the reviewer notices it. Put each pair in a table when they compare side by side.
- Attach each file once. `gh` refuses the same file twice, and appends any attached file the body does not reference to the end of the body, which lands it below the checklist.
- Give alt text in the body (`![…](./file.png)`). The `#alt text` suffix on `--attach` applies only to files the body does not reference.
- Put a video on a line of its own. Inside a sentence it renders as a link instead of a player.
- Attach images and videos only. Paste logs and command output as fenced code blocks instead.

[^collapsed]: [Organizing information with collapsed sections](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/organizing-information-with-collapsed-sections)
[^footnotes]: [Footnotes](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#footnotes)
[^attach]: [Attaching files with GitHub CLI](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)
