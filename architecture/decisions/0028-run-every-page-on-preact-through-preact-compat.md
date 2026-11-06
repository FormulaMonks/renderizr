# 28. Run every page on Preact through preact/compat

Date: 2026-11-06

## Status

Accepted

Referenced by [29. Load the landscape scoped workspace from its payload under --artifact](0029-load-the-landscape-scoped-workspace-from-its-payload-under-artifact.md).

References [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md): the island and React Flow stay as it decided.

## Context

React and React DOM make up the largest share of the page Renderizr ships, more than React Flow and d3 together. Every render carries them, and a Claude artifact makes Claude read all of it before each publish, so their weight costs on every render whatever the workspace holds.

The page uses React in one place: the island in `src/engine/react-flow/`, which mounts React Flow behind the engine contract. Preact's `preact/compat` layer implements the React API that React Flow and the island call (hooks, `memo`, `forwardRef`, portals, `useSyncExternalStore` and `createRoot`) for a small fraction of React's size.

React Flow does not officially support Preact. A `--single-file` render of the Big Bank plc example on `preact/compat` drew the Container view with the same elements and edges, a matching screenshot and a clean console, so the risk sits in edit mode, which leans hardest on React Flow's drag, selection and store.

Preact schedules effects differently from React. React runs the effects of an update from an external store, such as the island's store, as soon as it commits that update. Preact runs every effect after the next frame. React Flow takes its nodes and edges in an effect, so on Preact's default timing a step, a scheme change or a discarded edit reached the canvas a frame after the page changed it.

## Decision

Run every page Renderizr ships on Preact:

- Depend on `preact` in place of `react` and `react-dom`. Keep `@types/react` and `@types/react-dom` for the island's JSX until `preact/compat`'s types cover it.
- Alias `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime` and `react/jsx-dev-runtime` to `preact/compat` in `createConfig` (`scripts/config.js`), the one config the dev server, edit mode, the multi-file build and `--single-file` share. Anchor each alias to the whole specifier, so `@xyflow/react` keeps its own package.
- Resolve `preact` from the package root (Vite's `dedupe`), since pnpm gives React Flow no `preact` of its own and the page needs exactly one copy.
- Keep writing the island against the React API, as [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md) decided. React Flow stays the engine behind the diagram contract.
- Run Preact's effects right after each commit (`options.requestAnimationFrame` set to `queueMicrotask` in `src/engine/react-flow/index.ts`), so the canvas follows the page in the same turn, as it did on React.

## Consequences

- The default `--single-file` render loses about a fifth of its size, and about a fifth of its gzipped size. The single-file budget test holds the size measured after the swap.
- The dev server, edit mode and every build run the same library, so a difference between Preact and React cannot hide in one of them.
- React Flow runs on a library its maintainers do not test against. A React Flow update can break edit mode or reading in ways React would not show. The end-to-end, acceptance and edit-mode browser tests are the guard, and any React Flow update has to pass them on Preact.
- Effects run before the browser paints. An effect that needs a painted frame has to ask for one itself.
- `react` still installs as React Flow's peer dependency. No build resolves it, and a test proves no build ships it.
- Moving back to React means dropping the aliases and the effect timing, and adding the two packages back. The island needs no change.

## Alternatives considered

- Keeping React: it leaves the largest share of the page in every render and every artifact Claude publishes.
- Drawing read-only views without React Flow, from the SVG the export builds ([21. Build exports from the view's geometry as a pure SVG](0021-build-exports-from-the-views-geometry-as-a-pure-svg.md)): it takes more off the page, and it contradicts [3. Mount React Flow as an island behind the engine contract](0003-mount-react-flow-as-an-island-behind-the-engine-contract.md) by giving reading and editing two renderers.
- Compiling the island's JSX straight to Preact (`jsxImportSource: "preact"`) with no aliases: React Flow imports `react` and `react-dom` itself, so the page needs the aliases anyway, and one mechanism for both keeps the island's code unchanged.
- Leaving Preact's effect timing alone and waiting for the canvas in the tests: a reader in reduced motion saw a step land a frame late, and every test that reads the canvas after a page change would need its own wait.

## Reference links

- [Preact](https://preactjs.com/)
- [React Flow](https://reactflow.dev/)
