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

Renderizr is at `1.0.0`, so ordinary semantic versioning applies: a `feat:` bumps the minor, anything else bumps the patch, and a breaking change bumps the major. The CLI's flags and the shape of its output are the public surface that promise covers.

## [2.1.1](https://github.com/FormulaMonks/renderizr/compare/v2.1.0...v2.1.1) (2026-10-08)


### Fixed

* pre-bundle the JSX runtime so edit mode works under npx ([#139](https://github.com/FormulaMonks/renderizr/issues/139)) ([614bc8e](https://github.com/FormulaMonks/renderizr/commit/614bc8e248c4552ac2c5d4e3fcba7286dc234c6a))

## [2.1.0](https://github.com/FormulaMonks/renderizr/compare/v2.0.0...v2.1.0) (2026-10-08)


### Added

* add edit mode ([#127](https://github.com/FormulaMonks/renderizr/issues/127)) ([76cfb99](https://github.com/FormulaMonks/renderizr/commit/76cfb99b0b221d519b1392658a6cae604ce45377))
* **engine:** draw each edge end of an edge with vertices under its nearest vertex, out of spreading ([#127](https://github.com/FormulaMonks/renderizr/issues/127)) ([76cfb99](https://github.com/FormulaMonks/renderizr/commit/76cfb99b0b221d519b1392658a6cae604ce45377))
* publish the architecture documentation to GitHub Pages on each release ([#136](https://github.com/FormulaMonks/renderizr/issues/136)) ([d4817ac](https://github.com/FormulaMonks/renderizr/commit/d4817ace1988335fdb08a3c26e00ab801240ef90)), closes [#135](https://github.com/FormulaMonks/renderizr/issues/135)
* **routing:** keep routes 64 units from the elements they go around ([#111](https://github.com/FormulaMonks/renderizr/issues/111)) ([b739a15](https://github.com/FormulaMonks/renderizr/commit/b739a1598bcfc45271289eadaa5b943ac47be723)), closes [#110](https://github.com/FormulaMonks/renderizr/issues/110)


### Fixed

* keep npx from installing dev tools and the submodule ([#116](https://github.com/FormulaMonks/renderizr/issues/116)) ([33b4f95](https://github.com/FormulaMonks/renderizr/commit/33b4f95dd831816bc24c5c05003e7e2accab9d93))


### Documentation

* add the edit-mode ADRs and glossary terms ([#115](https://github.com/FormulaMonks/renderizr/issues/115)) ([6b2d045](https://github.com/FormulaMonks/renderizr/commit/6b2d045d3b68f4bd9acf1a54d7adfee338e68c7b))

## [2.0.0](https://github.com/FormulaMonks/renderizr/compare/v1.1.1...v2.0.0) (2026-10-05)

Renderizr draws every diagram with its own React Flow engine, built to the [React Flow engine spec](https://github.com/FormulaMonks/renderizr/issues/39).


### ⚠ BREAKING CHANGES

* every diagram is drawn by the React Flow engine, so rendered output looks different, and --engine is no longer an option.

### Added

* cut over to the React Flow engine ([#103](https://github.com/FormulaMonks/renderizr/issues/103)) ([5c311d8](https://github.com/FormulaMonks/renderizr/commit/5c311d87aa8a310fdfcff9b6092fd5b94a939635)), closes [#52](https://github.com/FormulaMonks/renderizr/issues/52)
* **engine:** acceptance harness with engine report, geometry checks and contact sheet ([#58](https://github.com/FormulaMonks/renderizr/issues/58)) ([a980a14](https://github.com/FormulaMonks/renderizr/commit/a980a14b8b1f4aee5254e0a3377a299d562209e5)), closes [#42](https://github.com/FormulaMonks/renderizr/issues/42)
* **layout:** complete the acceptance set and rank large views with tight-tree ([#83](https://github.com/FormulaMonks/renderizr/issues/83)) ([4c51549](https://github.com/FormulaMonks/renderizr/commit/4c515497136f7a782b4fef892df0300f5a2e3d58))
* **react-flow:** activation targets, target menu, indicators and keyboard access ([#74](https://github.com/FormulaMonks/renderizr/issues/74)) ([fe5f3d9](https://github.com/FormulaMonks/renderizr/commit/fe5f3d9b7de084b7e0d7bb435b7108174630a2e3)), closes [#48](https://github.com/FormulaMonks/renderizr/issues/48)
* **react-flow:** derive boundaries from their children and re-derive on font load ([#65](https://github.com/FormulaMonks/renderizr/issues/65)) ([dadc715](https://github.com/FormulaMonks/renderizr/commit/dadc715a4b3f45313a6ea07461f21b7ca86eb31c))
* **react-flow:** draw edge labels and line styles ([#69](https://github.com/FormulaMonks/renderizr/issues/69)) ([ab873a6](https://github.com/FormulaMonks/renderizr/commit/ab873a6b12dd59729b079e1c659a8cb3dca9a266))
* **react-flow:** draw elements with the label template and all 19 shapes ([#59](https://github.com/FormulaMonks/renderizr/issues/59)) ([40377bc](https://github.com/FormulaMonks/renderizr/commit/40377bc04bc5bf7a24a7b3629485ec01ba6df99f))
* **react-flow:** draw filtered, image and custom views ([#71](https://github.com/FormulaMonks/renderizr/issues/71)) ([ecc7ade](https://github.com/FormulaMonks/renderizr/commit/ecc7aded58bd1af593f37c5affbfc45f033a8384))
* **react-flow:** lay out automatic views with Dagre and place unplaced elements ([#70](https://github.com/FormulaMonks/renderizr/issues/70)) ([df91336](https://github.com/FormulaMonks/renderizr/commit/df913360631acf0d0e03b8d1207d3b7beeadd887)), closes [#45](https://github.com/FormulaMonks/renderizr/issues/45)
* **react-flow:** play dynamic and static animation ([#73](https://github.com/FormulaMonks/renderizr/issues/73)) ([336ad0d](https://github.com/FormulaMonks/renderizr/commit/336ad0d7a0c098e33bc41f91e959f839d3b3317a))
* **react-flow:** route edges in every routing mode ([#62](https://github.com/FormulaMonks/renderizr/issues/62)) ([3655ae2](https://github.com/FormulaMonks/renderizr/commit/3655ae207cb2c39f14d987b8b1e0533de7b5fb48))
* typed workspace model, style resolution and resolveView ([#53](https://github.com/FormulaMonks/renderizr/issues/53)) ([056b910](https://github.com/FormulaMonks/renderizr/commit/056b910e14425f4cded2e1473d8d308cfa38758e))


### Fixed

* **geometry:** aim Direct and Curved edges from center to center ([#75](https://github.com/FormulaMonks/renderizr/issues/75)) ([5bd2066](https://github.com/FormulaMonks/renderizr/commit/5bd20668c6dc7a89fac4d2a51386d47a7a37621d)), closes [#72](https://github.com/FormulaMonks/renderizr/issues/72)
* **layout:** keep every group on its ranks while Dagre orders a view ([#85](https://github.com/FormulaMonks/renderizr/issues/85)) ([3d8a6be](https://github.com/FormulaMonks/renderizr/commit/3d8a6be065b79ce39e08704c887235db02cb23d9))
* **react-flow:** scope the label toggles to element text ([#78](https://github.com/FormulaMonks/renderizr/issues/78)) ([4c3ad46](https://github.com/FormulaMonks/renderizr/commit/4c3ad46ef5c897ae964928985dbe4b85acdb7472)), closes [#77](https://github.com/FormulaMonks/renderizr/issues/77)
* **react-flow:** size SVG image views from their viewBox ([#87](https://github.com/FormulaMonks/renderizr/issues/87)) ([93a2743](https://github.com/FormulaMonks/renderizr/commit/93a2743b86f27d999fd8958c57733a391d58fff4))
* **routing:** aim each edge end where its edge heads ([#88](https://github.com/FormulaMonks/renderizr/issues/88)) ([b13c8fe](https://github.com/FormulaMonks/renderizr/commit/b13c8fef4f4878651536e49a7ffd78b11b3aa2d0))
* **test:** hold every edge end to its shape's outline ([#79](https://github.com/FormulaMonks/renderizr/issues/79)) ([ba229ad](https://github.com/FormulaMonks/renderizr/commit/ba229addd537ddff70ca92176ce9a47f3e98bbe9))
* **test:** time acceptance views with no other test file running ([#81](https://github.com/FormulaMonks/renderizr/issues/81)) ([d5d4b4a](https://github.com/FormulaMonks/renderizr/commit/d5d4b4a7d6f19870da55519546da1247bc61cbcf))


### Documentation

* add branch naming and verification rules ([#68](https://github.com/FormulaMonks/renderizr/issues/68)) ([268ea84](https://github.com/FormulaMonks/renderizr/commit/268ea843bbeacd08917a059ce845524b4782320f))
* add coding standards and spell American English throughout ([#56](https://github.com/FormulaMonks/renderizr/issues/56)) ([a953462](https://github.com/FormulaMonks/renderizr/commit/a953462e721fa27c938b1d5a4cf187ec2331a363))
* add the domain glossary, agent rules and the React Flow engine ADRs ([8581022](https://github.com/FormulaMonks/renderizr/commit/8581022685cb0a0f00b66adc94e595c2cc882e26)) ([ad5dafe](https://github.com/FormulaMonks/renderizr/commit/ad5dafe007c9e6499b488de087d4a5e5dff77032))
* **architecture:** record the React Flow engine decisions ([c402c1f](https://github.com/FormulaMonks/renderizr/commit/c402c1ffbdd5d4e17f15500ebf846332daa8686b))
* ask every pull request for what, how to verify and notes ([#54](https://github.com/FormulaMonks/renderizr/issues/54)) ([777ecb4](https://github.com/FormulaMonks/renderizr/commit/777ecb4c0b99065322955d0c771028d0c81d6c39))
* prefer active voice and simple tenses ([#80](https://github.com/FormulaMonks/renderizr/issues/80)) ([823b844](https://github.com/FormulaMonks/renderizr/commit/823b84495486fead245130ef453749026fbb564d))
* scope the documentation rules by path ([a018278](https://github.com/FormulaMonks/renderizr/commit/a018278d751f571363926cb26dd762110f7be639))

## [1.1.1](https://github.com/FormulaMonks/renderizr/compare/v1.1.0...v1.1.1) - 2026-09-26

### Fixed

* **ci:** let release-please parse back its own release pull request ([6fb83d9](https://github.com/FormulaMonks/renderizr/commit/6fb83d91899f4a6b320d009bc50f0fb5895f476f))
* make documentation links followable and stop tables overflowing ([937b751](https://github.com/FormulaMonks/renderizr/commit/937b751433ad59ad2e4c75c1c3e7a1f7797b8f30))
* **skill:** only load the renderizr skill when the user invokes it ([ce03757](https://github.com/FormulaMonks/renderizr/commit/ce0375754e2262be1e662137946635c60cc50201))

## [1.1.0](https://github.com/FormulaMonks/renderizr/releases/tag/v1.1.0) - 2026-08-17

### Added

* a Claude skill for rendering a workspace as an artifact ([5112399](https://github.com/FormulaMonks/renderizr/commit/51123993b2874702b325eef9d4cb6fbfbb1d01e7))
* cut releases locally, without a GitHub App ([ffbdc31](https://github.com/FormulaMonks/renderizr/commit/ffbdc319a37a7e000b1c6018b893d62457f319ab))
* **ci:** let release artifacts be attached to a hand-cut tag ([988d5b4](https://github.com/FormulaMonks/renderizr/commit/988d5b4fb79500c4356ac955196abce672054504))

### Fixed

* **deps:** clear GHSA-mw96-cpmx-2vgc by upgrading rollup ([38ed5d8](https://github.com/FormulaMonks/renderizr/commit/38ed5d85b7d57b728354c25b7431fc64aa273f83))
* **ci:** anchor release-please to the 1.0.0 commit ([3acbf0c](https://github.com/FormulaMonks/renderizr/commit/3acbf0c5c196b3ad191babb38d8d1cc546693e13))

### Documentation

* tell readers how to install the skill ([93b87d7](https://github.com/FormulaMonks/renderizr/commit/93b87d742f835c4a011cf73ec4c416109578abeb))

## 1.0.0 - 2026-08-16

The first public version. It was never tagged — the version landed in the manifest and the first release cut from this repository is 1.1.0, so there is no `v1.0.0` to link to. Everything below already worked; what changed is that it is now versioned, licensed, tested in CI and documented for people who did not write it.

This entry is hand-written because there was no previous release for release-please to measure against. Every entry after this one is generated from commit messages.

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
- **Release automation**: versions, tags, GitHub Releases and this changelog are derived from conventional commits, and each Release carries a source tarball and a rendered example — as a static site and as a single self-contained file. Nothing is published to a registry; `npx github:FormulaMonks/renderizr` reads git.
- **Project documentation** for a public repository: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, MAINTAINERS, THIRD-PARTY-NOTICES, issue and pull request templates, and CODEOWNERS.

[1.1.0]: https://github.com/FormulaMonks/renderizr/releases/tag/v1.1.0
