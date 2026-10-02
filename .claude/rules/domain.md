# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`architecture/decisions/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md
├── architecture/
│   ├── workspace.dsl          ← `!adrs decisions` imports the folder below
│   └── decisions/
│       ├── 0001-record-architecture-decisions.md
│       └── 0002-single-file-output.md
└── src/
```

## ADR format

`architecture/decisions/` is imported into the Structurizr workspace by `!adrs decisions` in `architecture/workspace.dsl`, so ADRs render in renderizr's own architecture site. Structurizr's default importer expects **adr-tools format**; anything else fails to parse:

- File name: `NNNN-kebab-title.md` (zero-padded, sequential).
- First line: `# N. Title`.
- A `Date: YYYY-MM-DD` line.
- A `## Status` section whose first line is the status (e.g. `Accepted`, `Superseded by [3. ...](0003-....md)`).
- Then `## Context`, `## Decision`, `## Consequences`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (single-file output), but worth reopening because…_
