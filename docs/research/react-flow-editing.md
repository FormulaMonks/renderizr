# What React Flow 12 offers an editor of stored layouts

React Flow carries the gestures of edit mode, and Renderizr builds everything that touches its own geometry. Dragging, click and modifier-click selection, the marquee, grid snapping, auto-pan, toolbars and change events that say when a drag ends come with `@xyflow/react`. Renderizr writes the layout state that feeds `buildGraph`, boundary drags, alignment guides, vertex editing, label dragging, the choice of an edge end's side, align and distribute, and undo and redo. React Flow Pro examples cover alignment guides, vertex editing and undo, and their code can't ship in Renderizr.

This page answers from `@xyflow/react` 12.12.0 and `@xyflow/system` 0.0.83, the versions `pnpm-lock.yaml` resolves for the `^12.12.0` range in `package.json`; from their installed source and types and the xyflow repository at the `@xyflow/react@12.12.0` release ([source][rf-source]); from reactflow.dev and xyflow.com as published in October 2026; and from the vendored Structurizr renderer (`vendor/structurizr`), which carries Structurizr's own editing code. Renderizr paths and line numbers point at commit `93a2743`.

## Capability matrix

The second column says where a capability comes from. **Built in**: a prop, component or hook does it. **Free example**: an MIT example on reactflow.dev shows it. **Pro example**: only React Flow Pro subscribers get the example's code. **Build ourselves**: React Flow offers events at most, and Renderizr writes the behavior.

| Capability | Source | React Flow API | Fit with derived boundaries and the router |
| --- | --- | --- | --- |
| Drag an element | Built in | `nodesDraggable`, node `draggable`, `onNodesChange` (`position` changes carry `dragging`), `onNodeDragStart`, `onNodeDrag`, `onNodeDragStop` | React Flow only reports the change in a controlled flow. The island writes the position into its layout state and reruns `buildGraph`, which derives boundaries, routes and labels again. `nodeOrigin={[0, 0]}` matches Structurizr's top-left `x` and `y`. |
| Drag a selection | Built in | Every selected draggable node moves with the dragged one; `onSelectionDragStart`, `onSelectionDrag`, `onSelectionDragStop` | Same path. React Flow moves no vertices. Structurizr moves the vertices of relationships between the selected elements too (`vendor/structurizr/js/structurizr-diagram.js:639-652`); do the same in the island. |
| Drag a boundary to move its children | Build ourselves | `parentId` moves children with a parent; `expandParent` grows a parent and never shrinks it; `dragHandle` limits where a drag starts | Stored parent sizes and `expandParent` contradict [ADR 9][adr9]. Keep boundaries as flat nodes and turn a boundary's `position` change into the same offset on its descendant elements. |
| Drag threshold | Built in | `nodeDragThreshold` (default 1 screen pixel), `nodeClickDistance` (0), `paneClickDistance` (1) | A larger threshold keeps the click that selects an element from moving it. |
| Auto-pan near the canvas edge | Built in | `autoPanOnNodeDrag` (default on), `autoPanSpeed` (15), `autoPanOnSelection` | Pans within 40 screen pixels of the edge. The pan reaches `onMoveStart` without an event, so the island's record of the reader moving the viewport misses it. |
| Drag beside pan on drag | Built in | Draggable nodes take the `nopan` class; `panOnDrag`; `panActivationKeyCode` (Space) | Works with the island's `panOnDrag`. A draggable boundary needs `style.pointerEvents: 'none'` so its empty area keeps panning. |
| Click to select | Built in | `elementsSelectable`, node and edge `selectable` and `selected`, `onSelectionChange`, `useOnSelectionChange` | Selection is the island's state in a controlled flow. The island's activation handlers stop click propagation, which hides the click from React Flow. |
| Modifier-click | Built in | `multiSelectionKeyCode` (Meta on macOS, Control elsewhere) | Shares its default keys with the island's `zoomActivationKeyCode`: one acts on clicks, the other on the wheel. |
| Marquee | Built in | `selectionKeyCode` (Shift), `selectionOnDrag` (only while `panOnDrag` is not `true`), `selectionMode` (`SelectionMode.Full`, `SelectionMode.Partial`) | Replaces the selection and adds every selectable edge that touches a selected node. Boundaries stay out with `selectable: false`. The free [Lasso Selection][ex-lasso] example draws a freehand marquee. |
| Arrow-key nudges | Built in, at odds with the island | Arrow keys move the focused, selected node or the marquee's selection by 5 units (20 with Shift, one grid step under `snapToGrid`); needs `nodesFocusable` and `disableKeyboardA11y={false}` | Matches Structurizr's 5-unit nudge, but gives every node a Tab stop and fights the island's arrow-key pan and Tab walk. |
| Snap elements to a grid | Built in | `snapToGrid`, `snapGrid`; `Background` with `gap` draws the grid | Snaps the top-left corner; a selection snaps its first node and keeps the others' offsets. An element snapped onto (0, 0) reads as unplaced to the engine. |
| Snap vertices to a grid | Build ourselves | `screenToFlowPosition(point, { snapToGrid, snapGrid })` | Vertices are edge data, which React Flow never drags. |
| Alignment guides | Pro example ([Helper Lines][pro-helper]) | `onNodesChange` or `experimental_useOnNodesChangeMiddleware` to adjust the position, `ViewportPortal` to draw | Compare the dragged element with the element boxes in the graph, move the position onto a guide, draw the guides in flow coordinates. |
| Add, drag and remove vertices | Pro example ([Editable Edge][pro-editable]) | Custom edge (`edgeTypes`, `BaseEdge`), `onEdgeDoubleClick`, `screenToFlowPosition`, the `nopan` class | Grab targets inside `RouteEdge`; each move reruns the router, which is pure. Any vertex turns avoidance off for its relationship ([ADR 7][adr7]). |
| Routing mode and jump-over | Build ourselves | `EdgeToolbar` (since 12.9.0) hosts the controls | Writes `routing` and `jump`, which `buildGraph` already reads. |
| Drag an edge label | Build ourselves | `EdgeLabelRenderer` (HTML; no pointer events until `pointerEvents: 'all'` and `nopan`) | Project the pointer onto the route to get `position`, a percentage. The geometry has `pointAlong` and no inverse yet. |
| Choose the side of an edge end | Build ourselves | `onReconnect` and `onReconnectEnd` (free [Reconnect Edge][ex-reconnect] example) need a `Handle` to drop on | Draw a grab target at the routed edge end, find the side the pointer ends beside and write a vertex just outside it. The router already reads sides from the first and last vertex. |
| Align and distribute a selection | Build ourselves | `NodeToolbar` with the selected node ids and `isVisible` hosts the commands | Arithmetic over element boxes; React Flow has no align or distribute API. |
| Undo and redo | Pro example ([Undo and Redo][pro-undo]) | No API; a `position` change with `dragging: false`, `onNodeDragStop` and `onSelectionDragStop` mark where a gesture ends; `useKeyPress` | Snapshot the view's layout fields once per finished gesture, as Structurizr's undo stack does. |
| Large views while dragging | Build ourselves, from free guidance | `React.memo` on custom nodes and edges, node objects kept between renders, `onlyRenderVisibleElements` | Each `buildGraph` run makes fresh objects for every node and edge. `onlyRenderVisibleElements` culls an edge by the box around its two nodes, which hides routes that leave that box. |
| Keep the model read-only | Built in | `deleteKeyCode={null}`, `nodesConnectable={false}`, no `onConnect` | Edit mode changes layout only. |

