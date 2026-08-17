# Maintainers

## Current maintainers

| Name | GitHub | Areas |
| --- | --- | --- |
| Andrés Zorro | [@andreszorro](https://github.com/andreszorro) | Everything: the build pipeline in `scripts/`, the app in `src/`, the vendored Structurizr renderer, releases |

Renderizr is stewarded by [Formula.Monks](https://www.monks.com) and licensed [MIT](LICENSE). Contact for anything that needs to reach a human privately: **andres.zorro@monks.com**.

That table has exactly one row, and it is worth saying so plainly rather than implying a committee: this is a small project with a single maintainer today. It is why review turnaround is measured in days rather than hours, and it is the main reason the second half of this document exists.

### Maintainers are not the same set as accounts with write access

Being listed above means holding the responsibilities below. It is not the same thing as holding a GitHub permission, and on this repository the two genuinely differ, so here is the real picture as of 2026-08-16 — reproduce it with `gh api repos/FormulaMonks/renderizr/collaborators --paginate --jq '.[] | [.login, .role_name] | @tsv'`:

- **One direct collaborator**: `@andreszorro`, the maintainer in the table.
- **Seven accounts with `admin`** — `@andreszorro`, `@juanwingo`, `@joshrobichaud`, `@Charlygm23`, `@AlejoRomero98`, `@sergio-correa-monks`, `@YinetC`. Six of those inherit it from FormulaMonks org membership rather than from any decision about this repository, and none of them has volunteered for the review, triage and release duties below.
- **Ninety-eight accounts with `read`**, likewise inherited from the organization.

So an account with the technical ability to push to `main` is not thereby a maintainer here, and the rules in the next section bind everyone with the ability regardless of whether they wanted the title. If you hold inherited admin and would like the row and the responsibilities, see [Becoming a maintainer](#becoming-a-maintainer); if you hold it and would rather not, say so and it will be removed.

## What a maintainer does

The job, for anyone in the table above:

- **Triage.** Read new issues, reproduce or ask for what is missing, label, close duplicates. Every issue form stamps `needs triage` alongside its domain label, so the queue is [`is:issue is:open label:"needs triage"`](https://github.com/FormulaMonks/renderizr/issues?q=is%3Aissue+is%3Aopen+label%3A%22needs+triage%22) and removing that label is what "triaged" means here. GitHub silently drops labels that do not exist, so this only works once someone has run `gh label create "needs triage" --color FBCA04 --description "Reporter-selected; a maintainer has not confirmed it yet"` — it is on the [repository-setup checklist](#repository-setup-still-to-be-done) and is not done yet.
- **Review.** Read pull requests against the expectations in [CONTRIBUTING.md](CONTRIBUTING.md#pull-requests), mark comments as blocking / suggestion / nit, and say yes or no rather than leaving things to rot.
- **Merge.** Squash-merge approved, green pull requests, writing a squash message that describes the whole change as a conventional commit — that line becomes the changelog entry. GitHub prefills the squash message from the pull request title, and the `pr title` job in [`ci.yml`](.github/workflows/ci.yml) already ran the repository's `commitlint.config.cjs` over that title, so a green PR has a parseable message waiting. Check that it describes the *whole* change rather than the last commit; the machine can only check the grammar.
- **Release.** Nobody tags by hand. `.github/workflows/release.yml` runs release-please on every push to `main`, which keeps a `chore(release): X.Y.Z` pull request open with the version bump and the changelog entry; merging that pull request is what creates the `vX.Y.Z` tag and publishes the GitHub Release with its artifacts. A maintainer's job is to review that PR and decide when there is enough to ship. Nothing is published to a registry: `package.json` is private and there is no publish job, so the GitHub Release is the whole distribution channel. **The first release is the exception**: it is pinned to `0.1.0` by `release-as` in `release-please-config.json`, and that pin has to be deleted once `v0.1.0` exists — see [After the first release](#after-the-first-release).
- **Keep the vendored code honest.** Bump `submodules/structurizr`, run `pnpm sync:vendor`, and check the diff is upstream's and nobody's else's.
- **Answer security reports** within the timelines in [SECURITY.md](SECURITY.md).
- **Enforce the [Code of Conduct](CODE_OF_CONDUCT.md).**

What a maintainer is *not*: an owner of the roadmap by fiat. Disagreements are settled in the open, on the issue or the PR. A decision that changes something architectural belongs in `architecture/decisions` as an ADR — the directory is there, empty and waiting for its first one, and Renderizr renders its own workspace, so those decisions end up on the site the tool builds.

## The rules maintainers hold themselves to

`main` is governed by a ruleset that requires a pull request, one approving review, a code-owner review and the `ci` check. It carries a `RepositoryRole` bypass set to `always`, so for anyone holding that role — and for any app added to the bypass list — the rules below are still a promise rather than a setting. They bind every account that can push, including the inherited-admin ones listed above. Hold us to them in public if we break them.

- **No direct pushes to `main`.** Maintainers open pull requests like everyone else.
- **Every merge needs a passing CI run and an approving review from someone other than the author.** With one maintainer, that means a maintainer's own change waits for a second reviewer — a contributor's review counts and is welcome.
- **No self-merging a change nobody has read.** The single genuine exception is a revert of something currently broken on `main`, which may be merged immediately and explained afterwards on the PR.
- **Releases come from `main`**, never from a branch, and never with a red CI.

## Repository setup still to be done

A handful of things this repository documents live in GitHub's settings, not in a file, so no pull request can turn them on. Each line below records the state as measured, the command that measures it, and who can change it. Tick them off before, or shortly after, the repository goes public.

- [ ] **Turn GitHub Pages on.** *A click, and one only an admin can make.* Settings → Pages → Build and deployment → Source = "GitHub Actions". Pages is not enabled today (`gh api repos/FormulaMonks/renderizr/pages` returns 404). No workflow can do this for you: creating a Pages site is `administration:write`, and `GITHUB_TOKEN` cannot be granted that permission at any level — `actions/configure-pages`' own `action.yml` says its `enablement` input "requires a token other than `GITHUB_TOKEN` to be provided". Until the toggle is flipped, `.github/workflows/pages.yml` detects the missing site in its `preflight` job and skips the build and deploy jobs with an explanatory notice. Be clear about what that looks like: `preflight` itself succeeds, so the run's conclusion is **success** — a green check on the Actions tab, with two skipped jobs and an annotation naming this setting, and nothing published. It is not gray; a run only shows as skipped when *every* job in it is skipped. The gate exists to keep the red X off a freshly published repository, not to make the run disappear. The same probe also catches the near-miss where Source is set to "Deploy from a branch" instead: it reads `build_type` from the API and proceeds only on `workflow`, because `actions/deploy-pages` cannot deploy to a branch-built site. After the toggle is flipped, re-run the workflow (or push to `main`) and it builds and deploys. Verify with `gh api repos/FormulaMonks/renderizr/pages` returning 200. Once the first deployment is green, two links become true and should be added in the same pull request: <https://formulamonks.github.io/renderizr/> (the browsable site) and <https://formulamonks.github.io/renderizr/single-file.html> (the same workspace as one document). The first belongs in README.md's "And you get this:" paragraph, next to the screenshot — a live example is the fastest way for a stranger to judge a static-site generator, and it is the one thing the README is still missing. Do not add either link before the deployment exists; a 404 in the first screenful is worse than no link at all.
- [ ] **`needs triage` label.** Not created: `gh label list --repo FormulaMonks/renderizr` lists the nine GitHub defaults and nothing else, while all four issue forms request it. GitHub drops labels that do not exist, silently, so the triage queue is empty for the wrong reason. Fix: `gh label create "needs triage" --color FBCA04 --description "Reporter-selected; a maintainer has not confirmed it yet"`.
- [x] **A ruleset on `main`.** Done — ruleset `main` (id 20920223) is active over `~DEFAULT_BRANCH` and requires a pull request, one approving review, a code-owner review and the `ci` status check, and blocks deletion and non-fast-forward pushes. Two things about it are worth knowing rather than rediscovering. It carries a `RepositoryRole` bypass set to `always`, so the rules in [the section above](#the-rules-maintainers-hold-themselves-to) remain a promise for anyone holding that role — remove the bypass if you want them enforced against everybody, including yourself. And it enables the `code_coverage` rule, which nothing in CI feeds: no workflow uploads a coverage report, so if that rule carries a threshold it will block every merge for a reason no contributor can act on. `pnpm test:coverage` exists and reports ~99% if you want to wire it up; otherwise turn the rule off.
- [ ] **Let Renovate merge its own low-risk pull requests.** `renovate.json` marks the action-pin and dev-tooling groups `automerge: true` for patch and minor, and explicitly forbids it for anything inlined into rendered output. None of that takes effect until two settings change, and both are deliberate decisions rather than paperwork. First, **Settings → General → Pull Requests → Allow auto-merge**, which is off today (`gh api repos/FormulaMonks/renderizr --jq .allow_auto_merge` returns `false`); Renovate drives GitHub's native auto-merge, so without it the pull requests simply wait. Second, the `main` ruleset requires one approving review and a code-owner review, and auto-merge cannot satisfy a review requirement — the pull request sits indefinitely with the `ci` check green. Add the **Renovate** GitHub App as a bypass actor on that ruleset (Settings → Rules → `main` → Bypass list → Add bypass → the Renovate app, mode "Always"), which is narrower than lowering the review requirement for everybody. Understand what it buys and costs: dependency bumps that pass the full suite and both render modes land without a human, and in exchange Renovate can merge to `main` unreviewed. `minimumReleaseAge: "3 days"` means nothing merges the day it is published, and the `automerge: false` rule on the rendering runtime is the only thing keeping jQuery, JointJS, dagre, markdown-it, highlight.js and vite out of that path — so that rule is load-bearing once the bypass exists, not decorative. If that trade is not one you want, leave both settings alone; the config is inert without them and every Renovate pull request keeps waiting for you.
- [ ] **The release GitHub App.** *Required before any release can happen.* Releases are dead in the water without it: `gh api repos/FormulaMonks/renderizr/actions/permissions/workflow` reports `can_approve_pull_request_reviews: false`, so `GITHUB_TOKEN` cannot open the release pull request and release-please fails with "GitHub Actions is not permitted to create or approve pull requests". Ticking Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" would clear that error and immediately create a worse one: a pull request opened with `GITHUB_TOKEN` does not trigger workflows, so `ci` would never report on the release pull request, and `ci` is a required check in the ruleset above — every release would need a ruleset bypass. An App identity avoids both. Create a GitHub App owned by the FormulaMonks organization with repository permissions **Contents: read and write** and **Pull requests: read and write**, install it on this repository only, then add the App ID as the repository *variable* `RELEASE_APP_ID` and its generated private key as the repository *secret* `RELEASE_APP_PRIVATE_KEY`. Until `RELEASE_APP_ID` is set, `.github/workflows/release.yml` skips release-please and runs a `prepare release (not configured)` job that says so — the run is green, and nothing is released.
- [ ] **Private vulnerability reporting.** SECURITY.md sends reporters to `/security/advisories/new` and already tells them to fall back to email if that link 404s, so the document is true either way — but the form only appears once the setting is on, and the setting is only offered on public repositories. Turn it on the same day the repository becomes public (Settings → Advanced Security → Private vulnerability reporting).
- [ ] **Secret scanning, push protection and Dependabot alerts.** All disabled today: `gh api repos/FormulaMonks/renderizr --jq .security_and_analysis` reports `disabled` for every key. They are free on public repositories and cost nothing to leave on.

Nothing else in this repository depends on a setting. Discussions is deliberately off (`has_discussions: false`), which is what SUPPORT.md describes, and no file links to a Discussions tab on this repository.

### What is broken until the repository is public — and is expected to be

Two things in `README.md` are wrong today, on purpose, and neither is a bug to file. Both are broken by the repository being private, both fix themselves the moment it is public and this work is on `main`, and neither should be removed in the meantime — deleting them would mean shipping a README that is *permanently* missing a badge row and an install command in order to avoid looking wrong for a week.

- **Two of the three README badges render an error.** shields.io reads `api.github.com` anonymously, and on a private repository those calls 404. Measured by fetching each badge URL today:

  | Badge | Renders as |
  | --- | --- |
  | `ci` | `ci: repo or workflow not found` |
  | `node` | `node: ≥ 20` — fine, and always will be: it is a static `img.shields.io/badge/…`, so it never touches GitHub |
  | `license` | `license: repo not found` |

  The `license` badge fixes itself the moment the repository is public. The `ci` badge additionally needs `.github/workflows/ci.yml` to exist *on the default branch*, so it stays broken until this branch is merged, even after the repository is public. Expect: public + merged → both go green, with no edit to README.md.
- **`npx github:FormulaMonks/renderizr` hangs for anyone without repo access.** It is the first command in README.md, and on a machine that has never authenticated to GitHub it produces no output at all — a clean-machine smoke test had it still running, silent, at 120 seconds. The cause is not npm: `npx` shells out to `git`, and this repository is not readable anonymously. Confirm the cause without a clean machine —

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/FormulaMonks/renderizr
  ```

  404 today, 200 once it is public. Anonymous git then has nothing to authenticate with, the credential helper blocks on a prompt, and a piped `npx` never answers it — hence silence rather than an error. Nothing in this repository can improve that; it is git's prompt, not ours. Note that a maintainer *cannot* reproduce it on their own laptop: the macOS keychain helper supplies credentials and the clone simply works. Public repository → the clone succeeds for everyone and the command works as documented.

Do not "fix" either by removing it. The only correct action is to make the repository public and merge this branch, then re-check both in a browser and on a machine that has never authenticated to GitHub.

### After the first release

- [ ] **Remove `release-as` from `release-please-config.json`.** It is pinned to `0.1.0` so that the first generated release matches the version `CHANGELOG.md` already names. It is not self-clearing: left in place, *every* subsequent release would also be proposed as `0.1.0`. Delete the line in the first pull request after `v0.1.0` is tagged, in the same review where the hand-written `## [Unreleased]` section is dropped from `CHANGELOG.md`.

## Becoming a maintainer

There is no application form, no minimum commit count and no waiting period to satisfy. The bar is straightforward: **we invite people whose reviews we already trust.**

Concretely, the path that works:

1. **Land a few pull requests.** Not necessarily large ones. What is being read is whether your changes come with tests, whether you update the docs in the same PR, and whether you take review feedback as information rather than as an obstacle.
2. **Start reviewing other people's.** This matters more than the first point. A contributor who reviews is doing the actual job already; someone who only writes code is not yet. Reviewing does not require write access — anyone can comment on any PR, and a thoughtful review from a non-maintainer carries real weight here.
3. **Triage a few issues.** Reproduce a bug report, narrow it down, say what you found. That is the least glamorous and most useful thing anyone does in this repository.
4. **You will be asked.** An existing maintainer opens an issue proposing you, the current maintainers agree, and if you say yes you get write access, a row in the table above, and a place in the security advisory list. Nobody is added without being asked first.

If you want this and it has not happened, say so — open an issue or email the address at the top. Ambition stated out loud is not presumptuous; it is useful information, and with one maintainer we are more likely to be short of hands than short of candidates.

### What you take on

Write access comes with the obligations listed above, plus one that has no calendar entry: **responding**. A maintainer who is out of time is fine; a maintainer who goes silent on an open security report is not. If life gets busy, say so on the issue or move yourself to emeritus — both are entirely normal and neither is a judgement.

## Stepping down

Open a pull request moving yourself to the table below. No explanation is required, no notice period is expected, and nothing is held against anyone. If a maintainer is unreachable for six months, another maintainer may move them to emeritus and revoke write access; the row and the credit stay, and coming back is a pull request away.

## Emeritus maintainers

Nobody yet. This section exists so that the first person to step away lands somewhere with their name intact rather than being quietly deleted.
