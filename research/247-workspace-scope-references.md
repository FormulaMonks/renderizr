# How Structurizr's landscape and software system scoped workspaces reference each other

A landscape scoped workspace points at each software system scoped workspace through one field: the software system's element link, `url`, set to `{workspace:N}/diagrams`, where `N` is the numeric id of the system's workspace on a Structurizr server. `generate system-landscape` writes that link, and Structurizr's diagram viewer turns it into `/workspace/N/diagrams`. Nothing points back: a software system scoped workspace carries no link to the landscape, and the workspaces share software systems only by name. Both kinds carry their kind in `configuration.scope` (`"Landscape"` or `"SoftwareSystem"`; an unscoped workspace omits the key). Renderizr today reads `{workspace:N}/…` as an outside link and opens it as a relative address that leads nowhere.

Every finding below says whether it is **verified** (run, or read in the source at the commit named below) or **inferred**.

## Sources

- Structurizr's source: `github.com/structurizr/structurizr` at `da99caf` (5 October 2026), which now holds the library, the DSL, the CLI commands and the server and local web app in one repository. Paths below are relative to its root.
- Structurizr's docs: [Workspace scope](https://docs.structurizr.com/workspaces/scope) and [Enterprise usage pattern](https://docs.structurizr.com/workspaces/enterprise).
- The Docker image `structurizr/structurizr:latest`, which reports `structurizr: 2026.09.19` and `structurizr-*: 6.2.3`. It ran every command in the example.
- Renderizr: `scripts/structurizr-schema.js` and `src/model/targets.ts` on `main`.
- [example/](247/example/) holds a system catalog, two software system scoped workspaces, the generated landscape and the landscape that extends it. [probe.mjs](247/probe.mjs) feeds each pointer form to Renderizr's `classifyLink`; [probe-output.txt](247/probe-output.txt) holds what it printed. Run it from the repo root with `node research/247/probe.mjs "$PWD/src/model/targets.ts"`.

## `configuration.scope` in workspace JSON

- **The field (verified).** `WorkspaceConfiguration.scope` is the enum `WorkspaceScope` with two values, `Landscape` and `SoftwareSystem` (`structurizr-core/…/configuration/WorkspaceScope.java`). The JSON holds `"configuration": { "scope": "Landscape" }` or `"SoftwareSystem"`. An unscoped workspace has no `scope` key; the DSL's `scope none` sets it to null. Renderizr's schema already round-trips it as `enum:WorkspaceScope` with the same two values.
- **The DSL (verified).** `configuration { scope landscape }`, `scope softwaresystem` or `scope none` (`structurizr-dsl/…/ConfigurationParser.java`).
- **What each scope allows (verified).** A landscape scoped workspace fails validation when any software system has containers or documentation (`LandscapeWorkspaceScopeValidator.java`). A software system scoped workspace fails when more than one software system has containers or documentation (`SoftwareSystemWorkspaceScopeValidator.java`). An unscoped workspace passes always. The docs add that decisions count as documentation and that a server in strict mode accepts only the two scoped kinds.
- **The server keeps it (verified).** On save, the server clears a workspace's configuration and copies back only `scope` (noted in `scripts/structurizr-schema.js`, from `WorkspaceComponentImpl.putWorkspace`).
- **Scope follows `workspace extends` (verified, run).** Extending copies the whole workspace, its `configuration` included. A team workspace that extends a landscape scoped catalog stays landscape scoped until it says `scope softwaresystem`: in the example, `2-payments` without that line fails with "Workspace is landscape scoped, but the software system named Payments has containers."

## What a landscape scoped workspace holds

- **The generator (verified).** `generate system-landscape -input <dir> -output <file>` loads every file under `<dir>` whose path matches `.*workspace.(json|dsl)` (`--include` and `--exclude` change that), sorted by file name, and hands them to `SystemLandscapeGenerator` (`structurizr-application/…/command/GenerateSystemLandscapeSubcommand.java`, `structurizr-core/…/util/SystemLandscapeGenerator.java`).
- **What the generator writes (verified, run).** A workspace named "System Landscape" with `scope: "Landscape"`, `id: 0`, no views and no documentation. It holds every person and software system from every input, merged by name, with fresh ids; every relationship between two of them, matched by name (the first per pair by default, or one per description with `--relationships all`); each element's url, tags, properties and perspectives copied from its sources. The `structurizr.dsl.identifier` property comes along with the rest.
- **The pointer (verified, run).** For each input workspace, the generator finds the first software system with containers and sets the landscape's software system of the same name to `url: "{workspace:<that workspace's id>}/diagrams"`. In the example: Orders gets `{workspace:1}/diagrams`, Payments `{workspace:2}/diagrams`. That link replaces any url the system carried before.
- **Where the id comes from (verified).** The generator reads `workspace.getId()`. A workspace that `pull` fetched from a server carries the server's id (`pull` writes `structurizr-<id>-workspace.json`). A workspace built locally from DSL carries `id: 0`, because the DSL never sets an id: run on the two local exports, the generator gives both systems `{workspace:0}/diagrams`. The pointer works only for workspaces that went through a server.
- **The views come later (verified, run).** The docs' last step extends the generated JSON (`workspace extends system-landscape.json`), adds a `systemLandscape` view and pushes the result as a new workspace. The extended workspace keeps the scope, the ids and the `{workspace:N}/diagrams` links ([example/landscape/workspace.dsl](247/example/landscape/workspace.dsl)).
- **Systems without a workspace (inferred).** A software system that only appears as a neighbor (no workspace gives it containers) gets no `{workspace:N}` link; it keeps whatever url its sources gave it.

## What a software system scoped workspace holds

