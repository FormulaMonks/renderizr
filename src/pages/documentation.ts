/**
 * The documentation and decision pages, which the entry imports together
 * and only for a workspace that has documentation or decisions. One module
 * behind one dynamic import gives the bundler one chunk for the whole
 * documentation stack, `renderizr-docs.js` under `--artifact`.
 */
export { default as DecisionsPage } from "./adrs";
export { default as DocsPage } from "./docs";
