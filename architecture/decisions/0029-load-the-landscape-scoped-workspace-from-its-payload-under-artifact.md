# 29. Load the landscape scoped workspace from its payload under --artifact

Date: 2026-11-06

## Status

Accepted

Amends [26. Render the enterprise pattern's workspaces in one site](0026-render-the-enterprise-patterns-workspaces-in-one-site.md): where the landscape scoped workspace lives under `--artifact`.

References [28. Run every page on Preact through preact/compat](0028-run-every-page-on-preact-through-preact-compat.md): it shrank the runtime that this decision lets artifacts share.

## Context

[26. Render the enterprise pattern's workspaces in one site](0026-render-the-enterprise-patterns-workspaces-in-one-site.md) put the landscape scoped workspace in the main bundle, so the page draws the view the reader lands on with no request beyond the script. Every other workspace of a set already loads from its own JSON file.

`--artifact` writes a render as a folder of files split by how often each changes, so Claude reads and sends only what changed between publishes. That only pays off when the runtime (`renderizr.js`, `renderizr-vendor.js` and `renderizr.css`) comes out byte for byte the same for every workspace at a version: then one artifact copies it from another, and Claude reads it once per version. A runtime that holds the landscape scoped workspace changes with every model change and differs between any two workspaces.

## Decision

Under `--artifact`, keep the landscape scoped workspace, or the lone workspace, out of the main bundle:

- Write it to `workspace.json`, the same payload shape every other workspace of the set uses.
- Have the page fetch `workspace.json` at startup, and `manifest.json` alongside it for the build date, before it draws the first view.
- Keep what the reader sees on first paint in the shell: the page title, the theme script and the primary color, with the font faces in `branding.css`, which the shell links. Only the logo waits for the payload.

The multi-file build and `--single-file` still compile the landscape scoped workspace in, as [26. Render the enterprise pattern's workspaces in one site](0026-render-the-enterprise-patterns-workspaces-in-one-site.md) decided.

## Consequences

- The runtime holds nothing specific to one workspace, so every artifact at a version shares it, and a model change touches only `workspace.json` and `manifest.json`.
- The reader waits one more round trip before the first view: the page asks for `workspace.json` only once its script runs. The bytes stay about the same, since the workspace moves from the script to a JSON file.
- The page can lose its data. A missing or unreadable `workspace.json` leaves the page with nothing to draw, so an artifact has to publish every file the manifest lists. A missing `manifest.json` costs only the build date.
- The page has two ways to reach the workspace it lands on, compiled in or fetched, and the tests have to cover both.
- A reader who stays on the landscape still downloads no other workspace.

## Alternatives considered

- **Compile the landscape scoped workspace in under `--artifact` too.** It keeps the first view one request sooner, but every workspace and every model change gets its own runtime, so Claude reads the whole runtime again on each publish, which `--artifact` exists to avoid.
- **Fetch the landscape scoped workspace in every build.** It gives the page one way in, but `--single-file` has no neighbor files to fetch, and the multi-file build would pay the extra round trip for nothing.
- **Write the build date into `workspace.json`.** It saves the manifest fetch, but every render would change the payload's hash, so a render with no model change would still send `workspace.json`.