- **The catalog's elements (verified, run).** `workspace extends catalog.dsl` parses the catalog first, so every person and software system in the catalog lands in each team's workspace with the catalog's `structurizr.dsl.identifier`. `!element <identifier|canonical name>` finds one of them and opens it to add containers, properties or a url (`structurizr-dsl/…/FindElementParser.java`). The team's JSON export repeats every element of the catalog, the other teams' systems included, without their containers.
- **Ids (verified, run).** Ids are per workspace. A DSL catalog parses the same way in every team's workspace, so its elements get the same ids there (Customer `1`, Orders `2`, Payments `3` in both team workspaces); the team's own elements take the next ones. Extending a JSON file keeps that file's ids. The generated landscape numbers its elements afresh. Across workspaces, only the name ties two elements together: the generator matches by name and never compares ids.
- **No pointer back (verified).** Nothing in Structurizr writes a link from a software system scoped workspace to the landscape or to another team's workspace. An author can write one by hand: `ModelItem.setUrl` accepts a URL, `{workspace}…` or `{workspace:N}…` (`structurizr-core/…/util/Url.java`, `INTER_WORKSPACE_URL_REGEX = "\{workspace:\d+\}.*"`).

## How Structurizr lets a reader move between workspaces

- **The diagram viewer (verified).** `processWorkspaceLink` in `structurizr-application/src/main/webapp/WEB-INF/jsp/diagrams.jsp` turns `{workspace}/diagrams#key` into `#key`, any other `{workspace}/…` into the current workspace's address (`/workspace/<id>/…`), and `{workspace:N}/…` into `/workspace/N/…`. Double-clicking the software system then lists the link among its other destinations, labeled with the resolved address; an Alt double-click follows it at once.
- **Documentation and decisions (verified).** `documentation.jsp` and `decisions.jsp` resolve only `{workspace}`; a `{workspace:N}` link in Markdown stays as written.
- **Local mode (verified in part).** With `structurizr.workspaces` above `1`, local mode serves one workspace per folder named by its id (`1`, or `1-orders`), and the same JSP resolves `{workspace:N}` to that folder's workspace (`LocalFileSystemMultipleWorkspaceAdapter.java`, `WorkspaceDirectory.java`). With one workspace, its id is `1`. That the docs' pattern runs on local mode is inferred: the docs describe it against a server.
- **The static site export (verified).** `export -format static` writes one workspace and its `static.html` opens a non-`#` url with `window.open(url)` as written, so `{workspace:N}/diagrams` leads nowhere there.
- **The cloud service (not checked).** Its source isn't public. Renderizr's `structurizr.com/workspace/<id>/…` handling suggests the same paths there.

## How Renderizr treats each pointer form today

Verified with the probe against a stand-in workspace that holds one view, `SystemLandscape`:

| Element link | `classifyLink` returns | What the reader gets |
| --- | --- | --- |
| `{workspace:1}/diagrams` | a link to `{workspace:1}/diagrams`, labeled the same | A new tab at a relative address that leads nowhere. |
| `{workspace:1}/diagrams#SystemLandscape` | the same kind of link | The same dead tab. |
| `{workspace}/diagrams#SystemLandscape` | the view `SystemLandscape` | The view on screen in this workspace. |
| `https://structurizr.com/workspace/1/diagrams#SystemLandscape` | the view `SystemLandscape` | This workspace's view, whatever workspace `1` is. |
| `https://structurizr.com/workspace/1/diagrams` | a link to structurizr.com | A new tab on structurizr.com. |
| `https://structurizr.example.com/workspace/1/diagrams#SystemLandscape` | a link to that host | A new tab: only `structurizr.com` and its subdomains count as Structurizr's hosts. |
| `/workspace/1/diagrams` | a link to `/workspace/1/diagrams` | A new tab at a relative address. |

- `{workspace:N}` fails the `startsWith("{workspace}")` test, then `new URL()` throws, so the link falls through to the catch-all `link` target kind with the raw text as its label.
- `classifyLink` reads the `structurizr.com` path's last segment and fragment and never the workspace id in it, so a link into another workspace lands on a view of the same key in the workspace on screen.

## The example

```text
research/247/example/
  catalog.dsl              landscape scoped: Customer, Orders, Payments
  1-orders/workspace.dsl   extends the catalog, !element orders { Orders API }, scope softwaresystem
  2-payments/workspace.dsl extends the catalog, !element payments { Payment Gateway }, scope softwaresystem
  pulled/                  the two exports with id 1 and 2, named the way pull names them
  landscape.json           generate system-landscape over the two, with ids 1 and 2 as pull would give them
  landscape/workspace.dsl  extends landscape.json and adds the SystemLandscape view
```

The commands, run from `research/247/example` (the exports land next to each `workspace.dsl`; `pulled/` holds copies of the two exports with `id` set to `1` and `2`, the way a server numbers them):

```bash
docker run --rm -v "$PWD":/w structurizr/structurizr export -w /w/1-orders/workspace.dsl -f json -o /w/1-orders
docker run --rm -v "$PWD":/w structurizr/structurizr export -w /w/2-payments/workspace.dsl -f json -o /w/2-payments
docker run --rm -v "$PWD":/w structurizr/structurizr generate system-landscape -input /w/pulled -output /w/landscape.json
docker run --rm -v "$PWD":/w structurizr/structurizr export -w /w/landscape/workspace.dsl -f json -o /w/landscape
```

The landscape's two software systems, after the last step:

```json
{ "id": "2", "name": "Orders", "url": "{workspace:1}/diagrams" }
{ "id": "3", "name": "Payments", "url": "{workspace:2}/diagrams" }
```
