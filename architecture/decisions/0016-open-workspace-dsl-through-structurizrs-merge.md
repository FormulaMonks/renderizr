# 16. Open workspace.dsl through Structurizr's merge

Date: 2026-10-06

## Status

Accepted

References [15. Run edit mode as a local Vite server](0015-run-edit-mode-as-a-local-vite-server.md): the server runs the tools and tells the page.

Referenced by [17. Save layout the way Structurizr reads and writes it](0017-save-layout-the-way-structurizr-reads-and-writes-it.md).

## Context

Most authors write `workspace.dsl`, and the DSL has no syntax for layout, so a view's layout lives only in `workspace.json`. Renderizr never parses DSL, and builds take `workspace.json` so that `npx renderizr` needs no JDK. Structurizr's `merge` rebuilds the workspace from the DSL and copies each view's layout from a saved `workspace.json` with `DefaultLayoutMergeStrategy`, the same way Structurizr Local does. It matches elements by canonical name, then by name and type, then by description and type, then by id and type. A cold JVM runs it in about 1.3 seconds. When the DSL shifts ids and renames an element, the id fallback can hand that element another element's position. The page keys the author's unsaved edits by id, and a DSL change can shift ids.

## Decision

In a DSL session, run the author's own Structurizr tools: the `STRUCTURIZR_CLI` command when set, otherwise `structurizr-cli` on `PATH`. Run `merge -workspace workspace.dsl -layout workspace.json` on start and after every change under the DSL's folder, or `export` when no `workspace.json` exists yet, always with `-output` pointing at a temporary location. Before each run, ask every open page to save its unsaved edits and wait up to about a second, so that `merge` carries them over by canonical name.

Port no part of the merge strategy and parse no DSL. A session on a `workspace.json` runs no tools.

## Consequences

- Edit mode lays out the same files exactly as Structurizr Local does.
- Edit mode inherits the id fallback, and the docs name it as Structurizr's behavior.
- A DSL session needs Java 21 to 25 or Structurizr's Docker image, which the author installs. A layout session on `workspace.json` and every build stay free of a JVM.
- The server waits on the page before it runs the tools. Edits that miss the flush land behind a bar that offers to keep or discard them.
- Files the DSL includes from outside its folder trigger no run, as in Structurizr Local.

## Alternatives considered

- A TypeScript port of `DefaultLayoutMergeStrategy`: it could match better, for example by the `structurizr.dsl.identifier` property, but it would lay out the same files differently from Structurizr Local, and a DSL session still needs the JVM to parse the DSL.
- Rebasing unsaved edits onto the new workspace in the page: the page matches by id, which goes wrong exactly when the DSL shifts ids.
- Keeping a JVM alive between runs: a cold run is fast enough.
