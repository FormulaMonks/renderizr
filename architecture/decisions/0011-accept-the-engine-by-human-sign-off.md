# 11. Accept the engine by human sign-off

Date: 2026-10-02

## Status

Accepted

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): pixel parity is out of reach by design.

Referenced by [12. Ship behind a flag, then cut over in one release](0012-ship-behind-a-flag-then-cut-over-in-one-release.md).

## Context

The engine draws its own pixels ([2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md)), so a screenshot baseline would only compare the engine with itself. Pixel diffs need a PNG decoder and a diff library, and they flicker across Chrome versions, font hinting and GPU flags.

## Decision

Check the engine in two parts. Fail CI on automated checks: the engine marks its DOM and, behind a build flag, writes a geometry report that the end-to-end test compares with the resolved view (same elements, boundaries and edges, elements inside their boundaries, stored positions exact, edge ends on outlines, avoidance holding, time to ready, bundle size, zero network requests). Upload a contact sheet of every view as a CI artifact, the Structurizr renderer and the React Flow engine side by side during the transition, and have a person accept each view.

## Consequences

- Cutover waits until every view in the acceptance set is accepted.
- Visual polish is judged by people, so its consistency depends on the review.

## Alternatives considered

- Automated pixel diffs with `pixelmatch`: flaky across environments, and the geometry checks already catch the costly failures.

## Reference links

- [pixelmatch](https://github.com/mapbox/pixelmatch)
