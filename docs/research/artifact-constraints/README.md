# Harness for the artifact-constraints research

The scratch app and scripts behind [`../artifact-constraints.md`](../artifact-constraints.md). Not part of the build or the test suite; kept so the measurements can be repeated when React Flow or the escapes module changes.

To run it: copy this directory somewhere outside the repository, `npm install` (it pins `vite@7`, `react@19`, `react-dom@19`, `@xyflow/react@12`, `@vitejs/plugin-react@5`), `npx vite build`, then `node make-safe.mjs` (needs `RENDERIZR_ROOT` pointing at a checkout with its dependencies installed, because it imports `scripts/escapes.js` from there), `node serve.mjs` in one terminal and `node pw.mjs plain csp csp-no-inline-style zero hidden remount` in another (needs a `playwright` package on `PLAYWRIGHT_MODULE` and Chrome at `CHROME_PATH`).

`csp-probe.html` is the one-page artifact that reports which style and script mechanisms the Claude artifact host's CSP permits; publish it as an artifact and read the JSON it prints.
