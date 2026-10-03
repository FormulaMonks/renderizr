# 5. Port the workspace model and style resolution

Date: 2026-10-02

## Status

Accepted

References [2. Draw diagrams from workspace semantics](0002-draw-diagrams-from-workspace-semantics.md): owning the rendering is why nothing vendored remains.

## Context

The vendored renderer brings its own workspace model (finders, tag collection, view titles) and style resolution (tag cascade, themes, light and dark variants, defaults) in `structurizr-workspace.js` and `structurizr-ui.js`, under Apache-2.0. Keeping them would keep the sloppy-mode globals, the `virtual:structurizr-renderer` plugin and the vendor sync alive for a fraction of their purpose. The style cascade is about 300 lines, specified by upstream's `findElementStyle` and `findRelationshipStyle`.

## Decision

Port both to typed modules under `src/model/`. Add `resolveView` there, so every view type, filtered views included, reaches the engine as a concrete view. Remove everything vendored at cutover.

## Consequences

- The port derives from Apache-2.0 code. Give each ported file an Apache-2.0 header that names its upstream files and states it was modified, and list Structurizr in the third-party notices as "portions derived from".
- Upstream style changes arrive by deliberate porting.
- Once `vendor/` is gone, this is hard to reverse.

## Reference links

- [`structurizr-workspace.js`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/resources/static/static/js/structurizr-workspace.js)
- [`structurizr-ui.js`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/resources/static/static/js/structurizr-ui.js)
- [Apache-2.0 license](https://www.apache.org/licenses/LICENSE-2.0)
