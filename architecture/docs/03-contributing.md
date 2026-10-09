# Contributing

This section takes you from a fresh clone to a merged pull request. Bug reports, feature requests and pull requests are all welcome on [GitHub](https://github.com/FormulaMonks/renderizr). Everyone taking part follows the [Code of Conduct](https://github.com/FormulaMonks/renderizr/blob/main/CODE_OF_CONDUCT.md). Report a security problem privately through [GitHub Security Advisories](https://github.com/FormulaMonks/renderizr/security/advisories/new), never as a public issue.

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node | 22.13 or newer | pnpm 11 needs it. Renderizr itself runs on Node 20 or newer, and CI checks that floor with npm in a separate job |
| pnpm | 11 | The lockfile is `pnpm-lock.yaml`, and `pnpm-workspace.yaml` carries the build allow-list. npm and yarn drift the lockfile |
| git | any | To clone the repository |

Development runs on Node 24, which `.mise.toml` pins and `mise.lock` resolves. With [mise](https://mise.jdx.dev) installed, `mise install` in the repository root gets you the exact Node and pnpm the maintainers use. Any Node and pnpm that meet the table work too; nothing in the build reads mise.

## Get the code

```bash
git clone https://github.com/FormulaMonks/renderizr.git
cd renderizr
pnpm install
pnpm hooks
```

`pnpm hooks` installs the git hooks, once per clone. It stays a separate step because a `prepare` script runs whenever a package manager installs a package from a git URL, and `npx github:FormulaMonks/renderizr` does exactly that. Confirm the hooks took with `git config --get core.hooksPath`, which prints `.husky/_`.

### The test workspaces

The clone holds everything the tests need. The Big Bank plc, groups and Amazon Web Services workspaces the acceptance harness draws are unmodified copies from [structurizr/structurizr](https://github.com/structurizr/structurizr), committed under `test/__fixtures__/`. The repository keeps no submodule, because npm clones a git dependency with `--recurse-submodules`, and every cold `npx` would download it before the CLI starts.

[Reference](04-reference.md) covers the dev server and the build, every pnpm script, the project layout and where a new test goes.

## Branches and commits

Name every branch `<type>/<issue>/<short-description>`, for example `feat/42/resolve-view` or `fix/57/hash-routes-under-file`:

- `<type>` is `feat` for a new capability, `fix` for a bug and `chore` for everything else (docs, CI, refactors, dependencies and tooling).
- `<issue>` is the number of the GitHub issue the branch works on. Leave the segment out when the work has no issue: `chore/bump-biome`.
- `<short-description>` is a few lower-case words in kebab-case that say what the branch does.

Write commit messages as [Conventional Commits](https://www.conventionalcommits.org). The header reads `type(optional-scope): subject`, at most 100 characters, with a lower-case type and a subject that ends without a full stop. The types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` and `test`. Mark a breaking change with `feat!:` or a `BREAKING CHANGE:` footer.

A maintainer squash-merges every pull request, so the pull request title becomes the commit that release-please reads. CI checks the title with the same commitlint rules.

### Git hooks

`pnpm hooks` installs three hooks from `.husky/`:

| Hook | Runs | Purpose |
| --- | --- | --- |
| `prepare-commit-msg` | `pnpm exec czg --hook` | Opens an interactive prompt that writes the commit message when you pass no `-m` |
| `pre-commit` | `pnpm exec lint-staged` | Runs `biome ci` over the staged source files |
| `commit-msg` | `pnpm exec commitlint --edit` | Checks the message against Conventional Commits |

When `pre-commit` fails, run `pnpm format`, stage the files again and commit. When `commit-msg` fails, the output names the rule; run `git commit` again and let czg write the message. A per-clone switch turns each hook off, such as `git config custom.hooks.pre-commit false`, and `git config --unset` turns it back on. CI runs the same checks either way.

## Pull requests

Before you open one, run what CI runs:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Then build something real, as [Local development](04-reference.md#local-development) shows, and look at it in a browser. A rendering or documentation change that only passes the tests stays untested.

- **Keep one concern per pull request.** Branch off `main` and name the branch as [Branches and commits](#branches-and-commits) says.
- **Fill in the template**: what the change does and why, how a reviewer can see it work, and any additional notes. For anything visual, a screenshot before and after says more than a paragraph.
- **Test anything in `scripts/`.** New behavior gets a test, and a fixed bug gets the test that would have caught it.
- **Update the docs in the same pull request.** A new CLI flag changes `scripts/cli.js`, the flag table in the README and the [usage section](02-usage.md#options).
- **Justify every new runtime dependency.** Everything in `dependencies` ends up inlined into a file people email around, so its weight needs a sentence of reasoning.
- **Open a draft** for work you want eyes on early, and mark it ready when CI passes.

## Reviews

CI runs lint, type checks, the test suite on Node 22 and 24, an npm install and build on Node 20, the end-to-end render and the pull request title check; CodeQL runs too. A maintainer reviews the pull request, usually within a week. Reviewers label each comment:

- **blocking**: change it before merge.
- **suggestion**: take it or explain why not; either answer merges.
- **nit**: cosmetic, never blocking.

Push fixes as new commits while a review is open, so reviewers can read the change since their last look. The ruleset on `main` requires a pull request with every review thread resolved and a passing `ci` check. Maintainers also wait for one approving review from someone other than the author before they merge.

## Releases

Contributors do nothing for a release. Consumers run `npx github:FormulaMonks/renderizr`, which resolves to `main`, so a merged pull request reaches users as soon as it lands.

[release-please](https://github.com/googleapis/release-please) keeps a release pull request open on `main` with the next version and its changelog entry, computed from the Conventional Commits since the last tag. Merging it tags the release and publishes the GitHub Release, with a source tarball, the fixture workspace rendered as a static site and as a single file, and checksums. Each release also renders `architecture/workspace.json` from its tag and publishes it to this site, so the site always shows the latest release. Nothing goes to a package registry.
