# Branches

How to name every branch created in this repo, by hand or by an agent. `CONTRIBUTING.md` holds the same rule under _Branches_.

Name the branch `<type>/<issue>/<short-description>`, for example `feat/42/resolve-view` or `fix/57/hash-routes-under-file`.

- `<type>` is one of `feat`, `fix` or `chore`. Use `feat` for a new capability, `fix` for a bug and `chore` for everything else (docs, CI, refactors, dependencies, tooling).
- `<issue>` is the number of the GitHub issue the branch works on, without the `#`. When the work has no issue, leave the segment out: `chore/bump-biome`.
- `<short-description>` is a few lower-case words in kebab-case that say what the branch does.
