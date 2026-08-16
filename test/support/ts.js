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

import * as nodeModule from "node:module";
import { test } from "node:test";
import { installDOM } from "./dom.js";

/**
 * `module.register` landed in Node 20.6, and `package.json` allows Node 20.0.
 * The namespace import above is deliberate: a named `import { register }` is a
 * SyntaxError on the versions that lack it, which would take the whole test
 * file down instead of skipping it.
 */
const UNSUPPORTED =
    typeof nodeModule.register === "function"
        ? null
        : `importing src/*.ts needs module.register (Node 20.6+); this is ${process.version}`;

if (UNSUPPORTED) {
    // Loud on purpose. A silent skip is how a suite comes to report a green
    // run while a third of it never executed; this says so once per file, on
    // stderr, before a single test has run.
    process.emitWarning(
        `${UNSUPPORTED}. Every test in this file is being SKIPPED. Run the suite on Node 20.6 or newer.`,
        "RenderizrTestSkip",
    );
} else {
    nodeModule.register("./vite-hooks.js", import.meta.url);
}

/**
 * Import `src/<path>` (extension optional).
 *
 * On a Node too old for the hooks this resolves to an inert namespace instead
 * of throwing, so the module-level `await importSrc(...)` at the top of a test
 * file still settles and `srcTest` can skip the tests with a reason.
 */
export const importSrc = (path) =>
    UNSUPPORTED
        ? Promise.resolve(new Proxy({}, { get: () => undefined }))
        : import(new URL(`../../src/${path}`, import.meta.url).href);

/** `test`, or a skipped stand-in when `src/` cannot be imported here. */
export const srcTest = UNSUPPORTED
    ? (name) => test(name, { skip: UNSUPPORTED }, () => {})
    : test;

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
