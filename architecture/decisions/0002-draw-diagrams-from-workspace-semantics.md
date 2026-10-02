# 2. Draw diagrams from workspace semantics

Date: 2026-10-02

## Status

Accepted

Referenced by [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md).

Referenced by [5. Port the workspace model and style resolution](0005-port-the-workspace-model-and-style-resolution.md).

Referenced by [7. Avoid elements in every routing mode](0007-avoid-elements-in-every-routing-mode.md).

Referenced by [9. Derive boundaries from their children](0009-derive-boundaries-from-their-children.md).

Referenced by [11. Accept the engine by human sign-off](0011-accept-the-engine-by-human-sign-off.md).

Referenced by [12. Ship behind a flag, then cut over in one release](0012-ship-behind-a-flag-then-cut-over-in-one-release.md).

## Context

Renderizr has drawn diagrams with Structurizr's own browser renderer, vendored from a submodule, and the README promises they look exactly as they do in Structurizr. That renderer is about 8,000 lines of sloppy-mode JavaScript on JointJS and jQuery, injected as a classic script. Owning the rendering gives typed, testable code, ends the vendor sync, and allows better diagrams: HTML labels, real text wrapping, embedded fonts and accessibility.

## Decision

Draw every diagram with Renderizr's own engine. Honour everything the workspace says: stored coordinates, tag styles, themes, shapes, routing and colour schemes. Choose the pixels ourselves. Where Structurizr's behaviour is an accident of its implementation (dynamic orders sorted by string subtraction, opacity faked by blending colours, small image views scaled up), follow what the workspace means.

## Consequences

- Diagrams read the way they do in Structurizr and look different in the details, so the README's promise changes at cutover.
- Acceptance compares what is drawn with the workspace and is signed off by eye ([11. Accept the engine by human sign-off](0011-accept-the-engine-by-human-sign-off.md)).
- Readers will notice the change, which is why cutover is a major version ([12. Ship behind a flag, then cut over in one release](0012-ship-behind-a-flag-then-cut-over-in-one-release.md)).

## Alternatives considered

- Keep vendoring and patch the renderer: every fix becomes a fork of upstream code we can't type or test.

## Reference links

- [Structurizr renderer source](https://github.com/structurizr/structurizr)
- [JointJS](https://github.com/clientIO/joint)
- [jQuery](https://github.com/jquery/jquery)
