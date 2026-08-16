# Vendored Structurizr assets

Do not edit these files. They are copied verbatim from
[structurizr/structurizr](https://github.com/structurizr/structurizr) by
`scripts/sync-vendor.js`, which takes exactly the files the build imports and
nothing else.

Upstream commit: `9ff16634c3b8574584262ae8545510bbb1d1b4bd`
Upstream path: `structurizr-application/src/main/resources/static/static`
License: Apache 2.0, reproduced in `LICENSE`. The icons under
`bootstrap-icons/` are [Bootstrap Icons](https://icons.getbootstrap.com), MIT.

They are committed rather than pulled from the submodule at build time because
neither npm nor pnpm fetches submodules for a git dependency, so
`npx --package=github:FormulaMonks/renderizr` would otherwise have nothing to
render with.

## Refreshing

```bash
git submodule update --init --remote submodules/structurizr
pnpm sync:vendor
```
