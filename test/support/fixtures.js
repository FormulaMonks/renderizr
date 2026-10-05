/**
 * What the fixture writers and their tests share about a workspace's JSON:
 * the people and software systems at the top of its model, and the format a
 * committed fixture keeps. `test/support/large-landscape.js` and
 * `test/__fixtures__/acceptance/export.js` write fixtures with it.
 */

import { writeFileSync } from "node:fs";

/** The people and software systems at the top of `workspace`'s model. */
export const peopleAndSoftwareSystems = (workspace) => [
    ...(workspace.model.people ?? []),
    ...(workspace.model.softwareSystems ?? []),
];

/**
 * Write `workspace` to `path` as a committed fixture: indented by four
 * spaces, as Biome formats JSON here, with a trailing newline.
 */
export function writeFixture(path, workspace) {
    writeFileSync(path, `${JSON.stringify(workspace, null, 4)}\n`);
}
