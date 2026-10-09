# Renderizr

Renderizr turns a Structurizr workspace into a static site or a single self-contained HTML file. In edit mode it also changes the layout of the workspace's views; the author keeps writing the model, styles and documentation. This glossary fixes the words we use when we talk about how the engine draws a view and how the author edits one.

## Language

**Workspace**:
The Structurizr model, views, styles and documentation that Renderizr receives as JSON. The sole source of truth for what Renderizr draws.
_Avoid_: project, architecture file

**View**:
One diagram definition in the workspace: a selection of elements and relationships with a type, a key and either a stored layout or an automatic layout. There are nine view types.
_Avoid_: diagram (that is the drawn result), page

**Engine**:
The part of the page that draws a view: shapes, boundaries, edges, layout and animation. Renderizr draws with the React Flow engine in `src/engine/`.
_Avoid_: renderer (ambiguous with Renderizr itself), canvas library

**Diagram contract**:
The interface the toolbar, view drawer and diagrams page use to drive the engine, independent of which engine is behind it.
_Avoid_: diagram API, adapter

**Island**:
A React root mounted inside the diagram target and nowhere else. The rest of the page stays vanilla TypeScript.
_Avoid_: widget, embed

**Stored layout**:
A view whose elements carry coordinates and whose relationships may carry vertices, all set by the workspace author. The engine draws it where it says and never lays it out again.
_Avoid_: manual layout, fixed positions

**Automatic layout**:
A view with no coordinates of its own, laid out at render time according to the rank direction and separations the view specifies.
_Avoid_: auto layout, graph layout

**Calculated layout**:
A stored layout edit mode computes by laying out the whole view once, the way an automatic layout would, and stores as the view's coordinates and vertices. The view stays a stored layout.
_Avoid_: auto layout, auto-layout, automatic layout (that belongs to a view), suggested layout

**Unplaced element**:
An element in a stored layout that has no coordinates of its own, which the workspace records as the origin. The engine places it next to the elements it relates to; the rest of the view stays where it is.
_Avoid_: new element, orphan, missing position

**Boundary**:
A container drawn around elements that share a parent: a software system in a container view, a container in a component view, a group, or a deployment node. The engine draws an element as a boundary when at least one of its children is in the view, and as an ordinary element otherwise; a group is always a boundary. A boundary takes its size and position from its children, never from coordinates of its own. Boundaries nest.
_Avoid_: group (one kind of boundary), cluster, subflow

**Workspace semantics**:
Everything the workspace says about how a view should look: coordinates, tag styles, themes, shapes, routing and color schemes. The engine honors these; how it draws them is its own.
_Avoid_: pixel parity, Structurizr look

**Drill-down**:
Following an element from the view it appears in to the view that details it: a software system to its context or container view, a container or container instance to its component view.
_Avoid_: zoom in (that is the viewport), navigation (the view drawer)

**Element link**:
The `url` an element or relationship carries in the workspace. It points to a view, a documentation section or a decision in the same workspace, or outside it altogether. When an element offers several destinations (its link, drill-down views, its documentation), the reader chooses among them, with the link listed first.
_Avoid_: hyperlink, href

**Activation target**:
One destination that activating an element or relationship offers the reader, by pointer or by keyboard. An element offers its element link, its drill-down views, its image views and then its properties whose value is an `http(s)` URL, each destination once and never the view on screen; a relationship offers its element link and its `http(s)` properties. An item with no activation targets is inert.
_Avoid_: hotspot, link (one target kind)

**Target kind**:
What an activation target leads to: a view, the documentation, the decisions or a link. A link is either an element link that leads outside the workspace or an `http(s)` property, and opens in a new tab.
_Avoid_: target type, link type

**Target menu**:
The menu that lists an item's activation targets at the point of activation when the item offers more than one, each labeled by view title, "Documentation", "Decisions" or the link's host. An item with one activation target follows it straight away.
_Avoid_: context menu, dropdown

