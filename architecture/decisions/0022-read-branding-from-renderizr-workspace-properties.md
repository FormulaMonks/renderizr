# 22. Read branding from renderizr workspace properties

Date: 2026-10-14

## Status

Accepted

References [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md): Renderizr parses no DSL, so it never writes these properties.

References [15. Run edit mode as a local Vite server](0015-run-edit-mode-as-a-local-vite-server.md): Vite bakes branding into the page when it starts.

Referenced by [26. Render the enterprise pattern's workspaces in one site](0026-render-the-enterprise-patterns-workspaces-in-one-site.md).

## Context

Renderizr took the header logo, its alt text and link, the font and the primary color from flags alone, so every run of `renderizr` and `renderizr edit` repeated them. The DSL's `branding` block holds a logo and a font, which Structurizr exports to `views.configuration.branding`, but it has no field for the alt text, the link or a color, and the 2026 Structurizr library removed `views.configuration.branding`, so a later `structurizr-cli` may stop writing it. Workspace properties survive every export and merge, and travel with a workspace read from a URL.

## Decision

Read branding from five workspace properties: `renderizr.logo`, `renderizr.logoAlt`, `renderizr.logoHref`, `renderizr.font` and `renderizr.primaryColor`. Read them and never write them.

- Take each value from its flag, then from its property, then from the default. A flag overrides its property for that run only.
- Skip Structurizr's `branding` block: neither read it nor change it. When it sets a logo or a font that no property sets, print a notice that names the properties.
- Resolve a relative `renderizr.logo` against the workspace file, or the workspace URL.
- Check a property the way its flag is checked, and fail the build, or the start of edit mode, on an invalid value the run uses.
- Fetch fonts from Google Fonts only.
- In edit mode, apply branding at start. A reload that changes a property prints a notice to restart, and one that brings an invalid value reports it and keeps the session as it is.
- Choose branding in one function, `loadBranding` in `scripts/branding.js`, that `renderizr`, `renderizr edit` and `pnpm dev` share.

## Consequences

- An author sets branding once in `workspace.dsl`, and every later run uses it without flags, from a file or from a URL.
- A run that passes a flag the workspace doesn't match prints a ready-to-paste `properties` block, with logo paths relative to the workspace file.
- A logo or font set only in the `branding` block stops reaching the page, and the notice says so.
- A branding change in edit mode needs a restart to show.
- `--font-weights`, `--font-subsets` and `--font-italic` stay flags only. Properties for them can follow under the same `renderizr.` prefix.

## Alternatives considered

- **Read the `branding` block.** Structurizr dropped it from its library, it has no field for the alt text, the link or a color, and a DSL export turns its logo into a data URI that no longer names a file.
- **Write the flags back into the workspace.** Writing `workspace.dsl` means parsing and rewriting DSL, which [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md) rules out, and the next export or merge rebuilds `workspace.json` and keeps only its layout.
- **A `renderizr.config.json` beside the workspace.** It adds a file to learn and doesn't travel with a workspace read from a URL.
- **A package script that repeats the flags.** It works without code, but it doesn't help someone who renders a workspace from a URL or without a `package.json`.
