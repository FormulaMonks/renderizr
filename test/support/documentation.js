/**
 * The documentation of a workspace as the page receives it: every section
 * and decision rendered to HTML by the build step (ADR 31). Page tests write
 * their documents in Markdown or AsciiDoc and hand the page what a build
 * would.
 */

import { renderDocumentation } from "../../scripts/documentation/index.js";

/**
 * A copy of `workspace` with its documentation rendered, so a test's own
 * source constants stay source for the next test. asciidoctor.js converts
 * asynchronously, so the copy arrives as a promise.
 *
 * @template W
 * @param {W} workspace
 * @returns {Promise<W>}
 */
export const rendered = (workspace) =>
    renderDocumentation(structuredClone(workspace));
