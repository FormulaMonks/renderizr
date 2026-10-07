# 18. Let the page own edited layouts and drive a controlled engine

Date: 2026-10-06

## Status

Accepted

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): the page stays vanilla TypeScript and React types never cross the contract.

## Context

Editing has two halves. Gestures (drags, snapping, the marquee, vertex handles) need geometry on every frame and belong inside the island. History, saving, the edit toolbar, live reload and the dialog that guards unsaved changes belong to the page. React Flow supports controlled flows, where the host holds the state and the flow only reports changes. The engine computes values the author never set, such as the positions it places and the routing modes styles give, and the first save of a view needs them.

## Decision

Keep each view's edited layout and its undo and redo history in a vanilla TypeScript edit session in the page. Run the engine controlled: it draws the resolved view with the edited layout laid over it, and reports each finished gesture or command once through `onLayoutChanged({ view, before, after })`, filling `before` with the values it drew, computed ones included. The page hands the result back through `setLayout`, and a change the page doesn't hand back reverts. Keep the selection in the engine; nothing saves or undoes it. Build the edit toolbar in the page beside the read-only toolbar.

## Consequences

- History has one way in: one `onLayoutChanged` event is one undo step, and undo, redo, live reload and a reload from disk all go through `setLayout`.
- Frame-by-frame drags and snapping never cross the contract.
- The contract grows by an editing option, edited layouts at mount, `setEditing`, `setLayout`, `setWorkspace`, two events and six commands, and stays free of React types.
- The engine must report `before` for values the author never set, so the first edit can store the view as drawn.

## Alternatives considered

- The island owns history and the toolbar: React would leave the diagram target, and history would live inside a root that remounts.
- An uncontrolled engine that reports its final layout: two copies of the layout would drift, and undo would need a diff.