## Dragging

Edit mode needs React Flow's controlled mode, where the island owns every position. In uncontrolled mode (`defaultNodes`) React Flow applies changes itself and moves nodes without deriving boundaries, routes or labels again ([adding interactivity][guide-interactivity]).

In a controlled flow `triggerNodeChanges` applies nothing and only calls `onNodesChange` ([store][rf-store]). A drag keeps its own copies of the dragged nodes, computes each frame from the pointer and reports `position` changes with `dragging: true` ([`XYDrag`][rf-xydrag-frame]), then reports once more with `dragging: false` on release ([`XYDrag`][rf-xydrag-end]). The node moves on screen only when the island passes the moved position back in `nodes`.

The island derives `nodes` from `buildGraph(model, viewKey, scheme, labels, measure)` (`src/engine/react-flow/island.tsx:1357-1360`), and `buildGraph` reads positions only from the `WorkspaceModel` that `mountEngine` builds once (`src/engine/react-flow/index.ts:48`). Edit mode adds a layout state beside the model (element positions, and vertices, routing mode, jump-over and label position per relationship) that `buildGraph` applies before it lays out the view. Keep it outside React, as `IslandStore` keeps the view key and the label toggles (`src/engine/react-flow/island.tsx:128-147`), so the engine can save it and undo it. A stored layout makes `positionElements` move nothing (`src/engine/react-flow/graph.ts:991-992`), so an edited position flows straight into boundaries, routes and labels.

`experimental_useOnNodesChangeMiddleware`, added in 12.10.0 ([changelog][rf-changelog]), rewrites changes before React Flow hands them to `onNodesChange` ([store][rf-store-middleware]). An MIT example in the xyflow repository clamps `position` changes with it ([Middlewares example][rf-middleware-example]). In a controlled flow `onNodesChange` can make the same edits, so edit mode needs the middleware only to keep that logic apart, and the `experimental_` prefix warns that it may change.

