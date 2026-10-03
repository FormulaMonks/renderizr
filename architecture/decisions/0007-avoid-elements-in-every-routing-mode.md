# 7. Avoid elements in every routing mode

Date: 2026-10-02

## Status

Accepted

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): it follows what the workspace means where Structurizr's default would cross elements.

Referenced by [8. Write our own router in TypeScript](0008-write-our-own-router-in-typescript.md).

## Context

Structurizr has three routing modes. Direct, the default and the mode every sample workspace uses, draws a straight line from center to center, across any element in the way. Authors fix crossings by dragging vertices in Structurizr's editor.

## Decision

Route every edge around elements other than its own source and target, in every routing mode. Draw Direct as straight as possible: straight when the line is clear, with as few bends as possible when it isn't. Route Orthogonal and Curved around elements in their own shape. Follow stored vertices exactly, with avoidance off for that relationship. Let edges cross boundaries.

## Consequences

- Most views read well without the author touching them, which removes a common reason to open Structurizr's editor.
- A Direct edge can bend where Structurizr draws it straight. This is the most visible difference from Structurizr.

## Alternatives considered

- Avoid elements in Orthogonal only: Direct is the default, so avoidance would rarely run.

## Reference links

- [Structurizr relationship styles and routing](https://docs.structurizr.com/dsl/language#relationship-style)
