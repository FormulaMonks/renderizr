#! /usr/bin/env node

/**
 * The `renderizr` bin. It checks the running Node against the floor (ADR 26),
 * then loads the CLI in `./main.js`.
 *
 * `npx` runs against whatever Node is on the PATH, which is often not the one
 * the shell reports. Older versions fail deep inside the build instead, so the
 * error names a missing path or a broken dependency rather than the actual
 * cause. Static imports load before a module's body runs, so the CLI comes in
 * through `import()`, and only once the check passes.
 */

import { meetsNodeFloor, nodeRefusal } from "./node-version.js";

if (!meetsNodeFloor(process.versions.node)) {
    process.stderr.write(nodeRefusal(process.version));
    process.exit(1);
}

await import("./main.js");
