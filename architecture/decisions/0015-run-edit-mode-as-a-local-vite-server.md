# 15. Run edit mode as a local Vite server

Date: 2026-10-06

## Status

Accepted

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): the editor lives inside the island and the page around it.

Referenced by [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md).

## Context

Authors want Structurizr Local's diagram editing in the React Flow engine, so the layout they arrange is the layout Renderizr draws. The published CLI has one command, the build, which writes a static site or a single file that runs from `file://` with no network. Saving a layout needs something that writes to disk, and the page can't save its own copy of the workspace: the build merges themes into styles, inlines icons and images and injects fonts before the page sees it. Vite and `src/` already ship in the package, and `scripts/` stays plain ESM with no build step so that `npx` works. Any web page the author has open can send requests to a server on localhost.

## Decision

Add a subcommand, `renderizr edit [path]`, that starts Vite's dev server through `createServer` with the same `createConfig` the build and `pnpm dev` use. Bind it to 127.0.0.1 only. Serve the whole site on the React Flow engine, with an edit-mode plugin that serves the workspace as a watched virtual module, pushes each new workspace to the page as a custom event and adds the save endpoint. Accept a save only with the session's random token in a custom header, a `Host` that names the server, an `Origin` that names the page and a JSON body.

Compile the editor behind a build-time flag that every build sets to false, so no editor code reaches built output. Keep builds read-only: a bare `renderizr <workspace>` stays the build, unchanged.

## Consequences

- Edit mode needs no prebuilt bundle and no second build pipeline; it runs the same code the build compiles.
- The island's bundle budget stays as it is, and built sites, `--single-file` included, carry no editor.
- Edit mode always runs the React Flow engine and writes no output, so it refuses `--out`, `--single-file`, `--base` and `--engine`.
- The token, `Host` and `Origin` checks keep other pages, and DNS rebinding, from writing the author's files. Reopening the editor takes the URL the terminal printed.
- The first start pays for Vite's dependency optimization.

## Alternatives considered

- An edit toggle in built sites: a static page has nowhere to write, and its workspace is the build's changed copy.
- A small Node server over a prebuilt editor bundle: `scripts/` would need a build step before `npx` could run it, and the package would carry a second bundle to keep in step with the site.
- Vite in middleware mode under a server of our own: more wiring for the same result.
