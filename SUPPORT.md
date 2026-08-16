# Getting help

Everything about Renderizr happens in this repository. There is no forum, no chat server and no support address to email — one place to look, one place to ask.

## Start here

Most questions are answered by something already written down:

| If you are wondering | Read |
| --- | --- |
| How do I run it? What do the flags do? | [README.md](README.md) — usage, the full flag table, `--single-file` |
| What does flag *x* do exactly? | `npx github:FormulaMonks/renderizr --help` — the authoritative list, generated from `scripts/cli.js` |
| How do I work on Renderizr itself? | [CONTRIBUTING.md](CONTRIBUTING.md) — clone, install, dev server, tests, commits, review |
| Who maintains this, and how do I join? | [MAINTAINERS.md](MAINTAINERS.md) |
| I found a vulnerability | [SECURITY.md](SECURITY.md) — **do not open a public issue** |
| How do I write the workspace itself? | [Structurizr's own documentation](https://docs.structurizr.com) — Renderizr renders workspaces, it does not define them |

Then [search the existing issues](https://github.com/FormulaMonks/renderizr/issues?q=is%3Aissue), including closed ones. Closed issues are where the answers usually are.

## Then ask

GitHub Issues is the only channel. Pick the one that fits:

| You have | Open |
| --- | --- |
| A question — "how do I…", "is it supposed to…", "why does it…" | [an issue](https://github.com/FormulaMonks/renderizr/issues/new/choose), and we will label it `question` |
| Something broken — a crash, a wrong render, output that does not match what you expected | [a bug report](https://github.com/FormulaMonks/renderizr/issues/new/choose) |
| An idea — a flag, a rendering behavior, a format Renderizr should understand | [a feature request](https://github.com/FormulaMonks/renderizr/issues/new/choose) |
| A change you have already written | [a pull request](https://github.com/FormulaMonks/renderizr/pulls), after reading [CONTRIBUTING.md](CONTRIBUTING.md) |

The issue templates ask for what we need. GitHub Discussions is deliberately not enabled: two places to ask means half the answers end up in the place you did not look.

### A question or a bug?

If you are not sure, file it as a question. It costs nothing to relabel, and a question that turns out to be a bug becomes one with no lost history. Nobody here minds.

## What makes a question answerable

The difference between a same-day answer and a week of back-and-forth is usually four lines:

1. **The exact command you ran**, flags and all.
2. **What happened** — the full error output, or a screenshot for a rendering problem. Not a paraphrase.
3. **What you expected instead.**
4. **Your Node version** (`node --version`) and your OS. Renderizr needs Node 20 or newer, and "it exits immediately" is very often Node 18 on the `PATH`.

If a specific workspace is involved, the single most useful thing you can attach is a **minimal `workspace.json` that reproduces it** — cut it down until removing one more thing makes the problem go away. If the workspace is confidential, say so and reproduce it against [the Big Bank plc example](https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json) instead:

```bash
npx github:FormulaMonks/renderizr https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json --single-file
```

If that also reproduces it, say so — it tells us the problem is in Renderizr and not in your model, which is half the investigation.

## What to expect

This is a small project maintained by people with other jobs. Realistically:

- **Questions and bug reports**: a first response within about a week.
- **Feature requests**: read within about a week, but they may sit open while we decide. An open request is not a rejected one.
- **Pull requests**: see [How a review goes](CONTRIBUTING.md#how-a-review-goes).

If something has gone quiet for two weeks, a comment on the thread is welcome and will not annoy anyone.

## What is out of scope

- **Structurizr itself** — the DSL, the workspace format, the cloud service, the modeling questions. Those belong at [structurizr/structurizr](https://github.com/structurizr/structurizr) or on the [Structurizr community forum](https://github.com/structurizr/structurizr/discussions). Renderizr renders a workspace; it does not author one.
- **Bugs in the diagram renderer.** The renderer in `vendor/structurizr` is Structurizr's own code, taken verbatim, so a diagram that renders wrong here almost certainly renders wrong in Structurizr's own viewer. Check there first — if it does, report it upstream and link the issue here so we can pull the fix through.
- **General hosting and static-site questions** — how to configure S3, GitHub Pages or your CDN. We will happily fix anything about the output that *makes* it hard to host.
