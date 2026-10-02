# Renderizr

Renderizr turns a Structurizr workspace into a static site or a single self-contained HTML file. It renders a workspace; it does not define one. This glossary fixes the words used when talking about how a view gets drawn.

## Language

**Workspace**:
The Structurizr model, views, styles and documentation that Renderizr is given as JSON. The sole source of truth for what is drawn.
_Avoid_: project, architecture file

**View**:
One diagram definition in the workspace: a selection of elements and relationships with a type, a key and either a stored layout or an automatic layout. There are nine view types.
_Avoid_: diagram (that is the drawn result), page

**Engine**:
The part of the page that draws a view: shapes, boundaries, edges, layout and animation. Today the vendored Structurizr renderer; the subject of the React Flow effort.
_Avoid_: renderer (ambiguous with Renderizr itself), canvas library

**Diagram contract**:
The interface the toolbar, view drawer and diagrams page use to drive the engine, independent of which engine is behind it.
_Avoid_: diagram API, adapter

**Island**:
A React root mounted inside the diagram target and nowhere else. The rest of the page stays vanilla TypeScript.
_Avoid_: widget, embed

**Stored layout**:
A view whose elements carry coordinates and whose relationships may carry vertices, all set by the workspace author. Drawn where it says, never re-laid out.
_Avoid_: manual layout, fixed positions

**Automatic layout**:
A view with no coordinates of its own, laid out at render time according to the rank direction and separations the view specifies.
_Avoid_: auto layout, graph layout

**Unplaced element**:
An element in a stored layout that has no coordinates of its own, which the workspace records as the origin. It is placed next to the elements it relates to; the rest of the view stays where it is.
_Avoid_: new element, orphan, missing position

**Boundary**:
A container drawn around elements that share a parent: a software system in a container view, a container in a component view, a group, or a deployment node. An element is drawn as a boundary when at least one of its children is in the view, and as an ordinary element otherwise; a group is always a boundary. A boundary takes its size and position from its children, never from coordinates of its own. Boundaries nest.
_Avoid_: group (one kind of boundary), cluster, subflow

**Workspace semantics**:
Everything the workspace says about how a view should look: coordinates, tag styles, themes, shapes, routing and colour schemes. The engine honours these; how it draws them is its own.
_Avoid_: pixel parity, Structurizr look

**Drill-down**:
Following an element from the view it appears in to the view that details it: a software system to its context or container view, a container or container instance to its component view.
_Avoid_: zoom in (that is the viewport), navigation (the view drawer)

**Element link**:
The `url` an element or relationship carries in the workspace. It points to a view, a documentation section or a decision in the same workspace, or outside it altogether. When an element offers several destinations (its link, drill-down views, its documentation), the reader chooses among them, with the link listed first.
_Avoid_: hyperlink, href

**Relationship**:
A connection from one element to another in the workspace, with a description, technology and tags. It is drawn in a view as an edge.
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
A point stored in the workspace that a route must pass through. A relationship with vertices is routed by its author.
_Avoid_: waypoint, bend point, control point

**Avoidance**:
Routing an edge without vertices so it crosses no element other than its own source and target. Boundaries are never avoided.
_Avoid_: obstacle routing, collision avoidance

**Edge end**:
Where an edge meets the outline of its source or target. Edge ends that share a side of an element are spread along that side.
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
