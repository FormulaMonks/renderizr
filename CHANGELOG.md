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

## [1.1.0](https://github.com/FormulaMonks/renderizr/compare/v1.0.0...v1.1.0) (2026-08-17)


### Added

* add a Claude skill for rendering a workspace as an artifact ([2a0cb3d](https://github.com/FormulaMonks/renderizr/commit/2a0cb3d1921d5386f2b839599bc37538670f8825))
* add a Claude skill for rendering a workspace as an artifact ([5112399](https://github.com/FormulaMonks/renderizr/commit/51123993b2874702b325eef9d4cb6fbfbb1d01e7))
* add dagre and graphlib as window globals ([736196b](https://github.com/FormulaMonks/renderizr/commit/736196b665011d9069a45dd29e06c2bd614efa4d))
* add issue forms and a pull request template ([12b5957](https://github.com/FormulaMonks/renderizr/commit/12b59576a51d0ef22586e914171a5af42afcd265))
* added support for storing dark mode ([605f1b5](https://github.com/FormulaMonks/renderizr/commit/605f1b50c200442e842f37f3705a225dd0177be3))
* added workspace title to rendered html ([8a0c2ce](https://github.com/FormulaMonks/renderizr/commit/8a0c2ce6c74c0b47c1a9fe770575638d3e308736))
* **adrs:** added link handling ([85f0fd3](https://github.com/FormulaMonks/renderizr/commit/85f0fd3782c35b640d84917fe5a4a78129f8f9de))
* **adrs:** navigation and code highlighting support ([0386fe2](https://github.com/FormulaMonks/renderizr/commit/0386fe2c1126f0b8e3e0eb461e59ffb7af1e8df7))
* autolayout rendering for views without positions ([b98e0e7](https://github.com/FormulaMonks/renderizr/commit/b98e0e7e9ad6d31f589383e2a76b5e4ea67b6a01))
* **build:** script that fixes autoLayout ([a56fe00](https://github.com/FormulaMonks/renderizr/commit/a56fe00adf57d9e8f4ba134d2dcab582f631bf1e))
* **ci:** let release artifacts be attached to a hand-cut tag ([affa72f](https://github.com/FormulaMonks/renderizr/commit/affa72fe2eaa80bf09f189cc9772d90d4dbc90ca))
* **ci:** let release artifacts be attached to a hand-cut tag ([988d5b4](https://github.com/FormulaMonks/renderizr/commit/988d5b4fb79500c4356ac955196abce672054504))
* **ci:** self-host Renovate as a GitHub App ([346a9bc](https://github.com/FormulaMonks/renderizr/commit/346a9bc436310192e0e0638596d1137c48d763cd))
* **ci:** self-host Renovate, and auto-merge only what CI can vouch for ([23bd5f1](https://github.com/FormulaMonks/renderizr/commit/23bd5f15d14f928c5732bdd5b6eae6f8eee8017f))
* cut releases locally, without a GitHub App ([2454580](https://github.com/FormulaMonks/renderizr/commit/245458008fb4d43870707bcff1cd7fe445a4f46b))
* cut releases locally, without a GitHub App ([ffbdc31](https://github.com/FormulaMonks/renderizr/commit/ffbdc319a37a7e000b1c6018b893d62457f319ab))
* dark mode and panzoom ([b7ed91f](https://github.com/FormulaMonks/renderizr/commit/b7ed91feab2a1bc693f39937ee32eed25a718fad))
* **decisions:** styles for markdown renderer ([a1c3a37](https://github.com/FormulaMonks/renderizr/commit/a1c3a37cebb59bd981d5188aaf7fbfe8ca8bdc3a))
* **diagrams:** button actions and styles ([215997d](https://github.com/FormulaMonks/renderizr/commit/215997dbe8e6a650d10b3db5a5b680608e6e4ad7))
* **diagrams:** general styling for diagram navigation ([5d0d24d](https://github.com/FormulaMonks/renderizr/commit/5d0d24d247f29a5b7e9dc87e3fcafe98f2052d08))
* **diagrams:** navigation active styles and responsiveness ([0a38bd1](https://github.com/FormulaMonks/renderizr/commit/0a38bd10d674786e32ef540ced3f557d92b05993))
* **docs:** basic layout styles ([7e80077](https://github.com/FormulaMonks/renderizr/commit/7e8007793a408ad57dd9fd7f10efa0337dad7260))
* **docs:** nested docs titles ([3adab85](https://github.com/FormulaMonks/renderizr/commit/3adab8599c0c69b0307f40b8f360d0c9e9f52af1))
* documentation readability — measure, heading outline, table widths ([15b1bbe](https://github.com/FormulaMonks/renderizr/commit/15b1bbe17f72de3d97046cf6e789bb7746a447c0))
* enabled scripts for consumption with npx ([01ea820](https://github.com/FormulaMonks/renderizr/commit/01ea820444194822e360c277b99aa4dc4cd4f856))
* enhance autolayout detection ([ed6e5b8](https://github.com/FormulaMonks/renderizr/commit/ed6e5b8d7ddc2a96b1d6ee74ab7e9da55da08827))
* fixed styles for differnet device sizes ([0096cc9](https://github.com/FormulaMonks/renderizr/commit/0096cc99f8f6fd9c752105ad020a4dc6c6877c9b))
* general styles and design ([566aaab](https://github.com/FormulaMonks/renderizr/commit/566aaab9d1ece73d09c459d9524ad376e344629e))
* initial commit ([9de40c1](https://github.com/FormulaMonks/renderizr/commit/9de40c18030661e72cc9864087ba0d4ab33be306))
* make the diagram usable on a phone, pinch included ([ce13e56](https://github.com/FormulaMonks/renderizr/commit/ce13e56eeb91fdadb0f6668b9720b446f3c03d11))
* make the mobile view strip icons only ([34dfdaf](https://github.com/FormulaMonks/renderizr/commit/34dfdafac82ca8167e16a1bcee833aac43ff554a))
* **navigation:** url navigation ([5fefc92](https://github.com/FormulaMonks/renderizr/commit/5fefc9279b4b416315f31d0c90d2fb07e4e0489e))
* page documentation sections and follow them in the sidebar ([e380556](https://github.com/FormulaMonks/renderizr/commit/e38055602443e2803bfc356a9ca8c920cb2295b2))
* reading and theme usability pass ([1a234a5](https://github.com/FormulaMonks/renderizr/commit/1a234a57c080ebf734c0963de36df2a9db5e7626))
* render tables, code and GitHub alerts for reading ([3a66f9d](https://github.com/FormulaMonks/renderizr/commit/3a66f9dba7ed502d7d159bf2c59a2f18d20085b6))
* render with Structurizr's current engine, and a collapsible view drawer ([7389368](https://github.com/FormulaMonks/renderizr/commit/73893687dab4d9e93b1cfb81497c802c69817f0e))
* rendered diagrams from url or source json ([6ab3655](https://github.com/FormulaMonks/renderizr/commit/6ab3655b0237f5475edb3ffba843724044b7d025))
* **renovate:** auto-merge action pins and dev tooling, never the runtime ([7ba6abc](https://github.com/FormulaMonks/renderizr/commit/7ba6abc48e382884c512410506c8ebb9ae513492))
* router and pages navigation ([551923d](https://github.com/FormulaMonks/renderizr/commit/551923da885868dcbe308760bf297a4903cf44e8))
* separate the page theme from the diagram theme ([53de34c](https://github.com/FormulaMonks/renderizr/commit/53de34c2d21daf3fa5e79264c5561cdaea3ed446))
* show the Renderizr version in the rendered footer ([2961019](https://github.com/FormulaMonks/renderizr/commit/2961019cb666d23ff9c1b38ed7597d20db521922))
* single-file output, a mobile-capable canvas, and an installable package ([507e5f5](https://github.com/FormulaMonks/renderizr/commit/507e5f533d1b3bc18bf836f2985c2404b85a5d5b))
* single-file output, canvas that fits or scrolls, logo and font embedding ([9b951e2](https://github.com/FormulaMonks/renderizr/commit/9b951e2033488539bba73e45fa1503994f8a17d0))
* single-file output, Structurizr's current renderer, and a canvas that fits ([d5d7558](https://github.com/FormulaMonks/renderizr/commit/d5d75589c377604ae2f32230e6d77cb1d0f823a1))
* widen the documentation measure to 1000px ([4c9ab1d](https://github.com/FormulaMonks/renderizr/commit/4c9ab1d909dac0ddb871612f87d81a8f4e748bf0))
* wip: added some styles and overall navigation ([8cd3efa](https://github.com/FormulaMonks/renderizr/commit/8cd3efa8637ea16ae65ce4cda1af1ab5c914b0c1))
* wip: decisions page ([764c951](https://github.com/FormulaMonks/renderizr/commit/764c9514fbaeaf68ce620a8c7e79b0ae9e56701e))


### Fixed

* cap table columns at a readable width ([e971f98](https://github.com/FormulaMonks/renderizr/commit/e971f985020dfd5b4950c95ec0872e4d193be912))
* centre the view strip when it fits, and clear the header when jumping to a heading ([f0567d9](https://github.com/FormulaMonks/renderizr/commit/f0567d95d509166ae2f15b256a9ba7bcbc9c481a))
* **ci:** run release-please as a GitHub App, not as GitHub Actions ([000bfb6](https://github.com/FormulaMonks/renderizr/commit/000bfb6f023a16011282a416387d151ed493ae76))
* **ci:** run release-please as a GitHub App, not as GitHub Actions ([424cc94](https://github.com/FormulaMonks/renderizr/commit/424cc947c79749ed431e6ffc67c5dd8628471860))
* **deps:** clear GHSA-mw96-cpmx-2vgc by upgrading rollup ([2081b86](https://github.com/FormulaMonks/renderizr/commit/2081b86ad55e68e9cc14fff7c5f0b92fece00166))
* **deps:** clear GHSA-mw96-cpmx-2vgc by upgrading rollup ([38ed5d8](https://github.com/FormulaMonks/renderizr/commit/38ed5d85b7d57b728354c25b7431fc64aa273f83))
* draw the diagram when the page starts life with no size ([03672f4](https://github.com/FormulaMonks/renderizr/commit/03672f4e8dbc0aaa4fdf33c169d7f911f5d7a688))
* give each decision's status note its own line ([a143338](https://github.com/FormulaMonks/renderizr/commit/a143338367adcd4eb912968b081f5bc215531f42))
* give the diagram toolbar a theme ([069f33b](https://github.com/FormulaMonks/renderizr/commit/069f33bc249c31b491ad0409fadb34035d127962))
* issues with click handlers and deeplinking ([b1b4582](https://github.com/FormulaMonks/renderizr/commit/b1b45827823ab552819769ca127448853f24292a))
* layout styles ([b3b9c42](https://github.com/FormulaMonks/renderizr/commit/b3b9c423ddbdc82462fa3594a10153d7ef6fe7e3))
* let the dev server start without an argument ([bf38e0c](https://github.com/FormulaMonks/renderizr/commit/bf38e0cbb43ce12ecd9179a73129afadbd76e1b2))
* make artifact.html publishable, and give ADR status notes their own lines ([262910a](https://github.com/FormulaMonks/renderizr/commit/262910a4fe0025a605ba1d25a8e959e4d96208fc))
* make the package installable without the git submodule ([bdab6d1](https://github.com/FormulaMonks/renderizr/commit/bdab6d1acd43607d47f1f75cc037aa0a1ba499c0))
* name the installed command in --help ([329b432](https://github.com/FormulaMonks/renderizr/commit/329b4321fae4de90cad2aaea5c41a889ff53eeb7))
* narrow click targets to Element before calling closest() ([016fd0f](https://github.com/FormulaMonks/renderizr/commit/016fd0f827da022e9e32719159036fddcd3249b0))
* **nav:** enforcing navigation route name ([da91f46](https://github.com/FormulaMonks/renderizr/commit/da91f462748c8c275fc275a263137ecf2aca0a07))
* one history entry per navigation, a real zoom floor, and a legible drawer ([77021a2](https://github.com/FormulaMonks/renderizr/commit/77021a2da3dbf1cca7fda1d4c0418fddf5b30885))
* refuse a tagged template holding an unspellable unit ([6e9db27](https://github.com/FormulaMonks/renderizr/commit/6e9db27bab18a61e68b85420511b8569476ddde8))
* relative path for static assets ([70ef17c](https://github.com/FormulaMonks/renderizr/commit/70ef17c76760039e8fe472c20efe2617ea7a5a6d))
* remove negative top margin on docs section ([7611fe4](https://github.com/FormulaMonks/renderizr/commit/7611fe479b971a7f57c750cb14bb016c6dfa51b4))
* removed logging statement ([886bbac](https://github.com/FormulaMonks/renderizr/commit/886bbac3eb8c033a631d38ba3b3dd959bafd48fc))
* rendering order ([0c03e35](https://github.com/FormulaMonks/renderizr/commit/0c03e35e94e5c9d71c61937504d7e0a287b86b81))
* renumber each page's headings and repair the type scale ([19046d3](https://github.com/FormulaMonks/renderizr/commit/19046d3a173d57433ec53b75f5423bddf4f67f79))
* replace rather than push when re-navigating to the open page ([7135cf3](https://github.com/FormulaMonks/renderizr/commit/7135cf37af7107d050dd28610530437120a1e92a))
* restore LICENSE to the plain MIT text so GitHub detects it ([c25c79d](https://github.com/FormulaMonks/renderizr/commit/c25c79dafb89c40edd1167f16d6bb77b53dda4cd))
* skip the src/ suites cleanly on Node 20.0-20.5 ([1eed849](https://github.com/FormulaMonks/renderizr/commit/1eed849d9afda6262c1ef2f1b13572922d75ed42))
* stop a stray separator turning a paragraph into a page ([37c44df](https://github.com/FormulaMonks/renderizr/commit/37c44df2b2fa503742ae87439156eff3e1509167))
* stop a stray separator turning a paragraph into a page ([3251054](https://github.com/FormulaMonks/renderizr/commit/325105424ac711a1ad07fa345f511879859a5a86))
* stop emitting escapes a Claude artifact upload rejects ([fc1575c](https://github.com/FormulaMonks/renderizr/commit/fc1575ca35aa3093415d008aeed2fecf0c0a64a0))
* stop inflating the diagram paper, and bound how tall a canvas can grow ([d3c7b63](https://github.com/FormulaMonks/renderizr/commit/d3c7b63bf8a3c70296fc9a1ed025e1407075e3ba))
* stop sync:vendor destroying vendor/ when a reference is missing ([6251a14](https://github.com/FormulaMonks/renderizr/commit/6251a14af3f963a9a77f616b40c25a53ae126db8))
* stop the Chrome profile cleanup racing the browser it just killed ([afc87be](https://github.com/FormulaMonks/renderizr/commit/afc87bea2aba670b69e13fa17800ed858a4312bb))
* **styles:** layout in mobile landscape / portrait ([224539f](https://github.com/FormulaMonks/renderizr/commit/224539fea564dda2a0e0547ca786979946aee338))
* **styles:** responsive fixes on devices ([da71138](https://github.com/FormulaMonks/renderizr/commit/da71138b849f1b242f97c9709a571a562c4cffa9))


### Changed

* **menu:** wip: move menu out of adrs page ([ba614a5](https://github.com/FormulaMonks/renderizr/commit/ba614a573e55c467b99fc8e8ed7fec46e57088e7))
* moved diagrams page ([8be325f](https://github.com/FormulaMonks/renderizr/commit/8be325f782086fab108b015cb390cf8641bd773a))
* **nav:** leveraged navigation component ([c837163](https://github.com/FormulaMonks/renderizr/commit/c8371638a893be2f2c8064655595777e6f84c744))
* **nav:** styles ([903c685](https://github.com/FormulaMonks/renderizr/commit/903c68522daf6cb3f01d6c1fab457dfa3918cd48))
* **router:** replace pathname with query string ([5b1bfc2](https://github.com/FormulaMonks/renderizr/commit/5b1bfc2d9ab1fabdd1d1d24f6b5dfacf715c820d))
* use American spellings in prose and identifiers ([1870306](https://github.com/FormulaMonks/renderizr/commit/1870306fbef4ff59495c29739ca8766362077e1e))


### Documentation

* add contributor, security and support documentation ([70ec808](https://github.com/FormulaMonks/renderizr/commit/70ec80831b8ff246139867a04da35bb41eec870f))
* added README with basic docs ([76d63e4](https://github.com/FormulaMonks/renderizr/commit/76d63e4160b227617b34514abfb649c07a78f38d))
* **architecture:** renamed to renderizr ([d56cf5f](https://github.com/FormulaMonks/renderizr/commit/d56cf5fab84c07e3fbf8d3f36c5514eae05dd03d))
* document third-party licensing and attribution ([6d68a60](https://github.com/FormulaMonks/renderizr/commit/6d68a60e2eb2bc3f27e59ae003fbdabe1e065eec))
* drop Structurizr Lite, which no longer exists ([7c10923](https://github.com/FormulaMonks/renderizr/commit/7c1092398e66572ee915467a43ff1bfc712e317b))
* fixed command in docs ([0f782de](https://github.com/FormulaMonks/renderizr/commit/0f782deb473d95d04949654b0f272453a8a435ee))
* refresh the third-party versions in NOTICE ([715e3d4](https://github.com/FormulaMonks/renderizr/commit/715e3d47d46081a13e1816f859886834113dd732))
* rewrite the README for a public audience ([2ba5023](https://github.com/FormulaMonks/renderizr/commit/2ba50231a60a55801133ae1f05d584430efdf812))
* tell readers how to install the skill ([93b87d7](https://github.com/FormulaMonks/renderizr/commit/93b87d742f835c4a011cf73ec4c416109578abeb))
* update README and remove autolayout caveat ([221ca6a](https://github.com/FormulaMonks/renderizr/commit/221ca6a2569e6f3594493f4e042364e3eec447ae))

## [1.0.0](https://github.com/FormulaMonks/renderizr/releases/tag/v1.0.0) - 2026-08-16

The first public release, and the first tag this repository has ever carried. Everything below already worked; what changed is that it is now versioned, licensed, tested in CI and documented for people who did not write it.

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

[1.0.0]: https://github.com/FormulaMonks/renderizr/releases/tag/v1.0.0
