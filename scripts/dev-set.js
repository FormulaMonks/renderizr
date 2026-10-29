import { stat } from "node:fs/promises";
import {
    basename,
    dirname,
    isAbsolute,
    relative,
    resolve,
    sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
    loadSetBranding,
    NO_BRANDING_FLAGS,
    writeBrandingNotices,
} from "./branding.js";
import { DEBOUNCE_MS } from "./dsl-pipeline.js";
import { scanDsl, staleExports, under } from "./dsl-scan.js";
import {
    pageSet,
    RESOLVED_SET_MODULE,
    RESOLVED_WORKSPACE_MODULE,
    setModule,
    UNNAMED_WORKSPACE,
    workspaceModule,
} from "./plugins.js";
import {
    DslError,
    loadSet,
    WORKSPACE_FILE,
    writeSetMessages,
} from "./workspace-set.js";

/**
 * The set `pnpm dev` previews (spec 264, _Previewing a set with
 * `pnpm dev`_): the set loader's set, kept up to date while the author
 * works.
 *
 *     const dev = await devSet({ positionals, flags });
 *     createConfig({ ...dev.landscape, devSet: dev.plugins, mode: "serve" });
 *
 * - **Watching**: every local file the set loader read (positionals, folder
 *   members, followed `file:///` links), each folder positional, each
 *   DSL's folder and every file the DSL scan finds outside it. No URL.
 * - **Reloading**: a change reruns the set loader, then fully reloads the
 *   page. Only the DSL whose dependencies hold the changed file goes back
 *   to the tools; the others keep their export from the last load.
 * - **Errors**: a set that breaks keeps the last set that loaded, and the
 *   server running. The error goes to the terminal and to the page's error
 *   toast, never to Vite's overlay. Before any set loads, the page gets an
 *   empty workspace and draws the error in place of the canvas.
 *
 * The landscape scoped workspace's name and branding are compiled into the
 * page (`scripts/config.js`), so a reload that changes them restarts the
 * server, which loads the set again from scratch.
 */

/** The custom event the page hears a set error on. `src/dev-set.ts` names it too. */
export const SET_ERROR_EVENT = "renderizr:set-error";

/** The branding flags `pnpm dev` reads, each taking a value. */
const BRANDING_FLAGS = {
    logo: "--logo",
    logoAlt: "--logo-alt",
    logoHref: "--logo-href",
    font: "--font",
    primaryColor: "--primary-color",
};

/** What the page draws while no set has loaded. */
const EMPTY_WORKSPACE = Object.freeze({
    name: UNNAMED_WORKSPACE,
    model: {},
    views: {},
    documentation: {},
});

/**
 * What `pnpm dev -- …` passes Renderizr, from `argv` without Node and the
 * script: the arguments after the first `--`. The ones before it are
 * Vite's own, such as `--port 5174`, and Vite rejects any it doesn't know,
 * so Renderizr's never come before it.
 *
 * @returns {{ positionals: string[], flags: object, singleFile: boolean }}
 */
export function devArgs(argv) {
    const after = argv.indexOf("--");
    const args = after === -1 ? [] : argv.slice(after + 1);
    const takesValue = Object.values(BRANDING_FLAGS);
    const flag = (name) => {
        const at = args.indexOf(name);
        return at === -1 ? null : (args[at + 1] ?? null);
    };
    return {
        positionals: args.filter(
            (arg, at) =>
                !arg.startsWith("-") && !takesValue.includes(args[at - 1]),
        ),
        flags: {
            ...NO_BRANDING_FLAGS,
            ...Object.fromEntries(
                Object.entries(BRANDING_FLAGS).map(([key, name]) => [
                    key,
                    flag(name),
                ]),
            ),
        },
        singleFile: args.includes("--single-file"),
    };
}

/* ---------------------------------------------------------------- errors */

/**
 * What the page hears about `error`, a load that failed: the tools'
 * message and the DSL they refused as `source`, or the set's message with
 * `source: null`; `blank` while no set has loaded.
 */
function pageError(error, blank) {
    for (let cause = error; cause; cause = cause.cause) {
        if (cause instanceof DslError)
            return { message: cause.detail, source: cause.source, blank };
    }
    return { message: error.message, source: null, blank };
}

/* ------------------------------------------------------------- the set */

/**
 * Whether `path`, under `folder`, lies under a name that starts with a dot
 * or in `node_modules`, where no workspace's files are: `.git`, the tools'
 * own folders, editors' swap files.
 */
const hidden = (path, folder) =>
    relative(folder, path)
        .split(sep)
        .some((part) => part.startsWith(".") || part === "node_modules");

/**
 * Load the set the `positionals` name, as `renderizr` does, and give the
 * page's compiled-in values, `landscape`, and the Vite `plugins` that serve
 * and reload the rest. With no positional, the caller passes
 * `RENDERIZR_WORKSPACE` or this repository's own workspace.
 */
