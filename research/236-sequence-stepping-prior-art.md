# How other tools step through a sequence diagram

The tools that step through a sequence diagram keep the whole layout fixed and drawn, make one message the current step and leave every earlier message in place. Most give the current message a stronger stroke and color, and the most careful one (SeqShow) also tells past messages from future ones by shade and lights the current message's two participants. Activation bars, fragment borders and sequence numbers stay as drawn on every step in every tool we read: none of them steps, fades or reveals with its message. Notes split the tools: SeqShow makes each note a step of its own, and the others leave notes static or let the author place callouts. No tool steps a `par` fragment or a `create` / `destroy` participant in any special way; the two that read Mermaid source reject both. Structurizr draws a dynamic view only in its collaboration form, so it has no sequence form that could step differently; its sequence form lives only in its exporters, which write static text.

## How we looked

We read source code where it exists and documentation where it does not, in October 2026. Each finding below says which:

- **Verified in source**: we read the code that decides what a step shows.
- **Verified in docs**: the tool's own documentation says it.
- **Inferred**: neither says it outright; we reasoned from what they do say.

Sources: `structurizr/ui` at `3b2582c` (the renderer behind Structurizr Lite, on-premises and the cloud service), `structurizr/java` at `5783db7` (its exporters), SeqShow and Cinegram at their default branches, `animate-puml` 0.6.0, and the published documentation of Visual Paradigm, IcePanel, Ilograph, D2, sequencediagram.org and WebSequenceDiagrams.

## Structurizr

**Collaboration form only.** The diagram renderer (`src/js/structurizr-diagram.js`) draws a dynamic view with boxes and lines, as it draws any other view. It holds no sequence layout and no switch to one (verified in source: no `sequence` anywhere in the renderer or its pages outside the bundled libraries). A dynamic view takes a sequence form only on export: `plantuml.sequenceDiagram` for PlantUML and C4-PlantUML, `mermaid.sequenceDiagram` for Mermaid, and the WebSequenceDiagrams exporter (verified in source). Those exporters write plain text: one participant per element and one message per relationship in view order, with `-->>` for a response. The Mermaid exporter drops the order number and writes no `autonumber`, no activation and no `par`; the WebSequenceDiagrams exporter says in its own comment that it "doesn't support return messages, parallel behaviour". Nothing animates there.

**One step of a dynamic view** (verified in source, `startAnimation`, `continueAnimation`, `highlightLinesWithOrder`):

- The step is every relationship sharing one `order`, sorted by subtracting the orders as numbers. Parallel relationships that share an order show together in one step.
- The step's lines and labels draw at full opacity; every other line, arrowhead and label draws at opacity 0.2.
- The step's source and destination elements keep their colors; every other element is shaded 80% toward the background, with its icon at opacity 0.2.
- Each step recomputes this, so earlier steps fade back exactly as later ones do. Nothing accumulates.
- The label carries its order as a prefix (`2: Sends order`) on every step and outside the animation too.
- With `structurizr.zoomOnAnimation` set on the view or the view set, each step fits the viewport to the step's elements with a margin of 50, and stopping fits the whole view.
- Back and forward buttons and the `,` and `.` keys move one step; the play button advances every 2 seconds. Stepping past the last step stops the animation and restores the view.
- PNG export with animation steps writes one picture per step, then the key (verified in source, `export.jspf`).

**One step of a static view** reveals the elements and relationships listed for it, adding to what earlier steps revealed; the first step starts from an empty view. Renderizr already follows both behaviors.

## Tools that step through a sequence diagram

### SeqShow

An MIT-licensed browser app that presents a Mermaid sequence diagram one step at a time and exports the result as one HTML file. It derives the steps from the source with no extra script. Verified in source (`src/core/playback.ts`, `src/player.ts`, `src/player.css`, `src/renderer/mermaid-adapter.ts`) unless marked.

