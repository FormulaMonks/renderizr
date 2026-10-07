# Verification

How to check a change by hand, and how to write the steps for someone else to check it: in a pull request's _How to verify it_, in docs and in chat.

- **Use the repo's own tooling.** Run the package scripts (`pnpm dev`, `pnpm render`, `pnpm test`) and never the scripts underneath them (`node scripts/build.js`). `pnpm render` runs `tsc` first, so it checks what people actually run. Run every command once before writing it down.
- **Point the dev server at a versioned fixture.** Pick the workspace under `test/__fixtures__/` that shows the change, or `architecture/workspace.json`, and open it directly:

  ```bash
  pnpm dev -- test/__fixtures__/edge-routing.json --font Inter
  ```

  Avoid copy scripts and throwaway workspaces. Git tracks the fixture, so `git status` shows whether anything changed it during the check. When no fixture shows the change, add one under `test/__fixtures__/` in the same change.
- **Mind the separator.** `pnpm dev` needs `--` before its arguments, because Vite rejects options it does not know (`--font`). `pnpm render` takes its arguments with no `--`; the CLI drops a leading `--` that pnpm forwards, but leave it out so the commands read alike.
