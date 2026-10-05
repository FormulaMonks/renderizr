---
paths:
  - "**/*.md"
---

# Writing Markdown documentation

How to write every Markdown file in this repo (ADRs, pages in `architecture/docs/` and `docs/`, the README, the glossary and these rules) and every issue, pull request and comment written for it. ADRs follow `adr-guidelines.md` on top of this. Issue and pull request bodies live outside the repo, so they may reference tickets freely; every other rule applies to them too.

## Style

- **Write in the imperative, plainly.** State decisions as instructions: "Use Dagre for automatic layout", "Derive every boundary from its children". Prefer short sentences and common words. Lead with the point; put the reasoning after it.
- **Prefer active voice.** Name who does what: "The engine places each element", "Dagre lays out automatic views". Use simple tenses ("the build fails", "we chose Dagre") over progressive and perfect ones ("the build is failing", "we have chosen"). Avoid passive constructions such as "elements are placed by the engine" or "it was decided".
- **Leave out ticket references.** No `#123`, no issue or pull request links, no "decided on the map". A document should stand on its own long after the tracker has moved on. Say what you found or measured instead of pointing at where. Links to other documents in the repo (another ADR, the glossary, a spec section) are fine.
- **Say what something is, and stop.** Avoid contrast built on a negation: "semantics, not pixels", "it's X, not Y", "Direct means as straight as possible, not straight regardless". Write the positive statement on its own ("Honor workspace semantics"). When a rejected alternative matters, give it its own sentence under the alternatives considered.
- **Name things by what they are.** Call a system, component or approach by its name ("the React Flow engine", "Dagre"), and avoid labels that only say when it arrived: "new", "old", "next", "current", "upcoming", "legacy". Those go stale the moment the change lands, and the document then misleads. The same goes for flags and identifiers: `--single-file` stays accurate, `--layout next` stops being true the moment another layout lands.
- **Spell American English.** "color", "behavior", "license", "center", "gray", "canceled", "organize", "recognize", "artifact". A quoted upstream name, option or license text keeps its own spelling (`colour` in a Structurizr theme file stays as the file spells it).
- **Use no em dashes.** Use a colon, a comma, parentheses or a new sentence instead. En dashes are fine for ranges (`1–10`).
- **Never hard-wrap.** One paragraph per line, one list item per line.
- **Use the glossary's terms** (`GLOSSARY.md`), and none of the words it lists under _Avoid_.