- **Step**: one message or one note. Declarations, `autonumber`, `activate`, `rect`, `box` and fragment lines never count as steps. Step 0 is an overview with nothing current.
- **The message**: its line takes the accent color at a heavier stroke, and its label takes the accent text color. A numbered badge sits just left of the message, showing the step's index.
- **Participants**: the two participants of the current message (or every participant a note spans) take an accent fill, stroke and text, and their lifelines turn accent too.
- **Activation bars**: drawn by Mermaid and left untouched on every step.
- **Notes**: each note is a step of its own and highlights the same way, with an accent fill.
- **Fragments**: borders and labels stay as drawn. The reader picks one case of each `alt` from a menu above the diagram; only the chosen case contributes steps, and the other case stays visible, muted and hatched, and the steps skip it. A `loop` body steps once.
- **Sequence numbers**: Mermaid's `autonumber` stays static. The README warns that it "can differ from the selected path's step count", because the badge counts steps on the chosen path.
- **Earlier messages**: with Focus on (the default), past messages draw in a dark slate and future ones in a lighter gray with muted text, so the reader can tell what already happened. With Focus off, every message keeps its normal color and only the current one is marked.
- **`par`, `opt`, `create`, `destroy`**: rejected as unsupported syntax (verified in docs).
- **Viewport**: the diagram keeps its natural size and scrolls inside its box. When the current step leaves the visible area, the box scrolls smoothly to center it (instantly under reduced motion). It never zooms.

### Cinegram

An open-source layer on top of Mermaid: an unchanged Mermaid diagram followed by `scenario` blocks the author writes, compiled to an HTML page. Verified in docs (its README) unless marked.

- **Step**: whatever the author puts in a `step` block. Actions in one step start together; steps run one after another. A step usually holds one or more `flow` actions, each naming a message by its participants (`msg: 2` picks among repeated messages).
- **The message**: while a flow runs, the message's line lights up and a particle with a trailing comet travels along it; its arrival pulses the receiving participant. The author can add `highlight`, `focus` (everything else recedes), `dim` and `note` callouts.
- **Activation bars, fragments**: `activate`, `loop`, `alt`, `opt` and `box` pass through to Mermaid untouched, so they stay as drawn.
- **Notes**: Mermaid's own notes stay static; `note` actions add callouts the author places.
- **Earlier messages**: the whole diagram stays drawn. The highlight lasts only while the flow's track is open, so a finished message returns to its normal look (inferred from "while its track is open the edge underneath lights up").
- **`par`, `create`, `destroy`**: not mentioned. Parallel motion comes from putting two flows in one step.
- **Viewport**: the reel view has an "auto-follow camera" that fits each step from what its flows, highlights and notes touch, with a short glide between steps. Presenter mode keeps the whole diagram.

### Visual Paradigm

A desktop modeling tool with a sequence diagram animation. Verified in docs.

- **Step**: one shape on a chosen execution path. The reader picks a path (Path1, Path2, …) through the diagram's interactions; where a combined fragment offers more than one operand, the reader chooses one.
- **The message**: a black ball travels along the path, and each shape it reaches turns purple. Colors for the ball, the visited shapes and the active shape are configurable.
- **Earlier messages**: visited shapes keep the visited color. "Dim other path" dims everything off the chosen path.
- **Activation bars, notes, sequence numbers**: not mentioned. An option shows the current shape's description at the bottom right.
- **`par`, `create`, `destroy`**: not mentioned.
- **Viewport**: not described beyond an option to jump to a path's first shape when the reader switches paths.

### IcePanel flows

Flows step through messages and processes drawn on IcePanel's own model diagrams, and export to PlantUML or Mermaid as sequence diagrams. Verified in docs.

- **Step**: one message between two objects, or one process on one object. Step titles get a number.
- **Earlier steps**: an introduction shows all steps before the first, and a conclusion shows them all after the last. The docs do not say how earlier steps look in between.
- **Parallel paths**: the flow highlights the first step of every parallel path together, then walks the first path. Alternate paths highlight the first path and let the reader switch.
- **Viewport**: not described.

### Ilograph

Sequence perspectives draw a sequence diagram from `steps` (`to`, `toAndBack`, `toAsync`, `subSequence`), and walkthroughs step through slides. Verified in docs.

- A walkthrough slide addresses resources (participants) only: `highlight` gives them an animated border and fades unrelated resources, and `select` hides unrelated ones. The docs never let a slide address one step of a sequence.
- Sub-sequences draw as colored boxes the reader can zoom into.
- Slides can make a resource full-screen; the docs describe no other camera move.

### animate-puml

A Python command that turns a PlantUML file into an animated GIF. Verified in source (`src/animate_puml/app.py`).