### Boundaries

React Flow nests a node under another with `parentId`: the child's position is relative to its parent, children move when the parent moves, and the parent's size comes from its own `style` ([parent and child nodes][guide-parent-child]). `extent: 'parent'` keeps a child inside its parent, and `expandParent` grows the parent when a child crosses its border and never shrinks it, since it keeps the larger of the two sizes ([`handleExpandParent`][rf-expand-parent]). Both treat the parent's box as stored state. [ADR 9][adr9] derives every boundary from its children and ignores stored coordinates, so keep boundaries as flat nodes, as `toBoundaryNodes` draws them (`src/engine/react-flow/island.tsx:1265-1278`), and rerun `buildGraph` after every move.

Structurizr's editor moves a boundary's contents with it, along with the vertices of relationships inside (`vendor/structurizr/js/structurizr-diagram.js:634-637`, `4154-4169`). To do the same:

- Make the boundary node draggable with its label band as the `dragHandle`.
- Set `style.pointerEvents: 'none'` on the boundary node. React Flow gives a draggable or selectable node `pointer-events: all` and spreads `node.style` after it ([`NodeWrapper`][rf-nodewrapper-style]), so without the override the empty boundary area takes every pan and marquee. `BoundaryElement` already lets only the band take events (`src/engine/react-flow/island.tsx:777`, `812`).
- Turn the boundary's `position` change into the same offset on each descendant element and on the vertices between them, and drop the boundary's own change, because `buildGraph` derives it again. Skip descendants that are in the drag already: React Flow drags every selected node and leaves out only the children of a selected parent, which needs `parentId` ([`getDragItems`][rf-drag-items]).

### Threshold, auto-pan and panning

- `nodeDragThreshold` defaults to 1 and measures screen pixels, so it behaves the same at every zoom ([`XYDrag`][rf-threshold]). `nodeClickDistance` (default 0) and `paneClickDistance` (default 1) set how far a click may travel ([API reference][api-props]).
- `autoPanOnNodeDrag` (default on) pans while the pointer stays within 40 screen pixels of the canvas edge, at `autoPanSpeed` (default 15) ([`XYDrag`][rf-autopan], [`calcAutoPan`][rf-calcautopan]). React Flow pans through `panBy`, which reaches `onMoveStart` with no event ([pan and zoom handler][rf-panzoom-start]). The island counts only moves with an event as the reader's (`src/engine/react-flow/island.tsx:1715-1719`), so a container resize after an auto-pan refits the view. Count every edit as a move in edit mode.
- React Flow adds the `nopan` class to every draggable node ([`NodeWrapper`][rf-nodewrapper-nopan]): a drag on an element moves it, a drag on empty canvas pans, and the island's `panOnDrag` (`src/engine/react-flow/island.tsx:1705`) stays as it is.

## Selection

Click, modifier-click and the marquee come built in; the island holds the selection and turns activation off while editing.

- A click selects. With `multiSelectionKeyCode` held (Meta on macOS, Control elsewhere), a click adds or removes ([API reference][api-props]). The island's activation handlers stop propagation (`useTargetProps`, `src/engine/react-flow/island.tsx:320-326`, and the edge's hit stroke, `src/engine/react-flow/island.tsx:968-979`), so on an item with activation targets React Flow's click handler on the node never runs.
- The `select` changes in `onNodesChange` and `onEdgesChange` carry the selection. React Flow builds its internal node again whenever the object passed in changes ([`adoptUserNodes`][rf-adopt]), so a node derived without `selected: true` loses its selection. The island keeps a selection set and sets `selected` on the nodes and edges it derives; React Flow's performance guide also recommends keeping selected nodes in a separate field ([performance][guide-performance]).
- A marquee starts on a drag with `selectionKeyCode` (Shift) held, or on a plain drag of the empty canvas with `selectionOnDrag`. `selectionOnDrag` takes effect only while `panOnDrag` is not `true` ([`FlowRenderer`][rf-flowrenderer]). The docs pair it with `panOnDrag={false}` and `panOnScroll` for design-tool controls ([the viewport][guide-viewport]), and an MIT example in the xyflow repository uses `panOnDrag={[1, 2]}` so the middle and right buttons still pan ([Figma example][rf-figma-example]). Space held pans on drag in either setup. With the island's `panOnDrag` as it is, the marquee needs Shift.
- `SelectionMode.Full` (default) selects nodes wholly inside the marquee, and `SelectionMode.Partial` also selects nodes it touches. The marquee skips nodes with `selectable: false` ([`getNodesInside`][rf-nodes-inside]), clears the selection when it starts ([`Pane`][rf-pane-reset]) and adds every selectable edge that touches a selected node ([`Pane`][rf-pane-edges]). Renderizr builds an additive marquee if the spec wants one.
- After a marquee React Flow draws a rectangle around the selection that takes the pointer inside its bounds and drags the selection as one ([`NodesSelection`][rf-nodesselection]).

