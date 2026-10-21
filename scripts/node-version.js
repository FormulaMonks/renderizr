/**
 * The lowest Node Renderizr runs on (ADR 26), and the check the bin makes
 * against it before it loads anything else.
 *
 * This module imports nothing, not even Node's builtins, so it loads on any
 * Node: a dependency that fails on an old one must not crash before the
 * message prints.
 */

/** The floor's major and minor. `engines.node` in package.json says the same. */
const [FLOOR_MAJOR, FLOOR_MINOR] = [22, 12];

/**
 * Whether `version`, shaped like `process.versions.node` (`22.12.0`), meets
 * the floor. Major and minor compare as numbers, so 22.9 is below 22.12.
 */
export function meetsNodeFloor(version) {
    const [major, minor] = version.split(".").map(Number);
    return (
        major > FLOOR_MAJOR || (major === FLOOR_MAJOR && minor >= FLOOR_MINOR)
    );
}

/** The one line the bin prints on a Node below the floor. */
export const nodeRefusal = (version) =>
    `Renderizr needs Node ${FLOOR_MAJOR}.${FLOOR_MINOR} or newer; this is ${version}.\n`;
