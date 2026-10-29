# 26. Render the enterprise pattern's workspaces in one site

Date: 2026-10-29

## Status

Accepted

Amends [16. Open workspace.dsl through Structurizr's merge](0016-open-workspace-dsl-through-structurizrs-merge.md): the consequence that every build stays free of a JVM.

References [22. Read branding from renderizr workspace properties](0022-read-branding-from-renderizr-workspace-properties.md): each workspace of a set keeps the branding its properties set.

## Context

In Structurizr's enterprise pattern, each team keeps a software system scoped workspace, and one landscape scoped workspace maps every software system. Each workspace records its scope in `configuration.scope`. Renderizr rendered exactly one workspace per run, so the landscape and the workspaces it maps became unrelated sites.

The landscape points at a software system's workspace through one element link, `{workspace:N}/diagrams`, where `N` is the workspace's id on a Structurizr server. Nothing points back, and the workspaces share software systems only by name. A workspace built from DSL without a server has id 0, so a landscape that `generate system-landscape` writes from such files says `{workspace:0}` for every software system. Teams without a server keep their workspace as DSL or JSON in their own repository, and a hand-written landscape may link straight at those raw files.

Builds took only `workspace.json`, so that `npx renderizr` needed no JDK. A set without a server is mostly DSL, and generating its landscape already runs Structurizr's tools. A site published as a Claude artifact gets its URL only once it is published, so separately built sites cannot link to one another.

## Decision

Render a set (one landscape scoped workspace and the software system scoped workspaces it maps) as one site, from one build.

- **One shell holds the whole set.** The landscape scoped workspace goes into the main bundle and is where the reader lands. Each other workspace becomes its own JSON file that the shell loads the first time the reader enters it. `--single-file` inlines every workspace. Apply a workspace's branding and page title when the reader enters it, taking each value from its flag, then the workspace's own property, then the landscape scoped workspace's property, then the default.
- **Take the set from the positionals and the links they lead to.** Every positional is a file, a URL or a folder of `*workspace.json` and `*workspace.dsl` files. Follow every software system's element link that is an absolute URL to a `workspace.json` or `workspace.dsl`, until a pass adds nothing new. Read no manifest and add nothing to the Structurizr model.
- **Let the scope pick the entry point.** The set has exactly one landscape scoped workspace, and every other workspace is software system scoped and named by the landscape. Match a `{workspace:N}` link to the workspace scoped to the software system of the same name, then to a nonzero `N` unique in the set. Fail the build on a set that breaks these rules, and warn on a `{workspace:N}` link that matches no workspace.
- **Accept `workspace.dsl` in every build.** Run the author's Structurizr tools on it, `STRUCTURIZR_CLI` or else `structurizr-cli` on `PATH`, with `export -format json`. A `workspace.json` runs no tools.
- **Record the crossings in the address as a workspace trail.** Each workspace the reader crossed into adds a path segment, the slug of the software system it is scoped to: `#/orders/payments/?view=Containers`. The landscape scoped workspace adds no segment, and the trail never repeats a workspace. A header button leads back to the previous workspace on the trail. A crossing is its own target kind, `workspace`.

## Consequences

- A reader moves between workspaces without a page load, and the browser's back and forward buttons work across them. The app code ships once, and a reader who stays on the landscape downloads no other workspace.
- Every address that works today still leads to the landscape scoped workspace, and a lone workspace whose links lead nowhere builds as before.
- One workspace may have several addresses, and a shared link carries the sharer's trail.
- Branding and the page title become data for each workspace, where they were build-time constants.
- A build with a DSL input needs Java or Structurizr's Docker image, which the author installs. A build of JSON alone stays free of a JVM.
- `structurizr-cli` resolves a followed DSL's relative `!include` and `workspace extends` against its working directory, so such a DSL fails with Structurizr's own message. A followed DSL must be self-contained or include by absolute URL, and a published `workspace.json` always works.
- Two workspaces scoped to the same software system fail the build, because they would share a slug.
- Edit mode stays one workspace at a time.

## Alternatives considered

- **One site per workspace, under the landscape's folder.** It keeps the build unchanged, but every crossing reloads the page, and sites published as artifacts cannot link to one another.
- **Name a workspace by its id or its file.** Ids are all 0 in a set built without a server, and a file name changes when a team moves the file.
- **One address per workspace, `#/?workspace=orders&…`.** It gives "back to the parent workspace" no meaning, since the landscape maps every workspace and the set is flat.
- **A manifest that lists the set.** It is a file Structurizr doesn't define.
- **Follow only the landscape's links.** It misses a generated landscape, whose links all say `{workspace:0}`, while the team workspaces still link the raw files of the catalog they extend.
- **Accept only JSON in builds.** It keeps every build free of a JVM, but it makes every team without a server export first.

## Reference links

- [Structurizr: enterprise workspaces](https://docs.structurizr.com/workspaces/enterprise)
- [Structurizr: workspace scope](https://docs.structurizr.com/workspaces/scope)