### Arrow-key nudges

React Flow moves the selection 5 units per arrow key press, 20 with Shift, and one grid step under `snapToGrid` ([`useMoveSelectedNodes`][rf-keyboard], [`NodeWrapper`][rf-nodewrapper-keys], [`NodesSelection`][rf-nodesselection]). Structurizr nudges by the same 5 units, its grid size, and moves the vertices between the selected elements too (`vendor/structurizr/js/structurizr-diagram.js:5`, `6137-6167`, `6474-6498`). React Flow's keys act on a focused, selected node or on the marquee's rectangle, and only with `disableKeyboardA11y={false}`; `nodesFocusable` gives every node a Tab stop ([`NodeWrapper`][rf-nodewrapper-tab], [accessibility][guide-a11y]).

The island owns the keys instead (`src/engine/react-flow/island.tsx:1703-1704`). Its arrow keys pan the canvas without checking whether something used the key first (`src/engine/react-flow/island.tsx:1626-1637`), Tab walks the items with activation targets (`src/engine/react-flow/island.tsx:1581-1602`), and Enter and Space activate (`src/engine/react-flow/island.tsx:1614-1624`). React Flow's keyboard handling would pan and nudge on one key press and give up the canvas's single Tab stop. Keep `disableKeyboardA11y`, and let the island's key handler nudge the selection in edit mode by writing positions, and the vertices between the selected elements, into the layout state.

## Snapping

Grid snapping for elements comes built in; vertex snapping and alignment guides are Renderizr's to write.

- `snapToGrid` with `snapGrid` rounds a node's position, its top-left corner under `nodeOrigin={[0, 0]}`, to multiples of the grid ([`snapPosition`][rf-snap]). Since 12.8.3 a dragged selection snaps its first node and moves the rest by the same offset, so their relative positions hold ([`calculateSnapOffset`][rf-snap-offset], [changelog][rf-changelog]). The arrow-key step becomes one grid step. `Background` with `gap` set to the grid draws it ([`Background`][api-background]).
- The engine treats an element at (0, 0) as unplaced and places it around the stored layout (`src/model/resolve-view.ts:165-172`, [ADR 10][adr10]), and (0, 0) is a grid point. Never save an element at the origin.
- Vertices are edge data, and React Flow never snaps them. `screenToFlowPosition(point, { snapToGrid: true, snapGrid })` turns a pointer position into a snapped flow position in one call ([`ReactFlowInstance`][api-instance]).
- Alignment guides are the Pro example [Helper Lines][pro-helper]. Its page describes guides that appear while a node moves and pull it into line with other nodes. Build them from Renderizr's own boxes: while a `position` change has `dragging: true`, compare the dragged element's sides and center with the other elements' boxes in the graph, move the position onto any guide within a few pixels, and draw the guides with `ViewportPortal`, which renders in flow coordinates ([`ViewportPortal`][api-viewportportal]). React Flow computes every drag frame from the pointer ([`XYDrag`][rf-xydrag-frame]), so a snapped position never accumulates.

## Edges

React Flow hosts the edge and its label; Renderizr writes every edge gesture.

### Vertices

The Pro example [Editable Edge][pro-editable] shows an edge whose route the user reshapes by dragging points along it. React Flow supplies the parts: a custom edge receives its `data` and draws any SVG path data through `BaseEdge` ([custom edges][guide-custom-edges]), `onEdgeClick` and `onEdgeDoubleClick` report clicks ([API reference][api-props]), and `screenToFlowPosition` turns pointer positions into flow coordinates. Build vertex editing into `RouteEdge` (`src/engine/react-flow/island.tsx:939`): draw a grab target per vertex with the `nopan` class and pointer events on, capture the pointer, write the vertex into the layout state, and let `buildGraph` route again. The router is pure and reruns in full on every call (`src/engine/geometry/routing/route-view.ts:13-14`, [ADR 8][adr8]). Any vertex turns avoidance off for its relationship (`src/engine/geometry/routing/route-view.ts:65`, [ADR 7][adr7]), so the first vertex an author adds sends the whole route through the vertices.

### Edge labels

