# 26. Support Node from 22.13

Date: 2026-10-21

## Status

Accepted

## Context

Renderizr promised to run on Node 20 or newer. Node 20 reached end of life on April 30, 2026, and gets no more security fixes, so the promise pointed users at a Node they should not run.

The promise also held back the dependencies. Vite 8 accepts only `^20.19.0 || >=22.12.0`, and each runtime dependency that drops Node 20 becomes an update we cannot take.

Developing Renderizr needs a little more than Vite does. pnpm 11 imports `node:sqlite`, which Node ships from 22.13, so every pnpm-based job and every contributor needs Node 22.13 or newer.

## Decision

Support Node 22.13 or newer, for everyone who runs Renderizr and everyone who develops it:

- `engines.node` in `package.json` says `>=22.13`. The bin checks the running Node against it, major and minor, before it loads the build, and stops with one line that names the floor and the Node that ran.
- The `consumer` CI job proves the floor on Node 22.13 exactly, through npm and production dependencies only, the install `npx` performs. CI runs the test suite and the end-to-end render on Node 22, 24 and 26.
- The development toolchain is Node 26. `.mise.toml`, `mise.lock` and `.nvmrc` pin it, and every CI job that reads `.nvmrc` runs on it.

Raise the floor when the lowest supported Node major reaches end of life, or when a runtime dependency or the package manager we need drops it. Raise it only in a major release, with a migration guide that says what changed, who it affects and what to do. Keep Renovate's rule that leaves `engines` alone, so each raise goes through an ADR like this one.

## Consequences

- Renderizr 3.0.0 stops at once on Node 21, on Node 20 and on Node 22 before 22.13, with a message a user can act on.
- Users and contributors read one number everywhere, and a contributor's Node is always one that users may run.
- Code in `scripts/` and the test support may use anything Node 22.13 ships, and the test suite runs every test on every Node in the matrix.
- Updates of runtime dependencies that need Node 22.12 or 22.13 become mergeable.
- Users on Node 22.12 must upgrade, although nothing they run needs `node:sqlite`.
- Contributors and the jobs that read `.nvmrc` meet the newest Node first, while the 22 and 24 legs and the `consumer` job keep users' Nodes covered.
- Anyone on an older Node must upgrade it before they take 3.0.0.

## Alternatives considered

- Keeping Node 20: it keeps a Node without security fixes in the promise, and blocks Vite 8.
- A floor of Node 22.0: Vite 8 refuses every Node 22 before 22.12, so the floor would promise a range the build cannot meet.
- A user floor of Node 22.12 beside a contributor floor of Node 22.13: it reaches one more Node 22 release, and costs two numbers that every document, the CI comments and the next raise have to keep apart.
- Checking the major version alone: it lets Node 22.11 through to a crash inside the build.

## Reference links

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
