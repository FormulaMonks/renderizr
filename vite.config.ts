import { defineConfig } from "vite";
// @ts-expect-error — plain ESM shared with scripts/main.js
import { loadWorkspace } from "./scripts/assets.js";
// @ts-expect-error — plain ESM shared with scripts/main.js
import {
    colorError,
    loadBranding,
    NO_BRANDING_FLAGS,
} from "./scripts/branding.js";
// @ts-expect-error — plain ESM shared with scripts/main.js
import { createConfig } from "./scripts/config.js";

/** Whatever this repository documents about itself. */
const DEFAULT_WORKSPACE = "architecture/workspace.json";

/**
 * Dev-server entry only. Production builds go through `scripts/main.js`, which
 * owns argument parsing and asset embedding; both share `scripts/config.js`.
 *
 *   pnpm dev                                    (this repo's own workspace)
 *   pnpm dev -- path/to/workspace.json [--logo x.svg] [--font Inter]
 *
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

    // Falling back to this repository's own workspace means `pnpm dev` starts
    // and renders something, rather than refusing to boot over a missing
    // argument that most runs would have passed the same value for anyway.
    const source =
        args
            .filter(
                (arg, at) =>
                    !arg.startsWith("-") &&
                    !Object.values(BRANDING_FLAGS).includes(args[at - 1]),
            )
            .at(-1) ??
        process.env.RENDERIZR_WORKSPACE ??
        DEFAULT_WORKSPACE;

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
    const workspace = await loadWorkspace(source);
    const { logo, font, primaryColor, notices } = await loadBranding({
        flags,
        workspace,
        source,
    });
    for (const notice of notices) process.stderr.write(`${notice}\n`);

    process.env.VITE_WORKSPACE_NAME = workspace.name ?? "Workspace";

    return defineConfig(
        createConfig({
            workspace,
            logo,
            font,
            primaryColor,
            singleFile: args.includes("--single-file"),
            mode: "serve",
        }),
    );
};
