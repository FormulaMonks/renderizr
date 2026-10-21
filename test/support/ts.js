/**
 * Everything a test needs before it can touch `src/`: the Vite-shaped module
 * hooks, the DOM, and a way to import the application's TypeScript sources.
 *
 * Importing this module is what installs both, so it has to be imported before
 * anything under `src/` is. The `import()` in `importSrc` runs after this
 * module has finished evaluating, which is exactly the ordering needed.
 *
 *   const { default: Menu } = await importSrc("components/menu");
 */

import { register } from "node:module";
import { test } from "node:test";
import { installDOM } from "./dom.js";

register("./vite-hooks.js", import.meta.url);

/** Import `src/<path>` (extension optional). */
export const importSrc = (path) =>
    import(new URL(`../../src/${path}`, import.meta.url).href);

/**
 * `test` under the name every test file imports it by, so the files need no
 * edit of their own.
 */
export const srcTest = test;

/**
 * The DOM the application runs in, installed as a side effect of importing
 * this module.
 *
 * It has to happen here rather than in each test: `src/` modules read `window`
 * and `document` while they are being evaluated — `history/hash` captures
 * `document.defaultView` at import time — so the globals must be in place
 * before the first `importSrc()`.
 */
export const dom = installDOM();

/**
 * The build-time flag that compiles edit mode in or out (ADR 15), as a
 * build defines it. A test of edit mode's page code sets it to true.
 */
globalThis.__RENDERIZR_EDIT_MODE__ ??= false;

/**
 * The branding's primary color as a build defines it: none, so a silent
 * Mermaid source fills with the page's default. A test sets it to choose one.
 */
globalThis.__RENDERIZR_PRIMARY_COLOR__ ??= null;

/**
 * A detached `<div>` for a component to render into.
 *
 * A real element, not a stand-in: the same one the page tests use, so a
 * renderer that only looks right because the stub was too forgiving cannot
 * pass here. `html` is the rendered markup with the `.markdown-renderer`
 * wrapper stripped, which is what those assertions care about, and `listeners`
 * exposes the click handlers a component is supposed to be tidying up.
 */
export function stubElement() {
    const element = dom.document.createElement("div");

    Object.defineProperties(element, {
        listeners: {
            get() {
                return this.listenersFor("click");
            },
        },
        html: {
            get() {
                const wrapper = this.querySelector(".markdown-renderer");
                return (wrapper?.innerHTML ?? this.innerHTML).trim();
            },
        },
    });

    return element;
}