**Indicator**:
A glyph drawn on an element, a boundary's label band or an edge's label for each target kind the item offers, so a sighted reader sees where activating it leads.
_Avoid_: badge, affordance, icon (that is the element's own image)

**Relationship**:
A connection from one element to another in the workspace, with a description, technology and tags. The engine draws it in a view as an edge.
_Avoid_: link, connector, arrow

**Edge**:
The drawn form of a relationship in one view: its route, line style, arrowhead and label.
_Avoid_: line, connector, relationship (that is the workspace concept)

**Route**:
The path an edge takes from its source to its target, set by its routing mode and its vertices, or by avoidance when it has none.
_Avoid_: path, connection

**Routing mode**:
The character of a route as the workspace names it: Direct (as straight as possible), Orthogonal (horizontal and vertical segments) or Curved (smooth).
_Avoid_: router, connector type, edge type

**Vertex**:
A point stored in the workspace that a route must pass through. The workspace author routes a relationship that has vertices.
_Avoid_: waypoint, bend point, control point

**Avoidance**:
Routing an edge without vertices so it crosses no element other than its own source and target. Avoidance ignores boundaries.
_Avoid_: obstacle routing, collision avoidance

**Edge end**:
Where an edge meets the outline of its source or target. The engine spreads the edge ends of edges without vertices that share a side of an element along that side. An edge with vertices keeps each edge end right under its nearest vertex when that vertex lies straight out from a side, and otherwise where the line from the element's center toward that vertex crosses the side; those ends never spread.
_Avoid_: port, handle, anchor, connection point

**Jump-over**:
A small hop an edge draws where it crosses another edge, so the crossing does not read as a junction.
_Avoid_: hop, bridge, line jump

**Animation**:
Playing a view one step at a time. A dynamic view animates by its relationship order; a static view animates only when the workspace lists steps for it.
_Avoid_: playback, slideshow, sequence

**Step**:
One stage of an animation. In a dynamic view, every relationship sharing one order value; in a static view, one entry of the view's animation list, adding to what earlier steps revealed.
_Avoid_: frame, stage, animation step

**Edit mode**:
The local server `renderizr edit` starts, where the author changes the layout of stored-layout views in the React Flow engine and saves it into `workspace.json` using only fields Structurizr defines. Builds stay read-only.
_Avoid_: editor, layout editor, design mode

**Edited layout**:
A view's layout fields as the author has changed them in this session, laid over its stored layout until a save writes them.
_Avoid_: overlay, draft, patch

**Canvas**:
The area a view's `dimensions` set, which frames an export and which edit mode draws behind the view.
_Avoid_: paper, page, artboard

**Selection**:
The elements the author has picked to move or arrange together in edit mode. A boundary is never part of it.
_Avoid_: highlight, focus (keyboard focus is another thing)

**Reference element**:
The selected element that aligning centers measures from: the first one the author selected. Aligning edges measures from the outermost element on that side instead.
_Avoid_: anchor, key object

**Selected edge**:
The one edge the author has picked in edit mode to change its routing mode or sides. It is never part of the selection.
_Avoid_: active edge, focused edge

**Marquee**:
The box the author drags across the canvas to select the elements inside it.
_Avoid_: lasso, rubber band

**Snapping**:
Moving what the author drags onto an alignment guide or the grid when it comes close.
_Avoid_: magnet

**Alignment guide**:
The dashed line edit mode draws while a dragged element or vertex lines up with another element, vertex or edge end.
_Avoid_: smart guide, snap line

**Decision graph**:
The drawing beside the decisions menu that shows how decisions link to one another: a dot per decision, colored by its status, and a lane for each decision that later decisions link to.
_Avoid_: timeline, history graph

**Lane**:
The vertical line in the decision graph that runs from a decision up to the newest decision that links to it. A decision that supersedes or amends the lane's newest decision continues the same lane instead of opening its own, so every stretch of a lane is a real link. A second decision that supersedes or amends a decision on the lane joins it from a lane of its own, with an elbow that runs down the lane to that decision; a decision that references it joins the lane with a short elbow.
_Avoid_: branch, track
