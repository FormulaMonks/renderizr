# 20. Commit the Structurizr test workspaces in place of the submodule

Date: 2026-10-09

## Status

Accepted

Amends [12. Ship behind a flag, then cut over in one release](0012-ship-behind-a-flag-then-cut-over-in-one-release.md): the submodule it kept for the acceptance fixtures.

## Context

After the cutover, the `structurizr/structurizr` submodule held nothing Renderizr builds from. The acceptance harness read three workspaces from it (Big Bank plc, groups and Amazon Web Services), and two CI jobs checked it out for them. A byte-for-byte copy of Big Bank plc already sat in `test/__fixtures__/` for the model tests. The submodule cost a contributor an extra command, cost CI a checkout of the whole Structurizr repository, and needed `update = none` in `.gitmodules` to keep every cold `npx` from cloning it.

## Decision

Commit unmodified copies of the three workspaces under `test/__fixtures__/`, taken from `structurizr-export/src/test/resources/` in `structurizr/structurizr`, and remove the submodule. Keep the copies byte for byte: leave them out of formatting, and record their source and license in `THIRD-PARTY-NOTICES.md`.

## Consequences

- A plain clone runs the whole test suite, and the acceptance harness draws every workspace in its set or fails, with nothing to skip.
- CI and `npx` clone the repository alone.
- The copies stay at the Structurizr commit they came from. Updating them is a deliberate copy, with no gitlink to bump.
- `scripts/install.test.js` fails if a submodule comes back.

## Reference links

- [structurizr/structurizr test workspaces](https://github.com/structurizr/structurizr/tree/main/structurizr-export/src/test/resources)
