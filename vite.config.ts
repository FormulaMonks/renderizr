import { defineConfig } from "vite";
// @ts-expect-error — plain ESM shared with scripts/build.js
import { loadFont, loadLogo, loadWorkspace } from "./scripts/assets.js";
// @ts-expect-error — plain ESM shared with scripts/build.js
import { createConfig } from "./scripts/config.js";

/**
 * Dev-server entry only. Production builds go through `scripts/build.js`, which
 * owns argument parsing and asset embedding; both share `scripts/config.js`.
 *
 *   pnpm dev -- path/to/workspace.json [--logo x.svg] [--font Inter]
 */
export default async () => {
    const args = process.argv.slice(2);
    const flag = (name: string) => {
        const at = args.indexOf(`--${name}`);
        return at === -1 ? undefined : args[at + 1];
    };

    const source =
        args.filter((arg) => !arg.startsWith("-")).at(-1) ??
        process.env.RENDERIZR_WORKSPACE;

    if (!source) {
        throw new Error(
            "No workspace given. Run: pnpm dev -- path/to/workspace.json",
        );
    }

    const fontFamily = flag("font");
    const font = await loadFont(
        fontFamily
            ? {
                  family: fontFamily,
                  weights: ["400", "700"],
                  subsets: ["latin"],
                  italic: false,
              }
            : null,
    );
    const logoSource = flag("logo");

    const [workspace, logo] = await Promise.all([
        loadWorkspace(source, { font }),
        loadLogo(logoSource ? { source: logoSource, alt: "" } : null),
    ]);

    process.env.VITE_WORKSPACE_NAME = workspace.name ?? "Workspace";

    return defineConfig(
        createConfig({
            workspace,
            logo,
            font,
            singleFile: args.includes("--single-file"),
            mode: "serve",
        }),
    );
};
