# 13. Scope the label toggles to element text

Date: 2026-10-04

## Status

Accepted

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): it lets Renderizr choose how a diagram reads where the workspace says nothing.

## Context

The diagram toolbar has two label toggles, descriptions and technologies, that a reader flips to declutter a diagram. They are a viewing preference: the workspace says nothing about them. Upstream Structurizr's descriptions toggle hides descriptions on elements and on edges alike, and its metadata toggle removes only the technology from an element's metadata line, leaving its type (`[Container]`). An edge's description is what says what a relationship does, so hiding it leaves arrows that explain nothing. An element's type is noise once a reader only wants names.

## Decision

Scope the descriptions toggle to elements: hide element descriptions, and always draw an edge's description (in a dynamic view, the step's `order: description`). Have the technologies toggle hide the whole metadata line under an element's name, type and technology together, on elements and on boundary bands, and hide edge technologies as before. A style's `description: false` or `metadata: false` still hides its part whatever the toggles say.

## Consequences

- With both toggles off, a diagram shows element names and what each relationship does, the smallest reading that still explains the system.
- The React Flow engine and the vendored Structurizr renderer disagree on these toggles until cutover, because the vendored renderer keeps upstream's behavior.
- A reader coming from Structurizr finds the toggles behave differently there. There is no toggle to hide edge descriptions; a relationship style's `description: false` does it per tag.

## Alternatives considered

- Follow upstream exactly. It keeps parity, but the descriptions toggle then strips the diagram of the one text that says what each relationship does.
- Add a third toggle for edge descriptions. It answers a need nobody has raised and crowds the toolbar.
