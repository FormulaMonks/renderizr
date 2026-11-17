/**
 * The documentation of a workspace as the page receives it: every section
 * and decision rendered to HTML by the build step (ADR 31). Page tests write
 * their documents in Markdown and hand the page what a build would.
 */

import { renderDocumentation } from "../../scripts/documentation/index.js";

/**
 * A copy of `workspace` with its documentation rendered, so a test's own
 * Markdown constants stay Markdown for the next test.
 *
 * @template W
 * @param {W} workspace
 * @returns {W}
 */
export const rendered = (workspace) =>
    renderDocumentation(structuredClone(workspace));
