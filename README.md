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

## Caveats

### Autolayout

Structurizr doesn't know how to render manual layout views if they're not defined in the workspace. For that reason, Renderizr includes a utility command which treats all manual views with auto layout:

```bash
npx --package=github:@formulamonks/renderizr -- autolayout {path/to/workspace.json}
```

> [!WARNING] Important
> Manual views that already have layout will be overwritten by this command. Be careful, as manual edits might be lost
