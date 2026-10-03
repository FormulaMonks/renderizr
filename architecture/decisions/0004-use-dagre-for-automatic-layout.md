# 4. Use Dagre for automatic layout

Date: 2026-10-02

## Status

Accepted

Referenced by [9. Derive boundaries from their children](0009-derive-boundaries-from-their-children.md).

Referenced by [10. Place unplaced elements around a stored layout](0010-place-unplaced-elements-around-a-stored-layout.md).

## Context

Views without coordinates need a compound layout that nests elements inside boundaries. Five options were measured on Big Bank plc's views: Dagre 1.1.8 (already a dependency, MIT, 14 KB gzipped), elkjs 0.12.0 (EPL-2.0, 432 KB gzipped), Graphviz compiled to WebAssembly (617 KB gzipped), WebCola and d3-hierarchy. Dagre lands where today's renderer lands, because today's renderer uses it.

## Decision

Use `@dagrejs/dagre` in compound mode, ported from the JointJS `DirectedGraph` adapter: map the view's rank direction and separations one to one, let Dagre place elements, then derive every boundary from its children ([9. Derive boundaries from their children](0009-derive-boundaries-from-their-children.md)). Keep relationships that end at a boundary out of the layout input. Put the library behind one function, `(compoundGraph, settings) → { boxes, edges }`.

## Consequences

- Automatic layouts keep today's look, quirks included: wide boundaries and diagonal polylines.
- Swapping the library later is a one-file change.

## Alternatives considered

- ELK: tidier, and handles relationships that end at a boundary, but it costs 1.4 times today's whole bundle, needs an EPL-2.0 notice and looks visibly different. Revisit it for a requirement Dagre can't meet.
- Graphviz in WebAssembly: matches Structurizr's CLI output, but the CSP forbids `wasm-unsafe-eval`.
- WebCola and d3-hierarchy: they can't express rank direction or route edges.

## Reference links

- [Big Bank plc workspace](https://github.com/structurizr/structurizr/blob/main/structurizr-export/src/test/resources/big-bank-plc.json)
- [Dagre](https://github.com/dagrejs/dagre)
- [MIT license](https://opensource.org/license/mit)
- [elkjs](https://github.com/kieler/elkjs)
- [EPL-2.0 license](https://www.eclipse.org/legal/epl-2.0/)
- [hpcc-js-wasm, Graphviz in WebAssembly](https://github.com/hpcc-systems/hpcc-js-wasm)
- [WebCola](https://github.com/tgdwyer/WebCola)
- [d3-hierarchy](https://github.com/d3/d3-hierarchy)
- [JointJS `DirectedGraph` layout](https://github.com/clientIO/joint/tree/master/packages/joint-layout-directed-graph)
- [MDN: `script-src` and `wasm-unsafe-eval`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)
