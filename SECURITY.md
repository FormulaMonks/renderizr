# Security Policy

## Supported versions

Renderizr is distributed from this git repository, not from a package registry. Consumers run:

```bash
npx github:FormulaMonks/renderizr <workspace.json>
```

which resolves to the default branch. That makes `main` the shipping surface, and it is the only version that receives fixes.

| Version | Supported |
| --- | --- |
| `main` | Yes — fixes land here and reach users on their next `npx` run |
| Tagged releases | The most recent tag only, once tagging begins |
| Any older tag, or a pinned commit | No — update to `main` |

There are no tagged releases yet. When there are, this table stands: we patch the newest release and `main`, and we do not backport.

## Reporting a vulnerability

**Do not open a public issue, a pull request, or a discussion for a security problem.**

Report it privately through GitHub Security Advisories:

**<https://github.com/FormulaMonks/renderizr/security/advisories/new>**

That form is private between you and the maintainers, it gives us a place to draft and test a fix out of sight, and it credits you on the published advisory when we ship it.

**If that link gives you a 404, use email instead** — the advisory form only appears once private vulnerability reporting has been switched on for the repository, and until it has, the link is simply not there for you. Either way, email works: **andres.zorro@monks.com**, with `renderizr security` in the subject line. A report that arrives by email is treated exactly the same as one that arrives through the form, on the same timeline below.

### What to include

The more of this you have, the faster the fix:

- What an attacker can do, and what they need in order to do it.
- A minimal reproduction — ideally a small `workspace.json` (or the smallest fragment of one) plus the exact command line you ran.
- The Renderizr commit, your Node version, and your OS.
- Whether the impact lands on the machine running the build, or on someone later viewing the rendered output.

### What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement that a human has read it | 3 business days |
| Initial assessment — confirmed or not, and a rough severity | 10 business days |
| Fix on `main` for a confirmed high-severity issue | 30 days |
| Published advisory and credit | With the fix, unless you ask us to hold it |

This is a small project maintained by a small number of people. If a target slips, we will say so on the advisory thread rather than leave you guessing. Please give us 90 days before disclosing publicly; if we go quiet on you for more than 30 days, treat that as the clock running out and disclose.

We have no bug bounty. We do have genuine gratitude, and a credit line on the advisory.

## Scope

Renderizr is a build tool. You point it at a workspace — a local file or a URL — and it reads that workspace, fetches whatever the workspace and your flags refer to, and writes an HTML page. Both the input and the fetch targets are things *the person running the command* supplies. That shapes what counts as a vulnerability.

### In scope

- **Code execution or file access on the build machine** triggered by a workspace's *content* — anything in a `workspace.json` that makes `scripts/` execute code, read files outside the workspace, or write files outside `--out`.
- **Path traversal** through `--out`, `--base`, `--logo`, or any workspace-supplied filename that escapes the intended output directory.
- **Escaping the artifact-safety pass** — `scripts/escapes.js` exists to guarantee the emitted bundle contains no escape sequence a Claude artifact upload rejects, and to fail the build loudly rather than emit one. A construction that slips a rejected sequence through *silently* is a bug we want to hear about.
- **Broken isolation in `--single-file` output.** The whole promise of `--single-file` is a document with zero network requests. An input that causes the emitted HTML to reach for the network at view time defeats that promise and is in scope.
- **Fetching a host nobody asked for** — a workspace whose theme, icon or branding URL causes a request to a host that is not derivable from the workspace or the flags, or that leaks local credentials or file contents to a remote host.
- **Supply chain**: a compromised or tampered dependency in `pnpm-lock.yaml`, or vendored code in `vendor/structurizr` that does not match its upstream source.

### Out of scope

- **Rendering untrusted workspace documentation.** Structurizr documentation is Markdown with inline HTML, and Renderizr renders it with `html: true` (`src/components/markdown-renderer.ts`) because that is what the format specifies and what the official Structurizr renderer does. A workspace can therefore put arbitrary HTML — and therefore arbitrary script — into the page it produces. **Treat a `workspace.json` the way you would treat a script: rendering one you did not write runs its author's code in the browser of everyone you hand the output to.** This is a documented property of the input format, not a defect we can fix without breaking the format. Reports that a hand-crafted workspace can inject script into its own output will be closed as out of scope.
- **Renderizr fetching the URL you gave it.** Passing a URL as the workspace, or as `--logo`, or a font family as `--font`, makes a network request to that URL. That is the documented behaviour of those flags.
- **Anything reachable only by an attacker who can already run commands on the build machine**, edit the repository, or modify the workspace you were going to render anyway.
- **Vulnerabilities in Structurizr itself.** `vendor/structurizr` is upstream code. Report those to [structurizr/structurizr](https://github.com/structurizr/structurizr/security) and tell us the advisory number so we can pull the fix through `pnpm sync:vendor`.
- **Dependency advisories with no path to exploitation here** — a CVE in a transitive package whose affected code the build never reaches. Send them anyway if you are unsure; we would rather triage a false positive than miss a real one. Routine dependency bumps are handled by Renovate (`renovate.json`) and do not need a security report.
- **Reports generated by a scanner with no analysis attached.** We will read them, but they go to the back of the queue.

## Hardening notes for people running Renderizr

- Render workspaces you trust, or render untrusted ones and treat the resulting HTML as untrusted too — do not host it on an origin that holds anything worth stealing.
- `--single-file` output is intentionally self-contained: once built, it makes no network requests, so it is safe to open from `file://` or inside a sandboxed frame. That property is worth checking if you are handling a workspace from outside your organisation.
- The build itself needs network access only for what your workspace and flags reference. Building from a fully local workspace with no `--font`, no remote `--logo` and no themed elements needs no network at all.
