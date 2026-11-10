<!--
Title this PR the way you would write the squash commit: a Conventional Commit subject, e.g. "fix: keep hash routes alive under file://" or "feat(cli): add --router".

CONTRIBUTING.md is the long version of everything below: https://github.com/FormulaMonks/renderizr/blob/main/CONTRIBUTING.md -->

## 📝 What this changes

<!-- What the change does, in plain words and less than a paragraph. Put the issue it closes on its own line below: "Closes #123". Cite outside links with a footnote ("ELK's router[^elk]") and put the definitions at the end of the body. -->

## 🔍 How to verify it

<!--
What a reviewer can see or try to know the change works, as an ordered list: how to run it, where to go, what to do and what they should notice. Say what should look the same as before, too. Not "tests pass": CI already says that. For example:

1. Render the workspace as a single file:

   ```bash
   pnpm render architecture/workspace.json --single-file
   ```

2. Open structurizr-output/index.html in a browser. It needs no server.

When there is more than one case to check, give each one its own <details> block with a <summary> and its own ordered list. Screenshots or a before/after pair help a lot for visual changes: drag them in here, or attach them with `gh pr create --attach`. -->

## 🔴🟡🟢 Merge danger

<!-- Keep one circle in the heading: 🔴 for a one-way door (a revert cannot walk it back), 🟡 for a two-way door that needs caution (people notice before a revert lands), 🟢 for a two-way door with no major implication. -->

**Door:** <!-- one-way, two-way with caution or two-way. Add why when it is not obvious. -->

**Blast radius:** <!-- One or two words on what this can reach (docs only, one view, every diagram, CLI users), then what could break once it merges. -->

## 🗒️ Additional notes

<details>
<summary>Behavior changes, follow-ups and decisions</summary>

<!-- Behavior changes a reader might notice, follow-up work left out on purpose, decisions taken along the way. When there is nothing to note, replace this block with "None." -->

</details>

## ✅ Checklist

<!-- CI checks the title, the lockfile, lint, types and tests, so they need no box here. These are the checks CI cannot make. If a box stays unchecked, say why below the list rather than deleting the line. -->

- [ ] Tests cover the change, or there is a note below explaining why they cannot.
- [ ] `architecture/docs/` and `--help` in `scripts/cli.js` match the new behavior. A renamed flag needs both.
- [ ] I rendered a real workspace and looked at it, in both default and `--single-file` modes if either could be affected.
