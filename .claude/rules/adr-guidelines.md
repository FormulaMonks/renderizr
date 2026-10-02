---
paths:
  - "architecture/decisions/**/*.md"
---

# ADR Guidelines

ADRs are **immutable records**. Once an ADR has landed on `main`, never edit its content. **Three exceptions apply:** the `## Status` section, which is a live pointer rather than part of the record (see below); an ADR that has not yet landed on `main`; and a merged ADR that still reads `Draft`, which stays revisable until it is promoted to `Accepted`.

**Immutability begins when the PR merges to `main` — not when the ADR's `## Status` field is set to `Accepted`.** An ADR is not yet a record while its introducing PR is still open, whatever its status word says. So marking it `Accepted` inside an open PR does not freeze the content: it may still be revised in place — rewritten, cut, or reversed — for as long as that PR has not merged. Promoting a `Draft` to `Accepted` in the same change is the normal way an ADR lands, and neither that revision nor the status change needs a superseding or amending ADR. Once the PR merges, the rules below apply in full.

Two things a revisable ADR's revision still owes its readers, because nothing else records what moved:

- **Check what cited it.** A revisable ADR that other documents already reference can lose content they point at. Search for links to the ADR and correct anything that now names a claim the ADR no longer makes.
- **Say what changed in the commit message.** A revisable ADR's history is the only place its earlier shape survives, so the message carries the weight a superseding ADR otherwise would.

- ADR numbers must not conflict with open PRs — check all open PRs for ADRs before numbering a new one.
- Every ADR starts with `# <n>. <Title>` followed by a `Date: YYYY-MM-DD` line.

## Status format

**The status word is one of exactly three: `Draft`, `Accepted`, or `Amended`.** A new ADR opens at `Draft` while the decision is still being worked out, moves to `Accepted` once it is settled, and moves to `Amended` when a later ADR amends part of it — those are the only three words that ever stand on that line. A superseded ADR is the one case with no status word at all: the back-pointer replaces it (see [Superseding and amending](#superseding-and-amending)). There is no `Proposed`, `Rejected`, or `Deprecated`.

`Amended` still means the decision is in force. It reads differently from `Accepted` only to make the amendment visible where the status is rendered on its own, without the pointers beneath it.

**The `## Status` section holds two things only: the status word, and pointers to other ADRs.** Nothing else belongs there — no spike issue, no link to a doc under `architecture/docs/`, no external URL, no prose caveat. Those go at the **end of the document** under a `## Reference links` heading (a bullet per link); a caveat qualifying the decision belongs at the top of `## Context`.

The status word stands alone on the first line of the section. Any elaboration follows as a separate paragraph — never appended to the status line:

```markdown
## Status

Accepted

Amends [6. TypeScript compiler configuration for the monorepo](0006-typescript-compiler-configuration-for-the-monorepo.md): the X it deferred.
```

When linking to another ADR from a `## Status` section, the link text is the target ADR's `# <n>. <Title>` heading verbatim — not `[ADR-000X]`.

## Superseding and amending

If a decision is superseded or amended, create a **new ADR**. **Both ADRs always point at each other** — the forward pointer on the new ADR, the back-pointer on the old one. There are exactly **three** relationships; do not invent a fourth wording (no "refines", "delivers", "builds on", "extends", "revisits"):

| Relationship | Means | On the new ADR | On the older ADR |
| --- | --- | --- | --- |
| **Supersede** | Full replacement — the old decision stops being current | `Supersedes [<n>. <Title>](000X-title.md).` | `Superseded by [<n>. <Title>](000Y-title.md).` **replaces** the status word |
| **Amend** | **Partial extension without full supersession** — the old decision stays in force | `Amends [<n>. <Title>](000X-title.md).` | `Amended by [<n>. <Title>](000Y-title.md).`, and the status word becomes `Amended` |
| **Reference** | Neither — the new ADR depends on or is informed by the old one, and changes nothing about it | `References [<n>. <Title>](000X-title.md).` | `Referenced by [<n>. <Title>](000Y-title.md).` |

**Amend** is the relationship for every partial change, whatever its flavour: adding to the old decision, narrowing it, or settling a point it left open or deferred. Optionally name what changed after a colon, so the reader knows which part moved: `Amends [<n>. <Title>](000X-title.md): the X it deferred.`

**Supersede** only when the new ADR replaces the old decision wholesale — restate any part of the old decision that still holds, so nothing is lost when the old ADR stops reading as current.

- A **superseded** ADR no longer reads `Accepted`: the back-pointer replaces the status word, and that is the only edit of its kind an already-merged ADR may receive.
- An **amended** ADR moves from `Accepted` to `Amended`, and the back-pointer is an additional paragraph. **One line per amendment** — where several ADRs amend the same one, each gets its own paragraph, oldest first, never joined with "and":

  ```markdown
  ## Status

  Amended

  Amended by [15. Secrets management and environment validation](0015-secrets-management-and-env-validation.md).

  Amended by [17. Database migrations on deploy](0017-database-migrations-on-deploy.md).
  ```

- **Reference** carries no weight: it changes nothing about the older ADR, which keeps whatever status it had. Use it for the ADRs a decision rests on.
- **One pointer per line**, whatever the kind. Never join two with "and".
- Where an ADR carries pointers of different kinds, order them strongest first: supersede, then amend, then reference.
- Optionally name what the pointer is about after a colon, so the reader knows which part matters: `References [21. Session token transport](0021-session-token-transport.md): it decided where a session lives in the browser.`

## File format

`architecture/decisions/` is imported into the Structurizr workspace by `!adrs decisions` in `architecture/workspace.dsl`, so ADRs render in renderizr's own architecture site. Structurizr's default importer expects **adr-tools format**; anything else fails to parse:

- File name: `NNNN-kebab-title.md` (zero-padded, sequential).
- First line: `# N. Title`.
- A `Date: YYYY-MM-DD` line.
- A `## Status` section whose first line is the status (see [Status format](#status-format)).
- Then `## Context`, `## Decision`, `## Consequences`, optionally `## Alternatives considered`, and `## Reference links` last.

## Writing

ADRs follow `writing.md` like every Markdown file. On top of that:

- **Title**: an imperative phrase, `# N. Use Dagre for automatic layout`. The file name is its kebab-case form.
- **Context**: the situation and the forces in play, in a few sentences.
- **Decision**: what to do, in the imperative.
- **Consequences**: what follows, good and bad.
- **Alternatives considered**: when a rejected option is likely to be suggested again, one bullet per option with the reason it lost.
- **Links to other ADRs** in the body use the target's `# <n>. <Title>` heading as link text, the same as in `## Status`.
