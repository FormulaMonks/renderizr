# 8. Write our own router in TypeScript

Date: 2026-10-02

## Status

Accepted

References [7. Avoid elements in every routing mode](0007-avoid-elements-in-every-routing-mode.md): avoidance is what the router has to deliver.

## Context

Avoiding elements ([7. Avoid elements in every routing mode](0007-avoid-elements-in-every-routing-mode.md)) needs an obstacle-avoiding router. libavoid, the usual choice, ships as WebAssembly, which needs `wasm-unsafe-eval` in the CSP. Renderizr's output allows `eval` in no form, and a web worker would need `worker-src`.

## Decision

Write the router in plain TypeScript: side choice, edge-end spreading, routing, label placement and jump-overs as pure functions over the view. Run it in full, synchronously, on the main thread, with no time budget. Treat a view that is too slow to route as a view to split.

## Consequences

- The router is ours to test and tune, and the layout editor can rerun it when something is dragged.
- A large-view fixture (300 elements, ready within 5 s) guards its speed. If it slows down, cache routes, render only visible elements, then add a grid index for the avoidance checks.

## Alternatives considered

- libavoid: the CSP rules out its WebAssembly build.

## Reference links

- [libavoid](https://www.adaptagrams.org/documentation/libavoid.html)
- [MDN: `script-src` and `wasm-unsafe-eval`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
- [MDN: `worker-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src)
