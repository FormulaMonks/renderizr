# Edit mode

`pnpm render edit <path>` (`renderizr edit` for a user) serves a local page where the author arranges the layout of stored-layout views (selecting, moving, aligning, distributing, routing edges, sizing the canvas, calculating a layout) and saves only Structurizr's own layout fields into `workspace.json`, 5 seconds after the last change or at once on Cmd/Ctrl+S.

## Sub-features

- `edit-enter` turns a view into the editing route (`mode=edit`) from the pencil, and refuses it for an automatic layout.
- `edit-select` selects with a click, adds with Shift-click, and selects with a marquee.
- `edit-arrange` aligns and distributes the selection, and moves it with a drag or the arrow keys.
- `edit-edge` selects an edge, cycles its routing mode and adds or removes vertices.
- `edit-save` saves into `workspace.json` and shows the save state in the toolbar.
- `edit-history` undoes and redoes every change.
- `edit-leave` closes with **Save and close**, or puts every view back with **Discard changes and close**.

## How to get to it (user POV)

- Run `pnpm render edit <workspace.json|workspace.dsl|folder>` and open the URL it prints.
- On a stored-layout view, choose the pencil (`Edit the layout`), or open `#/?page=diagrams&view=<key>&mode=edit`.
- Use the edit toolbar, the keys (`?` lists them) or the pointer on the canvas.

## Driving it with drive.mjs

Preconditions:

- `$S/launch.sh $RUN edit architecture/workspace.json` (a copy in `$RUN/edit/`), and `$S/doctor.sh $RUN` exits 0.
- On `Container-001`, element `5` (Command-Line Interface) sits at x 540 and element `1` (Structurizr Tools) at x 200.

- **Whole recipe.** Run `node $S/drive.mjs $RUN .claude/skills/verify-renderizr/steps/edit-align.json --name edit-align-`. It selects `5` then Shift-clicks `1`, asserts two `.react-flow__node.selected`, chooses `Align left`, waits until both left edges match, reads `.save-status` as `unsaved`, presses Cmd+S, waits for `saved`, and shoots before and after.
- **Side effect.** Compare the copy with the original: `node -e 'const w=require(process.argv[1]); console.log(w.views.containerViews.find(v=>v.key==="Container-001").elements.find(e=>e.id==="5"))' "$PWD/$RUN/edit/workspace.json" > $RUN/evidence/edit-align-saved.txt` shows x 200, and `views.configuration.lastSavedView` reads `Container-001`. `architecture/workspace.json` is unchanged (`$S/doctor.sh $RUN`).
- **Pencil entry.** `{ "open": "{{edit}}#/?page=diagrams&view=Container-001" }`, `{ "ready": true }`, `{ "clickLabel": "Edit the layout" }`, then assert `location.hash.includes('mode=edit')` and that `button[aria-label="Save and close"]` exists.
- **Automatic layout refused.** On `view=Renderizr`, assert `button.edit-view[aria-disabled="true"]` and that its `title` names `autoLayout`.
- **Selected edge.** `{ "key": "Escape" }` to clear, then click a point on `.react-flow__edge[data-id="26"] path` (an `eval` with `getPointAtLength` gives one); assert `[data-selected-edge]` appears and the routing mode button (`.routing-mode`) is no longer hidden.
- **Undo.** After the align, `{ "clickLabel": "Undo" }` and assert the left edges differ again.
- **Discard.** `{ "clickLabel": "Discard changes and close" }` puts every view back, saves and leaves `mode=edit`; the copy on disk matches what it held when editing began.

## Gotchas

- Edit mode writes the file it opened; drive only the copy `launch.sh edit` made.
- The URL carries a session token (`?token=`); a page opened without it can read but every save is refused.
- Saves wait 5 seconds after the last change; press Cmd+S (`"mods": ["Meta"]`) to save now, then wait for `.save-status[data-state="saved"]`.
- Align measures edges from the outermost selected element on that side, and centers from the first one selected (the reference element).
- Elements 1 and 2 on `Container-001` already share a top edge, so aligning their tops changes nothing.
- A DSL session needs Structurizr's tools (`STRUCTURIZR_CLI` or `structurizr-cli` on the `PATH`, Java 21–25); without them, opening a `workspace.dsl` falls back to the JSON beside it, or stops.
- A save also reaches every open page as a `workspace` event; `scripts/edit.test.js` has a flaky test about counting those (issue #156).