export async function devSet({
    positionals,
    flags = NO_BRANDING_FLAGS,
    singleFile = false,
    cwd = process.cwd(),
    env = process.env,
    output = process.stderr,
    debounce = DEBOUNCE_MS,
}) {
    /** Each DSL's export, by path or URL, kept across loads. */
    const exports = new Map();
    /** Each local DSL's scan, by path. */
    const scans = new Map();
    /** Every local workspace file the last load read. */
    let files = new Set();
    /** The last set that loaded, as the page takes it; `null` before one. */
    let loaded = null;
    /** Why the last load failed, as the page takes it; `null` once one loads. */
    let error = null;

    /** The positionals that are local paths, each with whether it's a folder. */
    const inputs = await Promise.all(
        positionals
            .filter((positional) => !/^https?:\/\//i.test(positional))
            .map(async (positional) => {
                const path = /^file:/i.test(positional)
                    ? fileURLToPath(positional)
                    : resolve(cwd, positional);
                const found = await stat(path).catch(() => null);
                return { path, folder: Boolean(found?.isDirectory()) };
            }),
    );

    const load = async () => {
        const read = new Set();
        try {
            const set = await loadSet(positionals, {
                cwd,
                env,
                output,
                exports,
                onRead: (path) => read.add(path),
            });
            writeSetMessages(set, output);
            const branding = await loadSetBranding({ flags, set, cwd });
            writeBrandingNotices(branding, output);
            const { logo, font, primaryColor } = branding.landscape;
            loaded = {
                workspace: set.landscape.workspace,
                logo,
                font,
                primaryColor,
                set: pageSet(set, branding),
            };
            files = read;
            error = null;
        } catch (failure) {
            for (const path of read) files.add(path);
            error = pageError(failure, loaded === null);
            output.write(`The set didn't load: ${failure.message}\n`);
        }
        // Rescan each local DSL after its export: a new `!include` joins
        // its dependencies.
        const dsl = new Set(
            [...files, ...exports.keys()].filter(
                (key) => isAbsolute(key) && key.endsWith(".dsl"),
            ),
        );
        scans.clear();
        for (const path of dsl) scans.set(path, await scanDsl(path));
    };

    await load();

    /** What the page compiles in: the landscape's name and branding. */
    const compiled = () =>
        JSON.stringify(
            loaded && {
                name: loaded.workspace.name,
                logo: loaded.logo,
                font: loaded.font,
                primaryColor: loaded.primaryColor,
            },
        );
    const compiledIn = compiled();

    /** Every path the server watches, besides Vite's own root. */
    const watched = () => [
        ...inputs.map(({ path }) => path),
        ...files,
        ...[...scans.keys()].map((path) => dirname(path)),
        ...[...scans.values()].flatMap((scan) => scan.files),
    ];

    /** Whether a change to `path` touches the set. */
    const touches = (path) => {
        const roots = watched().filter((root) => under(path, root));
        if (roots.length === 0 || roots.every((root) => hidden(path, root)))
            return false;
        if (files.has(path)) return true;
        if (
            inputs.some(
                (input) =>
                    input.folder &&
                    dirname(path) === input.path &&
                    WORKSPACE_FILE.test(basename(path)),
            )
        )
            return true;
        return staleExports([path], scans).length > 0;
    };

    const landscape = loaded ?? {
        workspace: EMPTY_WORKSPACE,
        logo: null,
        font: null,
        primaryColor: null,
    };

    /** The plugin that watches the set and reloads it. */
    const reloader = {
        name: "renderizr:dev-set",
        configureServer(server) {
            server.watcher.add(watched());

            const changed = new Set();
            let timer = null;
            let running = null;
            let closed = false;

            const drop = () => {
                for (const id of [
                    RESOLVED_WORKSPACE_MODULE,
                    RESOLVED_SET_MODULE,
                ]) {
                    const module = server.moduleGraph.getModuleById(id);
                    if (module) server.moduleGraph.invalidateModule(module);
                }
            };

            const reload = async () => {
                while (changed.size > 0 && !closed) {
                    const paths = [...changed];
                    changed.clear();
                    for (const dsl of staleExports(paths, scans))
                        exports.delete(dsl);
                    await load();
                    server.watcher.add(watched());
                    if (error) {
                        drop();
                        server.ws.send(SET_ERROR_EVENT, error);
                    } else if (compiled() !== compiledIn) {
                        closed = true;
                        await server.restart();
                    } else {
                        drop();
                        server.ws.send({ type: "full-reload" });
                    }
                }
            };

            server.watcher.on("all", (_event, path) => {
                const absolute = resolve(path);
                if (closed || !touches(absolute)) return;
                changed.add(absolute);
                clearTimeout(timer);
                timer = setTimeout(() => {
                    if (running) return;
                    running = reload()
                        .catch((failure) => output.write(`${failure.stack}\n`))
                        .finally(() => {
                            running = null;
                        });
                }, debounce);
            });
            server.httpServer?.once("close", () => {
                closed = true;
                clearTimeout(timer);
            });
        },
        handleHotUpdate({ file }) {
            // The set's files belong to this plugin, never to Vite's HMR.
            if (touches(resolve(file))) return [];
        },
    };

    return {
        landscape,
        plugins: [
            workspaceModule(
                () => loaded?.workspace ?? EMPTY_WORKSPACE,
                () => error,
            ),
            setModule(() => ({
                ...(loaded?.set ?? {}),
                inline: singleFile,
            })),
            reloader,
        ],
    };
}
