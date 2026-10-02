# 3. Mount React Flow as an island behind the engine contract

Date: 2026-10-02

## Status

Accepted

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): it decided to own the rendering.

Referenced by [6. Fill the viewport with the diagrams page](0006-fill-the-viewport-with-the-diagrams-page.md).

## Context

The engine needs pan, zoom, fit, nested nodes and edges. React Flow (`@xyflow/react`, MIT) provides the viewport, parent-relative nesting, arrow markers and a node and edge store; shapes, boundaries, edge paths and labels are custom work with any library. The rest of Renderizr (router, view drawer, toolbar, documentation and decision pages) is vanilla TypeScript, and the output must work as a single file from `file://` under a strict CSP. A prototype and an audit confirmed React Flow makes no network requests, injects no styles at runtime and survives the artifact build unchanged.

## Decision

Mount the engine as a React island: one React root inside the diagram target, reached only through `mountEngine` and the `Engine` handle. Keep React types inside the island. Let the page set state and issue commands, and leave navigation to the page. Write all geometry (boundaries, shapes, routing, labels, placement) as plain TypeScript over numbers, and use React Flow to render the result.

## Consequences

- React 19 and React Flow add about 132 KB gzipped; removing JointJS, jQuery and the vendored renderer saves about 230 KB.
- The rest of the app stays vanilla TypeScript.
- Create one root per page visit and unmount it before the router replaces the page.
- Replacing React Flow later means rewriting the island while the geometry and the page stay as they are.

## Reference links

- [React Flow](https://reactflow.dev/)
- [MIT licence](https://opensource.org/license/mit)
- [React](https://react.dev/)
- [JointJS](https://github.com/clientIO/joint)
- [jQuery](https://github.com/jquery/jquery)
