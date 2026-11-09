# How Structurizr presents element-scoped documentation and decisions

Research for [#308](https://github.com/FormulaMonks/renderizr/issues/308), part of map [#37](https://github.com/FormulaMonks/renderizr/issues/37). This file reports what Structurizr does; it decides nothing for Renderizr.

## Sources

Structurizr ships one web UI in several products. The archived [structurizr/ui](https://github.com/structurizr/ui) repo says it "contains the UI code used in the Structurizr cloud service", on-premises and Lite. The current consolidated app, [structurizr/structurizr](https://github.com/structurizr/structurizr) (the server and "local" tooling that replace Lite and on-premises), carries the same pages with the same logic. Everything below comes from reading that source, unless a line says otherwise:

- Model: [`Documentation.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-core/src/main/java/com/structurizr/documentation/Documentation.java), [`Section.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-core/src/main/java/com/structurizr/documentation/Section.java), [`Decision.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-core/src/main/java/com/structurizr/documentation/Decision.java).
- DSL: [`StructurizrDslParser.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-dsl/src/main/java/com/structurizr/dsl/StructurizrDslParser.java) (the `!docs` and `!adrs` branches), [`DocumentationDslContext.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-dsl/src/main/java/com/structurizr/dsl/DocumentationDslContext.java), [`DefaultDocumentationImporter.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-import/src/main/java/com/structurizr/importer/documentation/DefaultDocumentationImporter.java), [`DefaultImageImporter.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-import/src/main/java/com/structurizr/importer/documentation/DefaultImageImporter.java), [`AdrToolsDecisionImporter.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-import/src/main/java/com/structurizr/importer/documentation/AdrToolsDecisionImporter.java).
- Routes: [`DocumentationController.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/java/com/structurizr/server/web/workspace/authenticated/DocumentationController.java), [`DecisionsController.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/java/com/structurizr/server/web/workspace/authenticated/DecisionsController.java), [`DocumentationScope.java`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/java/com/structurizr/util/DocumentationScope.java), and Lite's [`DocumentationController.java`](https://github.com/structurizr/lite/blob/main/src/main/java/com/structurizr/lite/web/DocumentationController.java) for comparison.
- Pages: [`documentation.jsp`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/webapp/WEB-INF/jsp/documentation.jsp), [`decisions.jsp`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/webapp/WEB-INF/jsp/decisions.jsp), [`decisions/graph.jspf`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/webapp/WEB-INF/fragments/decisions/graph.jspf), [`diagrams.jsp`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/webapp/WEB-INF/jsp/diagrams.jsp), [`structurizr-content.js`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/resources/static/static/js/structurizr-content.js), [`structurizr-documentation.js`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/resources/static/static/js/structurizr-documentation.js), [`structurizr-diagram.js`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/resources/static/static/js/structurizr-diagram.js) (`addDoubleClickHandlerForElement`), [`structurizr-workspace.js`](https://github.com/structurizr/structurizr/blob/main/structurizr-application/src/main/resources/static/static/js/structurizr-workspace.js) (`hasDocumentation`, `hasDecisions`).
- Docs: [docs.structurizr.com/dsl/docs](https://docs.structurizr.com/dsl/docs), [/dsl/adrs](https://docs.structurizr.com/dsl/adrs), [/server/decisions](https://docs.structurizr.com/server/decisions), [/server/diagrams/viewer](https://docs.structurizr.com/server/diagrams/viewer).
- Local example: `test/__fixtures__/big-bank-plc-stored.json`.

The cloud service's own source is not public. Its pages come from `structurizr/ui`, so the behavior below most likely holds there too, but I could not run or read the cloud service to confirm it.

## What the workspace JSON carries on an element

- The workspace, every software system, every container and every component implement `Documentable`, so each carries one `documentation` object with three arrays: `sections`, `decisions` and `images`. The JSON nests that object on the element where it sits in the model tree (`model.softwareSystems[].documentation`, `…containers[].documentation`, `…components[].documentation`). Nothing else links a document to its element; the `elementId` field on content survives only "for backwards compatibility" and stays unused.
- A section holds `title`, `content`, `format` (`Markdown` or `AsciiDoc`), `filename` and `order`. A section has no id. `Documentation.addSection` sets `order` to the section's position at import (`sections.size() + 1`), and the importer reads files sorted by filename, so `order` follows the filename. The JSON array need not follow `order`: in the Big Bank fixture `04-deployment.adoc` (order 4) comes before `03-development-environment.adoc` (order 3), and the page sorts by `order`.
- A decision holds `id`, `title`, `date`, `status`, `content`, `format` and `links` (each link has the target decision's `id` and a `description`). Decision ids are unique only within one `documentation` object.
- An image holds `name`, `type` and base64 `content`. `name` is the path relative to the `!docs` or `!adrs` folder, subfolders included.
- An element without documentation carries `"documentation": {}` or nothing; the UI fills in empty arrays (`#initDocumentation` in `structurizr-workspace.js`).
- The Big Bank fixture carries everything on the software system "Internet Banking System": 4 sections (`01-context.md`, `02-containers.md`, `03-development-environment.adoc`, `04-deployment.adoc`) and 1 decision (`id: "1"`, "Record architecture decisions"), no images, and nothing on the workspace or on any container.

### How `!docs` and `!adrs` inside an element produce it

- The DSL parser accepts `!docs` and `!adrs` (and its synonym `!decisions`) directly inside `workspace`, `softwareSystem`, `container` and `component`. Each opens a context on that element, so the files land in that element's `documentation`. The published docs pages ([/dsl/docs](https://docs.structurizr.com/dsl/docs), [/dsl/adrs](https://docs.structurizr.com/dsl/adrs)) name only "the workspace, a software system, or a container"; the parser accepts components as well.
- The path is relative to the DSL file and must sit in its folder or below. `DefaultDocumentationImporter` imports every Markdown and AsciiDoc file directly in that folder (no recursion into subfolders), sorted by filename, honoring `exclude` rules. It trims `filename` to the path relative to the `!docs` folder.
- When the path is a folder, `DefaultImageImporter(true)` then imports, recursively, only the images that the element's sections and decisions reference, into that element's `images`.
- `!adrs` uses `AdrToolsDecisionImporter` by default (`madr` and `log4brains` also ship). The importer turns each ADR file name in another ADR's content into `#<id>` ("0008-some-decision.md" becomes "#8") and turns adr-tools status links into `links`.
- Nesting stays structural only. A container's `!docs` fills the container's object; nothing merges it into, or lists it under, its software system's object.

## How the pages move between scopes

Structurizr calls whose documents a page shows its "scope". The workspace scope is `*`; an element's scope is its name path (see the URLs below). Both the documentation page and the decisions page work the same way:

- **One scope per page load.** The page shows only the requested scope's sections (or decisions). It never shows two scopes at once.
- **A flat scope list in the left navigation.** The page walks the model and lists every scope that has content, as a heading link: the workspace first (labeled with the workspace name), then each software system in model order, each followed by its containers in model order, each followed by its components. The list repeats the same heading style at every level; nothing indents a container under its software system. Elements without content stay out of the list.
- **The current scope expands in place.** Right under the current scope's heading, the page lists that scope's contents: on the documentation page the numbered `h2` and `h3` headings of its sections (`1 Context`, `2.1 …`); on the decisions page each decision as `<id>. <title>`. The other scopes stay collapsed to their heading link.
- **A drop-down on small screens and in quick navigation.** The narrow-screen `<select>` and the Space-key quick navigation list the same scopes, labeled with the element type: `[Workspace] <name>`, `[Software System] <name>`, `[Container] <name>`, `[Component] <name>` (via `getTerminologyFor`).
- **The page title is the scope's name.** The documentation page puts the element's (or workspace's) name in its `h1`.
- **Fallback when the workspace has none.** Opening `/documentation` (or `/decisions`) on a workspace without its own sections (or decisions) redirects to the first element in the scope list. With Big Bank, `/documentation` therefore lands on `/documentation/Internet%20Banking%20System`.
- **The workspace-level link appears whenever any scope has content.** `hasDocumentation()` and `hasDecisions()` check the workspace and every software system, container and component, and the workspace summary shows the "Documentation" and "Decisions" links when either returns true.
- **Ordering inside a scope.** Sections sort by `order` and the page numbers `h2`, `h3` and `h4` headings sequentially across the scope's sections, dropping `h1`. Decisions sort by `date` descending, then by `id` descending, and the summary groups them by year.

## URLs and element link forms

### Page routes

| Product                  | Workspace scope                                                   | Element scope                                                                                         |
| ------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Current server and local | `/workspace/{id}/documentation`, `/workspace/{id}/decisions`      | `/workspace/{id}/documentation/{softwareSystem}[/{container}[/{component}]]`, same under `/decisions` |
| Lite (archived)          | `/workspace/documentation` (also `/workspace/{id}/documentation`) | `/workspace/documentation/{softwareSystem}[/{container}[/{component}]]`, same under `/decisions`      |
| On-premises shared link  | `/share/{id}/documentation`                                       | `/share/{id}/documentation/{softwareSystem}[/{container}[/{component}]]`                              |

The controller joins the path segments with `/` (`DocumentationScope.format`) and passes the scope to the page base64-encoded; with no segments the scope is `*`.

### Section and decision addressing inside a page

- **Sections** have no id in the URL. The documentation page inserts two anchors before every numbered heading: the number (`#1`, `#2.1`, `#2.1.3`) and a slug of the heading text (`#context`, `#software-architecture`), lower-cased, punctuation removed, spaces turned to `-`, with `-1`, `-2` on duplicates. As the reader scrolls, the page rewrites the hash to the slug. Both anchors are counted per scope, so `#1` on `/documentation/Internet%20Banking%20System` and `#1` on `/documentation` point at different sections.
- **Decisions** use `#<id>` on the scope's decisions page (`/decisions/Internet%20Banking%20System#1`). With no hash the page shows the scope's summary.

### How an element name becomes a path

Every place that builds an element link (the scope list, the fallback redirect and the diagram's double-click menu) calls the same `toScope`: a software system's `name`; a container's `<software system name>/<container name>`; a component's `<software system name>/<container name>/<component name>`. The page passes the result through `encodeURI`, which turns spaces into `%20` but leaves `/`, `#`, `?` and `&` as they are. So:

- Internet Banking System: `/workspace/1/documentation/Internet%20Banking%20System`
- A container "API Application" in it: `/workspace/1/documentation/Internet%20Banking%20System/API%20Application`
- A component "Sign In Controller" in that container: `/workspace/1/decisions/Internet%20Banking%20System/API%20Application/Sign%20In%20Controller`

The scope matches by name, not by id. The source neither escapes nor rejects a name that contains `/`, `#` or `?`; such a name would break its link. I found no code that handles that case. A dead helper in `diagrams.jsp` (`openDocumentationOrDecisions`, defined but never called) builds the same paths with `escapeHtml` instead of `encodeURI`.

### `{workspace}` links in content and in element `url`

- The viewer docs list `{workspace}/diagrams`, `{workspace}/documentation` and `{workspace}/decisions` as same-workspace link forms, and `{workspace:456}/…` for another workspace ([/server/diagrams/viewer](https://docs.structurizr.com/server/diagrams/viewer)). The docs show no element-scoped example.
- The code handles element scopes anyway: it replaces the `{workspace}` prefix with the page's URL prefix and keeps the rest of the path and the hash untouched (`rewriteInternalWorkspaceLinks` in both pages, `processWorkspaceLink` in `diagrams.jsp`). So `{workspace}/documentation/Internet Banking System#context` and `{workspace}/decisions/Internet Banking System/API Application#2` reach element scopes. `rewriteInternalWorkspaceLinks` URL-decodes the href first, so an author may write the name with spaces or with `%20`.

## How relative links inside an element's documentation resolve

- **To the same scope's sections.** On the documentation page, the page maps each section's `filename` (relative to its `!docs` folder) to the section, for the current scope only. A link `href="02-containers.md"` becomes `#<n>`, where `n` is that section's position after sorting; a link `02-containers.md#some-anchor` becomes `#some-anchor`. Nothing maps to another scope's files.
- **Between decisions.** The ADR importer already rewrote file names to `#<id>` at import time, and a bare hash resolves on the current page, so it reaches the decision with that id in the same scope.
- **Anything else stays as the author wrote it.** A relative link that matches no file of the current scope (a link from an element's docs to a workspace section file, say) passes through unchanged, and the browser resolves it against the page URL, for example `/workspace/1/documentation/Internet%20Banking%20System` plus `../01-context.md`. I found no rewriting for it; such links break.
- **Images.** `ContentRenderer.setScope(element)` puts the element's `images` in front of the workspace's (`element.images.concat(workspace.images)`), and `findImage` returns the last match. So an element's docs can use the workspace's images too, and when both hold an image with the same `name`, the workspace's wins. `{workspace}/images/<name>` and absolute URLs also work.
- **Embedded diagrams.** `embed:<view key>` works the same in every scope; view keys are global to the workspace.

## The decision graph

The decisions page builds its "Decision explorer" (a d3 force-directed graph in a full-screen modal, opened by a button under the decision title) from `decisions`, which holds the current scope's decisions only. A root node "Decisions" links to every decision, and each decision's `links` add arrows. So the graph runs per scope; no view draws decisions from several scopes together. Links that point at an id outside the scope have no node to land on. Clicking a node highlights its connected decisions and moves the hash to that decision; double-clicking also closes the modal. The workspace "Explore" pages (`ExploreController`, `GraphController`) show no decisions.

## What a diagram element offers

- **Icons.** Under the element's text, a row of small icons marks where it leads, in this order: zoom-in (a view to open), a book (the element has documentation sections), a journal (the element has decisions) and a link (the element has a `url` or a property whose value starts with `http://` or `https://`). The [viewer docs](https://docs.structurizr.com/server/diagrams/viewer) describe the same icons. A software system instance or container instance shows the icons of the software system or container it instantiates. The element gets a `zoom-in` cursor. The SVG export hides the icon row.
- **Double-click.** Double-clicking builds a list of destinations: the element's views (context, container, component, dynamic and image views), then "Documentation" (`{prefix}/documentation/<scope>`) when the element has sections, then "Decisions" (`{prefix}/decisions/<scope>`) when it has decisions, then its `url`, then its URL properties. With one destination the diagram navigates there; with several it opens a modal to choose from. Alt plus double-click goes straight to the `url`.
- **Instances lose the entries.** The double-click handler reads documentation from the double-clicked element itself, so a software system instance or container instance on a deployment diagram shows the book and journal icons but offers no "Documentation" or "Decisions" entry. This reads like an inconsistency in Structurizr rather than a choice; I found nothing that explains it.
- **No context menu or keyboard shortcut** reaches an element's documentation. The diagram toolbar has no button that opens the current view's software system documentation (the helper for it exists but nothing calls it).

## What I could not confirm

- The cloud service: its source is not public, and I did not run it. The archived `structurizr/ui` README says the cloud service uses those pages.
- I did not run the server against the Big Bank fixture; every statement comes from reading the source and the published docs.
- Behavior for element names containing `/`, `#` or `?`: the source neither escapes nor rejects them.

## Which open questions on map #37 these facts bear on

- **How a reader moves between scopes on one docs page**: the scope list, expanded current scope, type-labeled drop-down and workspace fallback above.
- **Addressing**: the name-path routes, per-scope number and slug anchors, `#<id>` decisions, and the `{workspace}/documentation/<path>` form that already works in content and element `url`.
- **Activation targets**: the order views, Documentation, Decisions, `url`, and the instance gap.
- **The decisions page and the decision graph**: one graph per scope, never across scopes.
- **A fixture for containers and components**: the parser accepts both, the docs mention only containers, and Big Bank covers neither.
- **Vocabulary**: Structurizr's own word is "scope", with `*` for the workspace.