- The author marks every arrow between `' start` and `' end` with a light gray "disabled" style. Each picture enables one more arrow (thicker, in its normal color) and prefixes its label with its number.
- **Earlier messages** stay enabled, so the steps build up. **Future messages** stay drawn in light gray.
- It knows nothing about activation, notes, fragments, `par` or participants; it rewrites the text of the arrows it finds.

### D2

D2 builds animation from boards: a `steps` board inherits the previous step, and `--animate-interval` exports the boards as one animated SVG (verified in docs). Its sequence diagrams support spans (activation), notes and groups. The docs show no sequence diagram in steps. A sequence diagram split across steps would build up one message at a time and lay out again on every board (inferred).

## Tools that draw sequence diagrams and do not step

- **Mermaid**: draws a sequence diagram whole. Open requests ask for it: "Step-by-step displaying of the Mermaid diagrams like animation" proposes sequence diagrams first, with earlier elements grayed out at 60 to 70% opacity, and "Feature - animated diagrams" asks for a reveal by source line. Mermaid's flowchart edge animation (`animate: true`) is a continuous effect on one edge.
- **sequencediagram.org**: its presentation mode "Hides menus, button, and text editor" and nothing else (verified in docs).
- **WebSequenceDiagrams**: no stepping in its reference; a parallel block draws all its signals "at the same vertical position" (verified in docs).
- **ZenUML**: links a message in the diagram to its line in the editor; no stepping found.
- **PlantUML**: no stepping; a 2020 forum request for messages that appear one at a time, numbered, has no answer.
- **Swimlanes.io**: its site did not answer our requests, so we could not check it.

The research literature agrees that the question is worth asking: Burd, Overy and Wheetman (2002) tested animated UML sequence diagrams and found the control flow easier to follow than in a static diagram, and later work finds the benefit depends on the reader's expertise.

## Side by side

| | One step | The message | Activation bar | Notes | Fragment | Sequence number | Earlier messages | `par` | `create` / `destroy` | Viewport |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Structurizr (dynamic view) | Every relationship with one order | Full opacity, its elements in color | No sequence form | No sequence form | No sequence form | The order, prefixed to the label | Fade to 0.2 with everything else | Same order, same step | No sequence form | Fits the step with `zoomOnAnimation` |
| SeqShow | One message or one note | Accent stroke and text, numbered badge, participants lit | Static | Steps of their own | Static; reader picks an `alt` case | Static `autonumber` | Stay; past and future in two grays | Rejected | Rejected | Scrolls the step into view |
| Cinegram | What the author writes | Line lights, particle travels | Static | Static, plus callouts | Static | Static | Stay, back to normal | Two flows in one step | Not mentioned | Follows each step in reel view |
| Visual Paradigm | One shape on a chosen path | Ball travels, shape turns purple | Not mentioned | Not mentioned | Reader picks an operand | Not mentioned | Keep the visited color | Not mentioned | Not mentioned | Not described |
| IcePanel flows | One message or process | Highlighted, title numbered | No sequence form | No sequence form | No sequence form | Step number on the title | Not described | First step of each path at once, then one path | No sequence form | Not described |
| animate-puml | One more arrow | Thicker, normal color, numbered | Untouched | Untouched | Untouched | Added to the label | Stay enabled | Untouched | Untouched | Whole diagram |

## What this means for Renderizr

- **Keep the layout fixed.** Every tool that steps through a sequence diagram draws it whole and changes only color, stroke and opacity, which matches how a dynamic view fades and a static view reveals in Renderizr.
- **Highlight or reveal.** Structurizr's dynamic view highlights one step and fades the rest; animate-puml and D2 build up. SeqShow sits between them: everything stays visible, and shade tells past from future.
- **The shapes around a message.** Every tool leaves activation bars, fragment borders and sequence numbers static. Stepping them would put Renderizr ahead of the prior art, and it needs each of those shapes to belong to a message, which the `sequence` layer's `back` and `front` lists do not record today.
- **Notes as steps.** Only SeqShow makes notes steps. It reads well for a note that explains the message before it, and doubles the step count of a diagram heavy with notes.
- **`par` and `alt`.** Structurizr's model (one order, one step) puts parallel branches in one step, and IcePanel lights the first step of every branch at once. SeqShow and Visual Paradigm step only one case of an `alt`; stepping every case in source order is the simpler reading and the one a dynamic view already gives.
- **Following the step.** Structurizr fits each step when `zoomOnAnimation` asks for it; SeqShow scrolls only when the step leaves the view; Cinegram's reel view glides to each step.
