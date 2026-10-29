import { defineConfig } from "vite";
// @ts-expect-error — plain ESM shared with scripts/build.js
import {
    colorError,
    loadSetBranding,
    NO_BRANDING_FLAGS,
} from "./scripts/branding.js";
// @ts-expect-error — plain ESM shared with scripts/build.js
import { createConfig } from "./scripts/config.js";
// @ts-expect-error — plain ESM shared with scripts/build.js
import { pageSet } from "./scripts/plugins.js";
// @ts-expect-error — plain ESM shared with scripts/build.js
import { loadSet } from "./scripts/workspace-set.js";

/** Whatever this repository documents about itself. */
const DEFAULT_WORKSPACE = "architecture/workspace.json";

/**
 * Dev-server entry only. Production builds go through `scripts/build.js`, which
 * owns argument parsing and asset embedding; both share `scripts/config.js`.
 *
 *   pnpm dev                                    (this repo's own workspace)
 *   pnpm dev -- path/to/workspace.json [--logo x.svg] [--font Inter]
 *   pnpm dev -- test/__fixtures__/enterprise    (a set: files, URLs, folders)
 *
 * It loads the set through `scripts/workspace-set.js`, as the build does,
 * lands on its landscape scoped workspace and serves each other workspace
 * as `<slug>.json`.
 * The branding flags it reads take the workspace's `renderizr.*` properties
 * the way `renderizr` does, through `scripts/branding.js`.
 */

/** The branding flags `pnpm dev` reads, each taking a value. */
const BRANDING_FLAGS = {
    logo: "--logo",
    logoAlt: "--logo-alt",
    logoHref: "--logo-href",
    font: "--font",
    primaryColor: "--primary-color",
};

export default async () => {
    const args = process.argv.slice(2);
    const flag = (name: string) => {
        const at = args.indexOf(name);
        return at === -1 ? undefined : args[at + 1];
    };

    // Every positional goes to the set loader, as in the build. Falling back
    // to this repository's own workspace means `pnpm dev` starts and renders
    // something, rather than refusing to boot over a missing argument that
    // most runs would have passed the same value for anyway.
    const positionals = args.filter(
        (arg, at) =>
            !arg.startsWith("-") &&
            !Object.values(BRANDING_FLAGS).includes(args[at - 1]),
    );
    const set = await loadSet(
        positionals.length > 0
            ? positionals
            : [process.env.RENDERIZR_WORKSPACE ?? DEFAULT_WORKSPACE],
    );
    for (const notice of set.notices) process.stderr.write(`${notice}\n`);
    for (const warning of set.warnings) {
        process.stderr.write(`warning: ${warning}\n`);
    }
    // The page lands on the landscape scoped workspace, or a lone workspace.
    const { workspace } = set.landscape;

    const flags = {
        ...NO_BRANDING_FLAGS,
        ...Object.fromEntries(
            Object.entries(BRANDING_FLAGS).map(([key, name]) => [
                key,
                flag(name) ?? null,
            ]),
        ),
    };
    // The build refuses the same flag with its usage.
    const wrongColor = colorError(flags.primaryColor);
    if (wrongColor) throw new Error(wrongColor);
    const branding = await loadSetBranding({ flags, set });
    for (const { notices } of [branding.landscape, ...branding.workspaces])
        for (const notice of notices) process.stderr.write(`${notice}\n`);
    const { logo, font, primaryColor } = branding.landscape;

    process.env.VITE_WORKSPACE_NAME = workspace.name ?? "Workspace";

    return defineConfig(
        createConfig({
            workspace,
            logo,
            font,
            primaryColor,
            set: pageSet(set, branding),
            singleFile: args.includes("--single-file"),
            mode: "serve",
        }),
    );
};