`EdgeLabelRenderer` renders HTML above the edges, and a label takes no pointer events until it sets `pointerEvents: 'all'` and the `nopan` class ([`EdgeLabelRenderer`][api-edgelabelrenderer]). The island's label takes pointer events only when its edge has activation targets (`src/engine/react-flow/island.tsx:1022-1026`). Dragging a label means projecting the pointer onto the edge's route and saving the result as `position`, a percentage of the route's length. The geometry places a label with `pointAlong(route, position / 100)` (`src/engine/geometry/edge-label.ts:237-238`, `src/engine/geometry/routing/path.ts:205`) and has no inverse; the projection is a small pure function beside it.

### Toolbars

- `NodeToolbar` renders beside a node, unscaled by zoom, and shows only while its node is the one selected node. Pass an array of node ids with `isVisible` to attach one toolbar to a selection's bounds ([`NodeToolbar`][rf-nodetoolbar], [docs][api-nodetoolbar]). It suits align and distribute.
- `EdgeToolbar`, added in 12.9.0, renders beside a custom edge at a point the edge gives, unscaled, while the selection holds the edge ([`EdgeToolbar`][rf-edgetoolbar], [docs][api-edgetoolbar], [changelog][rf-changelog]). It suits routing mode, jump-over and removing vertices. Free examples show both ([Node Toolbar][ex-nodetoolbar], [Edge Toolbar][ex-edgetoolbar]).

### Choosing the side of an edge end

`onReconnect` fires when the user drops an edge end onto a `Handle` and hands back a `Connection` naming the node and the `Handle` it landed on; `onReconnectEnd` reports the final state, including that `Handle`'s side ([`FinalConnectionState`][rf-connection-types], [Reconnect Edge][ex-reconnect]). It fits edit mode poorly:

- React Flow places its grab targets where it computes the edge's ends from `Handle` positions ([`EdgeUpdateAnchors`][rf-anchors]). Each element carries one hidden `Handle` at the middle of its top side (`src/engine/react-flow/island.tsx:661-667`, `1299-1308`), so the targets would sit there, away from the edge ends the router draws.
- A side choice would need four `Handle` components per element, and a drop on another element would retarget the relationship, which edit mode never does.
- React Flow draws its own preview while the end moves (`connectionLineComponent` replaces it).

Build the gesture into `RouteEdge` instead. Draw a grab target at each routed edge end (`EdgeLine.source` and `EdgeLine.target`), and on release write a vertex just outside the side the pointer ends beside: the first vertex for the source end, the last for the target end. The router already turns those vertices into sides with `facingSide` (`src/engine/geometry/routing/route-view.ts:145-149`), and `facingSide` returns a side for any point just outside it within its span (`src/engine/geometry/routing/sides.ts:136-144`). That vertex also turns avoidance off for the relationship, as any vertex does.

## Undo and redo

React Flow 12.12.0 exports no undo or redo API ([exports][rf-index]). The Pro example [Undo and Redo][pro-undo] keeps a history of node and edge snapshots, takes one before changes such as a drag, a deletion or a connection, and binds Ctrl+Z and Ctrl+Shift+Z.

Renderizr's layout state holds everything edit mode can change, so a snapshot of one view's layout state makes a complete undo entry. Structurizr's editor works the same way: it records the element positions and vertices a gesture is about to change, pushes them onto an undo stack once the gesture changes something, and pops them on undo, with no redo (`vendor/structurizr/js/structurizr-diagram.js:6590-6628`, `6816-6834`). Take one snapshot per finished gesture: the `position` change with `dragging: false` that ends a drag (or `onNodeDragStop` and `onSelectionDragStop`), a nudge, a command, and the release of a vertex, a label or an edge end. `useKeyPress` reads shortcuts such as `Meta+z` ([`useKeyPress`][api-usekeypress]), and the island's key handler lets Meta and Control combinations through (`src/engine/react-flow/island.tsx:1606`), so either can take them. Redo costs one more stack.

## Large views while dragging

React Flow's performance guide asks for memoized custom nodes and edges (`React.memo`, or components declared outside the parent), no reads of the whole nodes array inside components, and simple styles ([performance][guide-performance]). React Flow reuses its internal node only while the node object passed in stays the same object ([`adoptUserNodes`][rf-adopt]).

Two facts set the work for the dragging prototype:

