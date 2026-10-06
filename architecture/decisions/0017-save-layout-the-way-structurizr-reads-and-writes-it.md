# 17. Save layout the way Structurizr reads and writes it

Date: 2026-10-06

## Status

Accepted

References [4. Use Dagre for automatic layout](0004-use-dagre-for-automatic-layout.md): a view with every element at (0,0) gets Dagre, and its first edit stores those positions.

References [7. Avoid elements in every routing mode](0007-avoid-elements-in-every-routing-mode.md): a relationship saved without vertices keeps avoidance.

References [9. Derive boundaries from their children](0009-derive-boundaries-from-their-children.md): boundaries never get coordinates.

References [10. Place unplaced elements around a stored layout](0010-place-unplaced-elements-around-a-stored-layout.md): an element at exactly (0,0) reads as unplaced.

References [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md): each good run hands the writer a merged workspace.

## Context

A workspace has to open the same way in Structurizr and in Renderizr, so edit mode saves only the layout fields Structurizr defines: element `x` and `y`; relationship `vertices`, `routing`, `position` and `jump`; view `dimensions` and `paperSize`. Structurizr Local rewrites the whole workspace on every DSL parse and every save, through Jackson, and builds read the model from `workspace.json`. Local also writes when the author edits nothing: opening a view stores default `dimensions`, random positions and Dagre layouts. And a Local page loaded before a DSL edit can autosave later and hide that edit.

## Decision

Write `workspace.json` with one writer on the server, for every session kind. Start from the file on disk, apply only Structurizr's layout fields and the stamps Structurizr Local writes (`lastModifiedDate`, `lastModifiedAgent` as `renderizr/<version>`, `id` when missing, and `views.configuration.lastSavedView`), and print with Jackson's rules, keeping the key order the file already has. Behave like a Structurizr read followed by a Structurizr write: drop keys Structurizr doesn't define, truncate fractions, clamp `position` and drop unknown routing modes and paper sizes. In a DSL session, write each good `merge` through the same writer. Write only when the content changes. Write through a temporary file and a rename, one save at a time.

Write no layout the author didn't ask for. Opening, viewing or panning a view writes nothing. The first edit of a view stores `x` and `y` for every element in it, as drawn, so the view looks the same after a reload; an edit that lands an element on exactly (0,0) stores (5,0) instead.

Tag every save with the version of the file the page loaded, and refuse it when the file on disk has changed since.

## Consequences

- A save makes a small diff that matches Structurizr's writer byte for byte, apart from the stamps, and Structurizr opens every file edit mode writes.
- Keys Structurizr doesn't define go on the first save. A tool that adds its own keys has to add them again afterwards.
- Positions the engine placed or laid out with Dagre become stored layout only when the author edits that view. Starting edit mode on files that haven't changed writes nothing.
- A page that loaded an older file can't overwrite a DSL edit or another tab's save; it has to keep its edits against the file on disk or discard them.
- A feature that needs data Structurizr doesn't define is out of scope until Structurizr defines it.

## Alternatives considered

- Patching the fields into the file and leaving every other byte alone: a DSL session has to write the whole merged workspace anyway, and two writers would drift apart.
- Saving the page's copy of the workspace: the build has changed it.
- Writing on open, as Structurizr Local does: diffs appear for views nobody touched.
- The last save wins, as in Structurizr Local: a stale page silently undoes a DSL edit.
