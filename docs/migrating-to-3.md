# Migrating to Renderizr 3

## What changed

Renderizr 3 needs Node 22.12 or newer. On an older Node it stops before it builds anything, with one line that names the floor and the Node that ran:

```text
Renderizr needs Node 22.12 or newer; this is v20.19.0.
```

## Who it affects

Anyone who runs Renderizr on Node 20, Node 21 or a Node 22 release before 22.12. That holds however you run it: with `npx`, from a global install or in a CI pipeline.

## What to do

Upgrade Node to 22.12 or newer, then check the version that runs:

```bash
node --version
```

`npx` uses the first Node on your `PATH`, so run the check in the shell or pipeline that runs Renderizr.

If you pin Node with [mise](https://mise.jdx.dev), change the `node` line in `.mise.toml` or `mise.toml`:

```toml
[tools]
node = "24"
```

If you pin Node with nvm, fnm or an `.nvmrc`, change the version in `.nvmrc`:

```text
24
```

If you render in GitHub Actions with `actions/setup-node`, change `node-version`:

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: "24"
```

Any version from 22.12 up works in each of these.