- Each `buildGraph` run makes fresh objects for every node and edge (`toNodes` and `toEdges`, `src/engine/react-flow/island.tsx:1265-1329`), so every drag frame renders every element, boundary and edge again. Keep the objects of unchanged items between frames, and wrap `BoxElement`, `BoundaryElement` and `RouteEdge` (`src/engine/react-flow/island.tsx:644`, `759`, `939`) in `memo`. `nodeTypes` and `edgeTypes` already sit at module level (`src/engine/react-flow/island.tsx:1248-1254`).
- A dragged node moves only once the island passes the moved position back, so each frame waits for `buildGraph`, the full router included. This research did not time that on the 300-element fixture; the dragging prototype times it. If it lags, move the dragged element at once, route only the edges that touch it during the drag, and route the whole view on release.

`onlyRenderVisibleElements` (default off) renders only the nodes that overlap the viewport and the edges whose two nodes' bounding box overlaps it ([`useVisibleNodeIds`][rf-visible-nodes], [`isEdgeVisible`][rf-edge-visible]); the API reference notes that it adds overhead of its own ([API reference][api-props]). A Renderizr route can leave that box (vertices, avoidance detours, a self-relationship's loop), and the label leaves with its edge, so the prop hides edges that are partly on screen. [ADR 8][adr8] names rendering only visible elements as a way to keep large views fast. Doing it right takes the graph's own route and label bounds, and React Flow draws an edge only while both its nodes are in `nodes` ([`EdgeWrapper`][rf-edgewrapper]), so a cull in the island keeps both ends of every visible edge.

## Licensing

Pro example code can't ship in Renderizr; code from free examples can, with its MIT notice.

The Pro examples that bear on edit mode are Helper Lines, Editable Edge, Undo and Redo, Selection Grouping, Parent Child Relation and Edge Routing, out of 16 in React Flow's catalog ([Pro examples][pro-list], [all examples][ex-list]). Their pages offer the code under the xyflow Pro License, version 1.0, last updated August 31, 2026 ([xyflow Pro License][pro-license]). It lets a subscriber use, modify and integrate the Pro content and distribute applications built with it. It forbids redistributing the content as standalone examples or templates, and no clause in it covers publishing the content's source.

Renderizr is MIT-licensed, its whole source is public on GitHub, and `npx github:FormulaMonks/renderizr` installs it from there. Code derived from a Pro example would sit in public source under terms that let anyone copy and redistribute it as it is. Write alignment guides, vertex editing and undo from React Flow's public API docs and Renderizr's own geometry, without porting Pro code. The free examples on reactflow.dev and the examples in the xyflow repository are MIT ([xyflow license][rf-license]); code adapted from them brings its MIT notice into `THIRD-PARTY-NOTICES.md`.

The attribution is a separate policy question that edit mode leaves as it is. The island hides React Flow's corner link with `proOptions={{ hideAttribution: true }}` (`src/engine/react-flow/island.tsx:1255`). The MIT license asks for the copyright and permission notice in copies of the software and says nothing about that link. xyflow asks more: "we ask you to subscribe if you want to remove the attribution" ([remove attribution][guide-attribution]). React Flow's development build logs a warning when an app hides the link ([`Attribution`][rf-attribution], [`handleAttributionWarning`][rf-attribution-warning]), so an edit server that serves a development build shows it in the author's console.

## What the island changes

1. **`<ReactFlow>` props** (`src/engine/react-flow/island.tsx:1691-1720`): turn on `nodesDraggable` (`1698`) and `elementsSelectable` (`1702`); keep `nodesConnectable={false}` (`1699`), `nodesFocusable={false}` (`1700`) and `disableKeyboardA11y` (`1704`); add `onNodesChange`, `onEdgesChange`, `onNodeDragStop`, `onSelectionDragStop`, `snapToGrid`, `snapGrid`, `selectionMode` and `deleteKeyCode={null}`. For a marquee on plain drags, add `selectionOnDrag` and change `panOnDrag` (`1705`) to `[1, 2]`.
2. **Node and edge flags** (`src/engine/react-flow/island.tsx:1265-1329`): set `draggable`, `selectable` and `selected` per node and edge. Give boundaries `style.pointerEvents: 'none'`, and a `dragHandle` on the band if they drag.
3. **Layout state** (`src/engine/react-flow/island.tsx:1357-1360`, `src/engine/react-flow/index.ts:48`): an overlay of element positions, vertices, routing mode, jump-over and label position that `buildGraph` applies, held outside React like `IslandStore` (`src/engine/react-flow/island.tsx:128-147`).
4. **Activation** (`src/engine/react-flow/island.tsx:302-328`, `968-979`): off in edit mode, so clicks reach React Flow's selection.
5. **Keys** (`src/engine/react-flow/island.tsx:1604-1643`): arrow keys nudge the selection in edit mode, and the undo and redo shortcuts join them.
6. **Edge labels** (`src/engine/react-flow/island.tsx:1001-1078`): pointer events, the `nopan` class and a drag that writes `position`.
7. **Grab targets** in `RouteEdge` (`src/engine/react-flow/island.tsx:939`): one per vertex and one per edge end.
8. **Memoization** (`src/engine/react-flow/island.tsx:644`, `759`, `939`, `1265-1329`): `memo` on the custom components, and node and edge objects kept for unchanged items.
9. **Viewport** (`src/engine/react-flow/island.tsx:1398`, `1715-1719`): an edit counts as the reader moving the view, so a resize keeps the author's viewport.
10. **Diagram contract** (`src/engine/contract.ts:71-96`): the `Engine` type has no editable flag, layout input or layout-changed event; edit mode adds them, so the page can save and undo.

