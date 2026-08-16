#! /usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
    copyFile,
    mkdir,
    readFile,
    readdir,
    rm,
    writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RENDERER_FILES } from "./plugins.js";

/**
 * Copies the handful of Structurizr files the build actually reads out of the
 * submodule and into `vendor/`, which is committed.
 *
 * The submodule is 76MB and, more to the point, absent for anyone who installs
 * this package rather than cloning it: neither npm nor pnpm fetches submodules
 * for a git dependency, so `npx --package=github:...` used to die on a missing
 * `structurizr-util.js`. Committing the ~450KB the build reads makes the
 * package self-contained; the submodule stays as the upstream to refresh from.
 *
 *   pnpm sync:vendor
 *
 * The file list is derived from the source rather than maintained here, so a
 * newly imported icon needs no edit to this script — import it from
 * `vendor/structurizr/bootstrap-icons/...` and re-run.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

const UPSTREAM = resolve(
    root,
    "submodules/structurizr/structurizr-application/src/main/resources/static/static",
);
const UPSTREAM_LICENSE = resolve(root, "submodules/structurizr/LICENSE");
const VENDOR = resolve(root, "vendor/structurizr");

/** Trees scanned for `vendor/structurizr/...` references. */
const SOURCES = ["src", "scripts"];

/** Paths that no reference in the source spells out in full. */
const IMPLICIT = RENDERER_FILES.map((file) => `js/${file}`);

const REFERENCE = /vendor\/structurizr\/([\w./-]+\.(?:css|js|svg))/g;

/**
 * Tests are not sources.
 *
 * The scan is a regex over file text, so a `vendor/structurizr/...` string
 * written as a test fixture reads exactly like a real import. Those paths do
 * not exist upstream, and a single phantom aborts the sync — which used to mean
 * aborting it after the vendor tree had already been deleted.
 */
const IS_TEST =
    /(^|[./])(test|__fixtures__|__mocks__)([./]|$)|\.test\.[cm]?[jt]s$/;

/** Every file under `dir`, as paths relative to it, tests excluded. */
async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
        entries.map((entry) => {
            const path = join(dir, entry.name);
            if (IS_TEST.test(entry.name)) return [];
            return entry.isDirectory() ? walk(path) : [path];
        }),
    );
    return files.flat();
}

async function referencedPaths() {
    const found = new Set(IMPLICIT);

    for (const source of SOURCES) {
        for (const file of await walk(resolve(root, source))) {
            const text = await readFile(file, "utf-8");
            for (const [, path] of text.matchAll(REFERENCE)) found.add(path);
        }
    }

    return [...found].sort();
}

/** The submodule commit the copy was taken from, for provenance. */
function upstreamRevision() {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: resolve(root, "submodules/structurizr"),
            encoding: "utf-8",
        }).trim();
    } catch {
        return "unknown";
    }
}

if (!existsSync(UPSTREAM)) {
    process.stderr.write(
        "The Structurizr submodule is not checked out. Run:\n\n" +
            "    git submodule update --init --recursive\n",
    );
    process.exit(1);
}

const paths = await referencedPaths();

// Every source is resolved before anything is deleted. This check used to live
// inside the copy loop, below the `rm` — so a path the source referenced but
// upstream did not have exited 1 with the vendor tree already gone, leaving a
// checkout that could not build and no way back but git.
const missing = paths.filter((path) => !existsSync(resolve(UPSTREAM, path)));
if (missing.length > 0) {
    process.stderr.write(
        `Referenced by the source but missing upstream:\n${missing
            .map((path) => `    ${path}\n`)
            .join("")}\nvendor/ has not been touched.\n`,
    );
    process.exit(1);
}

// Rebuilt from empty so that a file the source no longer imports stops being
// shipped, rather than lingering because nothing ever deletes it.
await rm(VENDOR, { recursive: true, force: true });

let bytes = 0;
for (const path of paths) {
    const from = resolve(UPSTREAM, path);
    const to = resolve(VENDOR, path);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    bytes += (await readFile(from)).byteLength;
}

await copyFile(UPSTREAM_LICENSE, resolve(VENDOR, "LICENSE"));

const revision = upstreamRevision();
await writeFile(
    resolve(VENDOR, "README.md"),
    `# Vendored Structurizr assets

Do not edit these files. They are copied verbatim from
[structurizr/structurizr](https://github.com/structurizr/structurizr) by
\`scripts/sync-vendor.js\`, which takes exactly the files the build imports and
nothing else.

Upstream commit: \`${revision}\`
Upstream path: \`structurizr-application/src/main/resources/static/static\`
License: Apache 2.0, reproduced in \`LICENSE\`. The icons under
\`bootstrap-icons/\` are [Bootstrap Icons](https://icons.getbootstrap.com), MIT.

They are committed rather than pulled from the submodule at build time because
neither npm nor pnpm fetches submodules for a git dependency, so
\`npx --package=github:FormulaMonks/renderizr\` would otherwise have nothing to
render with.

## Refreshing

\`\`\`bash
git submodule update --init --remote submodules/structurizr
pnpm sync:vendor
\`\`\`
`,
);

process.stdout.write(
    `Vendored ${paths.length} files (${Math.round(bytes / 1024)}KB) from ${revision.slice(0, 8)} into ${relative(process.cwd(), VENDOR)}\n`,
);
