# Changelog

All notable changes to Renderizr are recorded here. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is generated, not written by hand. [release-please](https://github.com/googleapis/release-please) reads the conventional-commit messages on `main`, keeps a release pull request open with the next version's entry in it, and — when that pull request is merged — bumps `package.json`, writes the entry below, creates the `vX.Y.Z` tag and publishes the GitHub Release. The version, the tag, the release and this file therefore all come from the same commit history and cannot drift apart. To change what a release says, change the commit message; see [CONTRIBUTING.md](CONTRIBUTING.md#commits).

Commit types map onto the headings as follows (`release-please-config.json` is the source of truth):

| Commit type | Heading |
| --- | --- |
| `feat:` | Added |
| `fix:` | Fixed |
| `perf:`, `refactor:` | Changed |
| `revert:` | Removed |
| `docs:` | Documentation |
| `build:`, `chore:`, `ci:`, `style:`, `test:` | not listed |

That table is exhaustive on both sides: the eleven types above are exactly the eleven `@commitlint/config-conventional` accepts, and CI rejects a pull request title using any other one (`.github/workflows/ci.yml` → the `pr title` job). Dependency bumps therefore do not get a heading of their own — Renovate is configured to title its pull requests `chore(deps): …` (`renovate.json` → `semanticCommitType`), so they land under `chore:` and stay out of the changelog on purpose. A dependency change worth telling users about is worth titling `fix:` or `feat:`.

A `feat!:` or a `BREAKING CHANGE:` footer additionally gets its own breaking-changes section at the top of the entry, whatever the commit type was.

While the version stays below `1.0.0`, a `feat:` bumps the minor, anything else bumps the patch, and a breaking change bumps the minor rather than the major — the pre-1.0 convention, configured as `bump-minor-pre-major`.

## [Unreleased]

Nothing has been released yet. The repository has never been tagged and `package.json` still carries `0.0.1`, a placeholder that predates any release process. The first release pull request will propose **0.1.0** — the initial public release — covering everything below.

Two settings in `release-please-config.json` make that a certainty rather than an inference, and both exist because there is no `v0.0.1` tag for release-please to measure against:

- **`bootstrap-sha`** pins where history starts for changelog purposes. Without it release-please walks all 79 commits made before the repository was opened up and emits a 63-entry changelog of internal development, directly above this hand-written section describing the same release in different words. With it, only what lands after that commit is described.
- **`release-as: "0.1.0"`** fixes the version, so the tag, `package.json` and the heading below cannot disagree with the sentence above.

That pull request inserts its own generated `## [0.1.0](…)` entry directly above this section. Reviewing it means three edits, all in the release pull request itself: drop this hand-written section, delete `release-as` from `release-please-config.json` (it does not clear itself — left in, every later release is proposed as 0.1.0 too), and check the generated entry says what this one says. Everything after that is generated and nothing here is written by hand again.

### Added

- **The CLI.** `npx github:FormulaMonks/renderizr <workspace.json|url>` renders a Structurizr workspace into `./structurizr-output`. Node 20 or newer is the only requirement — no JVM, no Docker, no Graphviz, no PlantUML.
- **Every view in the workspace**, listed down the side: system landscape, context, container, component, dynamic, deployment, image, filtered and custom views, each with its own key.
- **The real Structurizr renderer**, vendored from [structurizr/structurizr](https://github.com/structurizr/structurizr) rather than re-implemented. Diagrams pan and zoom, dynamic views play back step by step, and the description and technology labels toggle.
- **Workspace documentation** as pages, with a table of contents and heading anchors. Markdown gets GitHub-style alerts, permalinks and syntax highlighting; AsciiDoc sections are converted rather than dumped as literal markup.
- **The decision log**: status pills, supersessions and amendments, decisions grouped by year, and a header counting how many are recorded and how many still stand.
- **Light and dark**, following the reader's system setting until they choose otherwise, with separate preferences for the page and for the diagrams.
- **Hash-based routing**, so a link to a view, a document or a decision survives a reload, works over `file://` and works inside a sandboxed frame.
- **`--single-file`**, which inlines every stylesheet, script, font, icon and the workspace itself into one document that makes no network requests, and emits `artifact.html` alongside it for hosts that supply their own document scaffolding.
- **Branding and layout flags**: `--out`, `--base`, `--logo`, `--logo-alt`, `--logo-href`, `--font`, `--font-weights`, `--font-subsets`, `--font-italic`, `--help`. Fonts are fetched at build time and embedded as woff2 data URIs, so a branded build stays as offline as an unbranded one.
- **Release automation**: versions, tags, GitHub Releases and this changelog are derived from conventional commits, each Release carries the packed npm tarball and a rendered example — as a static site and as a single self-contained file — and publishing to npm is a separate, manually dispatched, environment-gated job.
- **Project documentation** for a public repository: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, MAINTAINERS, THIRD-PARTY-NOTICES, issue and pull request templates, and CODEOWNERS.

[Unreleased]: https://github.com/FormulaMonks/renderizr/commits/main
