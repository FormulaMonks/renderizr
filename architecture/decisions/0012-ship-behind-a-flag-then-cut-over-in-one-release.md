# 12. Ship behind a flag, then cut over in one release

Date: 2026-10-02

## Status

Amended

Amended by [20. Commit the Structurizr test workspaces in place of the submodule](0020-commit-the-structurizr-test-workspaces-in-place-of-the-submodule.md).

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): diagrams look different, so the cutover is a major version.

References [11. Accept the engine by human sign-off](0011-accept-the-engine-by-human-sign-off.md): sign-off is the cutover gate.

## Context

The React Flow engine has to be built and judged against the vendored Structurizr renderer before it replaces it. Bundling both engines into every page as a runtime fallback would double the diagram code in every artifact and keep the vendor sync alive.

## Decision

Select the engine at build time with `--engine react-flow` while the React Flow engine is in development, so each output carries exactly one engine. Once every acceptance view is signed off ([11. Accept the engine by human sign-off](0011-accept-the-engine-by-human-sign-off.md)), cut over in one release: make the React Flow engine the default, remove the flag, delete the vendored renderer, JointJS and jQuery, and update the README and notices. Release it as 2.0.0, a major version.

## Consequences

- Readers who want the Structurizr renderer pin a 1.x release.
- 2.0.0 signals that diagrams look different while the CLI stays the same.
- Keep the Structurizr submodule for the acceptance fixtures only.

## Reference links

- [JointJS](https://github.com/clientIO/joint)
- [jQuery](https://github.com/jquery/jquery)
- [Semantic Versioning](https://semver.org/)
