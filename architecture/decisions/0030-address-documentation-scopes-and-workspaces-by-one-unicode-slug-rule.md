# 30. Address documentation scopes and workspaces by one Unicode slug rule

Date: 2026-11-11

## Status

Accepted

Amends [26. Render the enterprise pattern's workspaces in one site](0026-render-the-enterprise-patterns-workspaces-in-one-site.md): the characters a workspace trail segment keeps.

## Context

Software systems, containers and components carry documentation sections and decisions of their own, and each of them is a documentation scope (see `GLOSSARY.md`). The docs and decisions pages need an address for every documentation scope that works under `file://`, in `--single-file` and in an artifact, and that a reader can share.

The address path already belongs to the workspace trail, so a documentation scope goes in the query, inside the document's id: `?page=docs&section=internet-banking-system/api-application/01-overview`, `?page=adrs&adr=internet-banking-system/3`. Each segment names one element, from the software system down. [26. Render the enterprise pattern's workspaces in one site](0026-render-the-enterprise-patterns-workspaces-in-one-site.md) names a workspace trail segment by the slug of a software system's name, and the set loader keeps only `a–z0–9` in it, so a name written in another script slugs to nothing.

Once readers share these addresses, changing how an element becomes a segment breaks every link already out there.

## Decision

Name every element in an address by one slug rule, for documentation scopes and workspace trail segments alike:

- Normalize the name to NFKD, drop combining marks and lowercase it.
- Turn every run of characters other than Unicode letters and numbers into `-`, and trim `-` from both ends.
- Keep the letters of every script: `日本` stays `日本`, and the address percent-encodes it.
- When two siblings slug the same, give the later one in model order `-2`, the next `-3`, and warn the author with a toast in `pnpm dev` and edit mode.

The same workspace always gives the same address. A set's per-workspace files under `--out` take the same slugs as their names.

## Consequences

- An element named in any script gets an address, and so does a software system scoped workspace whose software system has a non-Latin name.
- A workspace trail segment reads exactly as before when every letter of the name drops to `a–z` once its accents go (`Café Système` stays `cafe-systeme`). A letter that never did (`ß`, `ø`, `æ`) now stays instead of turning into `-` (`Straße` moves from `stra-e` to `straße`), so an address shared before the change for such a name stops resolving. A name in another script, which used to slug to nothing, now gets a segment.
- An address holds percent-encoded characters for those names, which reads worse when copied out of the address bar.
- Renaming an element, or reordering two siblings that slug the same, changes its address. An author who wants stable addresses keeps names stable.
- File names under `--out` can hold non-ASCII characters, so a host that serves the site has to serve UTF-8 file names.

## Alternatives considered

- **Keep `a–z0–9`, and fall back to the element's id for a name that slugs to nothing.** The DSL renumbers ids whenever the model changes, so those addresses break on an unrelated edit.
- **Name elements by their ids.** Ids stay stable within one `workspace.json` but move whenever the DSL renumbers the model, and they say nothing to a reader.
- **Use Structurizr's own name path** (`Internet%20Banking%20System/API%20Application`). It matches Structurizr's pages, but a `/`, `#` or `?` in a name breaks it, and it reads worse than a slug. Renderizr still accepts it in element links and maps it to the slug path.
- **Suffix colliding siblings by element id.** It survives reordering but carries the id's instability into the address.