## ADR notes

Nothing here contradicts an ADR. Four meet edit mode:

- [ADR 9][adr9]: React Flow's parent sizing and `expandParent` would store a boundary's box, so edit mode keeps boundaries flat and derived.
- [ADR 7][adr7]: any vertex turns avoidance off, so choosing an edge end's side by writing a vertex also stops avoidance for that relationship. The spec should say so.
- [ADR 8][adr8]: React Flow's `onlyRenderVisibleElements` culls edges by their two nodes' box, so rendering only visible elements needs the graph's own route bounds.
- [ADR 10][adr10]: an element saved at (0, 0) becomes unplaced, so snapping must avoid the origin.

## Sources

React Flow docs: [`ReactFlow` props][api-props], [`ReactFlowInstance`][api-instance], [adding interactivity][guide-interactivity], [the viewport][guide-viewport], [parent and child nodes][guide-parent-child], [accessibility][guide-a11y], [performance][guide-performance], [custom edges][guide-custom-edges], [`EdgeLabelRenderer`][api-edgelabelrenderer], [`ViewportPortal`][api-viewportportal], [`NodeToolbar`][api-nodetoolbar], [`EdgeToolbar`][api-edgetoolbar], [`Background`][api-background], [`useKeyPress`][api-usekeypress], [remove attribution][guide-attribution].

React Flow examples: [all examples][ex-list], [Pro examples][pro-list], [Helper Lines][pro-helper], [Editable Edge][pro-editable], [Undo and Redo][pro-undo], [Reconnect Edge][ex-reconnect], [Lasso Selection][ex-lasso], [Node Toolbar][ex-nodetoolbar], [Edge Toolbar][ex-edgetoolbar]; license: [xyflow Pro License][pro-license].

xyflow source at the `@xyflow/react@12.12.0` release: [store][rf-store], [`XYDrag`][rf-xydrag-frame], [`getDragItems`][rf-drag-items], [`calculateSnapOffset`][rf-snap-offset], [`snapPosition`][rf-snap], [`calcAutoPan`][rf-calcautopan], [`useMoveSelectedNodes`][rf-keyboard], [`NodeWrapper`][rf-nodewrapper-keys], [`NodesSelection`][rf-nodesselection], [`FlowRenderer`][rf-flowrenderer], [`Pane`][rf-pane-edges], [`getNodesInside`][rf-nodes-inside], [`isEdgeVisible`][rf-edge-visible], [`adoptUserNodes`][rf-adopt], [`handleExpandParent`][rf-expand-parent], [`EdgeUpdateAnchors`][rf-anchors], [`EdgeWrapper`][rf-edgewrapper], [`NodeToolbar`][rf-nodetoolbar], [`EdgeToolbar`][rf-edgetoolbar], [`Attribution`][rf-attribution], [`handleAttributionWarning`][rf-attribution-warning], [exports][rf-index], [changelog][rf-changelog], [Middlewares example][rf-middleware-example], [Figma example][rf-figma-example], [license][rf-license].

Renderizr: [ADR 7][adr7], [ADR 8][adr8], [ADR 9][adr9], [ADR 10][adr10], and the files cited above at commit `93a2743`.

