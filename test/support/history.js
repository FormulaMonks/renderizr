/**
 * The application's history singleton, imported the one way that is safe.
 *
 * `history/hash` calls `createHashHistory()` while it is being evaluated, and
 * that reads `document.defaultView` — so the DOM has to be installed first.
 * Importing `./dom.js` above it is what orders the two: ES modules evaluate
 * their dependencies depth-first, in source order.
 *
 * A test that imported `history/hash.js` directly would work or crash
 * depending on where the import happened to be sorted, so tests import this
 * instead. It is the same module instance `src/` uses, which is the point:
 * driving it here drives the application's router.
 */

import "./dom.js";

export { default } from "history/hash.js";
