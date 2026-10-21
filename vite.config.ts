import { defineConfig } from "vite";
// @ts-expect-error — plain ESM shared with scripts/main.js
import { colorError } from "./scripts/branding.js";
// @ts-expect-error — plain ESM shared with scripts/main.js
import { createConfig } from "./scripts/config.js";
// @ts-expect-error — plain ESM shared with scripts/main.js
import { devArgs, devSet } from "./scripts/dev-set.js";
// @ts-expect-error — plain ESM shared with scripts/main.js
import { UNNAMED_WORKSPACE } from "./scripts/plugins.js";

/** Whatever this repository documents about itself. */
const DEFAULT_WORKSPACE = "architecture/workspace.json";

/**
 * Dev-server entry only. Production builds go through `scripts/main.js`, which
 * owns argument parsing and asset embedding; both share `scripts/config.js`.
 *
 *   pnpm dev                                    (this repo's own workspace)
 *   pnpm dev -- path/to/workspace.json [--logo x.svg] [--font Inter]
 *   pnpm dev -- test/__fixtures__/enterprise    (a set: files, URLs, folders)
 *   pnpm dev --port 5174 -- workspace.dsl       (Vite's options before --)
 *
 * It loads the set through `scripts/workspace-set.js`, as the build does,
 * lands on its landscape scoped workspace and serves each other workspace
 * as `<slug>.json`. `scripts/dev-set.js` watches the set and reloads the
 * page on every change, re-exporting only the DSL a change touches.
 * The branding flags it reads take the workspace's `renderizr.*` properties
 * the way `renderizr` does, through `scripts/branding.js`.
 */
export default async () => {
    const { positionals, flags, singleFile } = devArgs(process.argv.slice(2));

    // The build refuses the same flag with its usage.
    const wrongColor = colorError(flags.primaryColor);
    if (wrongColor) throw new Error(wrongColor);

    // Every positional goes to the set loader, as in the build. Falling back
    // to this repository's own workspace means `pnpm dev` starts and renders
    // something, rather than refusing to boot over a missing argument that
    // most runs would have passed the same value for anyway.
    const dev = await devSet({
        positionals:
            positionals.length > 0
                ? positionals
                : [process.env.RENDERIZR_WORKSPACE ?? DEFAULT_WORKSPACE],
        flags,
        singleFile,
    });
    const { workspace, branding } = dev.landscape;

    process.env.VITE_WORKSPACE_NAME = workspace.name ?? UNNAMED_WORKSPACE;

    return defineConfig(
        createConfig({
            workspace,
            branding,
            devSet: dev.plugins,
            singleFile,
            mode: "serve",
        }),
    );
};