[adr7]: ../../architecture/decisions/0007-avoid-elements-in-every-routing-mode.md
[adr8]: ../../architecture/decisions/0008-write-our-own-router-in-typescript.md
[adr9]: ../../architecture/decisions/0009-derive-boundaries-from-their-children.md
[adr10]: ../../architecture/decisions/0010-place-unplaced-elements-around-a-stored-layout.md
[api-props]: https://reactflow.dev/api-reference/react-flow
[api-instance]: https://reactflow.dev/api-reference/types/react-flow-instance
[api-edgelabelrenderer]: https://reactflow.dev/api-reference/components/edge-label-renderer
[api-viewportportal]: https://reactflow.dev/api-reference/components/viewport-portal
[api-nodetoolbar]: https://reactflow.dev/api-reference/components/node-toolbar
[api-edgetoolbar]: https://reactflow.dev/api-reference/components/edge-toolbar
[api-background]: https://reactflow.dev/api-reference/components/background
[api-usekeypress]: https://reactflow.dev/api-reference/hooks/use-key-press
[guide-interactivity]: https://reactflow.dev/learn/concepts/adding-interactivity
[guide-viewport]: https://reactflow.dev/learn/concepts/the-viewport
[guide-parent-child]: https://reactflow.dev/learn/layouting/sub-flows
[guide-a11y]: https://reactflow.dev/learn/advanced-use/accessibility
[guide-performance]: https://reactflow.dev/learn/advanced-use/performance
[guide-custom-edges]: https://reactflow.dev/learn/customization/custom-edges
[guide-attribution]: https://reactflow.dev/learn/troubleshooting/remove-attribution
[ex-list]: https://reactflow.dev/examples
[ex-reconnect]: https://reactflow.dev/examples/edges/reconnect-edge
[ex-lasso]: https://reactflow.dev/examples/whiteboard/lasso-selection
[ex-nodetoolbar]: https://reactflow.dev/examples/nodes/node-toolbar
[ex-edgetoolbar]: https://reactflow.dev/examples/edges/edge-toolbar
[pro-list]: https://reactflow.dev/pro/examples
[pro-helper]: https://reactflow.dev/examples/interaction/helper-lines
[pro-editable]: https://reactflow.dev/examples/edges/editable-edge
[pro-undo]: https://reactflow.dev/examples/interaction/undo-redo
[pro-license]: https://xyflow.com/pro-license
[rf-source]: https://github.com/xyflow/xyflow/tree/3d35b57317576b0916c0bfeaaedd573aaacc2839
[rf-license]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/LICENSE
[rf-changelog]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/CHANGELOG.md
[rf-index]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/index.ts
[rf-store]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/store/index.ts#L265-L280
[rf-store-middleware]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/store/index.ts#L259-L263
[rf-xydrag-frame]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xydrag/XYDrag.ts#L158-L214
[rf-xydrag-end]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xydrag/XYDrag.ts#L376-L399
[rf-threshold]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xydrag/XYDrag.ts#L346-L355
[rf-autopan]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xydrag/XYDrag.ts#L237-L256
[rf-drag-items]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xydrag/utils.ts#L35-L48
[rf-snap-offset]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xydrag/utils.ts#L126-L150
[rf-snap]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/general.ts#L161-L166
[rf-calcautopan]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/general.ts#L67-L77
[rf-panzoom-start]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/xypanzoom/eventhandler.ts#L182-L184
[rf-keyboard]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/hooks/useMoveSelectedNodes.ts#L25-L33
[rf-nodewrapper-keys]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/NodeWrapper/index.tsx#L142-L158
[rf-nodewrapper-nopan]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/NodeWrapper/index.tsx#L191
[rf-nodewrapper-style]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/NodeWrapper/index.tsx#L206-L208
[rf-nodewrapper-tab]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/NodeWrapper/index.tsx#L220
[rf-nodesselection]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/NodesSelection/index.tsx#L54-L95
[rf-flowrenderer]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/container/FlowRenderer/index.tsx#L81-L99
[rf-pane-edges]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/container/Pane/index.tsx#L222-L240
[rf-pane-reset]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/container/Pane/index.tsx#L298-L306
[rf-nodes-inside]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/graph.ts#L264-L290
[rf-edge-visible]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/edges/general.ts#L69-L88
[rf-visible-nodes]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/hooks/useVisibleNodeIds.ts#L8-L14
[rf-adopt]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/store.ts#L129-L150
[rf-expand-parent]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/store.ts#L313-L350
[rf-anchors]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/EdgeWrapper/EdgeUpdateAnchors.tsx#L73-L135
[rf-edgewrapper]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/EdgeWrapper/index.tsx#L72-L120
[rf-connection-types]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/types/general.ts#L329-L369
[rf-nodetoolbar]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/additional-components/NodeToolbar/NodeToolbar.tsx#L108-L112
[rf-edgetoolbar]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/additional-components/EdgeToolbar/EdgeToolbar.tsx#L50
[rf-attribution]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/react/src/components/Attribution/index.tsx#L20-L31
[rf-attribution-warning]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/packages/system/src/utils/attribution.ts#L5-L20
[rf-middleware-example]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/examples/react/src/examples/Middlewares/RestrictExtent.tsx
[rf-figma-example]: https://github.com/xyflow/xyflow/blob/3d35b57317576b0916c0bfeaaedd573aaacc2839/examples/react/src/examples/Figma/index.tsx
