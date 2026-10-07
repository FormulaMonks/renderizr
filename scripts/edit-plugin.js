import { resolve } from "node:path";
import { loadWorkspace } from "./assets.js";
import { RESOLVED_WORKSPACE_MODULE, WORKSPACE_MODULE } from "./plugins.js";

/**
 * Edit mode's Vite plugin (spec 4.4, ADR 15): the server half of
 * `renderizr edit`.
 *
 * It serves the workspace as the page's workspace module, read from disk on
 * each load with the build's transforms applied (themes merged into styles,
 * icons and images inlined, the font named), in place of the workspace a
 * build compiles in. The page never sees the file itself: the transforms
 * change it, so the page's copy is never one to save.
 *
 * The module is watched: a change to the file on disk drops the module and
 * reloads the page, which imports the file again.
 */
export function editMode({ workspace, font = null }) {
    const file = resolve(workspace);

    return {
        name: "renderizr:edit-mode",
        resolveId: (id) =>
            id === WORKSPACE_MODULE ? RESOLVED_WORKSPACE_MODULE : null,
        async load(id) {
            if (id !== RESOLVED_WORKSPACE_MODULE) return null;
            const transformed = await loadWorkspace(file, { font });
            return `export default ${JSON.stringify(transformed)};`;
        },
        configureServer(server) {
            // The file usually sits outside Vite's root, the package, so
            // Vite's watcher would never look at it on its own.
            server.watcher.add(file);
        },
        handleHotUpdate({ file: changed, server }) {
            if (resolve(changed) !== file) return;
            const module = server.moduleGraph.getModuleById(
                RESOLVED_WORKSPACE_MODULE,
            );
            if (module) server.moduleGraph.invalidateModule(module);
            server.ws.send({ type: "full-reload" });
            return [];
        },
    };
}
