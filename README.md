# Renderizr

Render a [Structurizr](https://structurizr.com/) Workspace as a Static Page (SPA). Useful for publishing to static site hosts like Github Pages, Netlify and others.

## Usage

```bash
npx --package=github:@formulamonks/renderizr -- build {path/to/workspace.json}
```

Where `{path/to/workspace.json}` can be either an accessible URL or a local path.

### Example

```bash
# This will render the default Structurizr example architecture
npx --package=github:@formulamonks/renderizr -- build https://raw.githubusercontent.com/structurizr/ui/main/examples/big-bank-plc.json

# Outputs to `./structurizr-output` Serve it with your favorite local static server
npx servor structurizr-output
```

---

## Local Development

### Setup

```bash
# Initialize the structurizr-ui submodule (required)
git submodule update --init --recursive

pnpm install
```

### Dev server

```bash
pnpm dev -- {path/to/workspace.json}
```

### Build locally

```bash
pnpm build -- {path/to/workspace.json}
# Outputs to ./structurizr-output/
```

> [!NOTE]
> A `mise` task `workspace-dev` is defined in `.mise.toml` and points to `scripts/render-workspace.sh`. That script is not committed — create it as a personal convenience wrapper to avoid retyping the workspace path:
>
> ```bash
> #!/bin/bash
> pnpm dev -- ./path/to/your/local-workspace.json
> ```
