/**
 * `scripts/sync-vendor.js` — the script that copies the handful of Structurizr
 * files the build reads out of the 76MB submodule and into the committed
 * `vendor/` tree.
 *
 * Nothing else in the suite tests it, yet `plugins.test.js` asserts that every
 * name in `RENDERER_FILES` exists under `vendor/` — that is an assertion about
 * this script's output. So it is tested here, and against a synthetic tree
 * rather than the real repository: the script deletes `vendor/` before
 * rebuilding it, and it must be testable on a clone whose submodule was never
 * initialized.
 *
 * The trick is that the script derives its root from `import.meta.url`, so a
 * copy of it in a scratch directory roots itself there. The scratch tree gets
 * a `node_modules` symlink (the script's import chain reaches Vite) and a
 * `package.json` declaring ESM, and is then a complete little world.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
    copyFile,
    mkdir,
    readFile,
    readdir,
    realpath,
    symlink,
    writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { REPO_ROOT, withTempDir } from "./__fixtures__/helpers.js";

const run = promisify(execFile);

/** Files the script has to copy without any source spelling them out. */
const IMPLICIT = [
    "js/structurizr.js",
    "js/structurizr-util.js",
    "js/structurizr-ui.js",
    "js/structurizr-workspace.js",
    "js/structurizr-diagram.js",
];

const UPSTREAM_SUBPATH =
    "submodules/structurizr/structurizr-application/src/main/resources/static/static";

const write = async (path, contents) => {
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, contents);
};

/**
 * Build a scratch repository around a copy of `sync-vendor.js`.
 *
 * `upstream` maps a path under the submodule's static directory to its
 * contents; `sources` maps a path under `src/` to a file that may reference
 * `vendor/structurizr/...`. Pass `submodule: false` to leave the submodule
 * uninitialized.
 */
async function scratchRepo(
    dir,
    { upstream = {}, sources = {}, submodule = true } = {},
) {
    await write(join(dir, "package.json"), '{ "type": "module" }\n');
    await symlink(
        join(REPO_ROOT, "node_modules"),
        join(dir, "node_modules"),
        "dir",
    );

    await mkdir(join(dir, "scripts"), { recursive: true });
    for (const file of ["sync-vendor.js", "plugins.js", "escapes.js"]) {
        await copyFile(
            join(REPO_ROOT, "scripts", file),
            join(dir, "scripts", file),
        );
    }

    await mkdir(join(dir, "src"), { recursive: true });
    for (const [path, contents] of Object.entries(sources)) {
        await write(join(dir, "src", path), contents);
    }

    if (submodule) {
        await write(
            join(dir, "submodules/structurizr/LICENSE"),
            "APACHE 2.0 TEXT\n",
        );
        for (const [path, contents] of Object.entries(upstream)) {
            await write(join(dir, UPSTREAM_SUBPATH, path), contents);
        }
    }

    return dir;
}

/** Every file under `dir`, as `/`-joined paths relative to it. */
async function tree(dir) {
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
        entries.map(async (entry) =>
            entry.isDirectory()
                ? (await tree(join(dir, entry.name))).map(
                      (p) => `${entry.name}/${p}`,
                  )
                : [entry.name],
        ),
    );
    return nested.flat().sort();
}

async function sync(dir, env = {}) {
    try {
        const { stdout, stderr } = await run(
            process.execPath,
            [join(dir, "scripts/sync-vendor.js")],
            { cwd: dir, env: { ...process.env, ...env } },
        );
        return { code: 0, stdout, stderr };
    } catch (error) {
        return {
            code: error.code ?? 1,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? "",
        };
    }
}

/**
 * Stop `git rev-parse` from walking out of the scratch tree. Without this the
 * "no git checkout" test would pick up whatever repository happens to contain
 * the system temp directory.
 */
const sealedFromGit = async (dir) => ({
    GIT_CEILING_DIRECTORIES: await realpath(dir),
});

/** The five renderer files, with just enough content to be distinguishable. */
const rendererFiles = () =>
    Object.fromEntries(IMPLICIT.map((path) => [path, `// ${path}\n`]));

/* --------------------------------------------------------- what gets copied */

test("the file list is derived from the source, not maintained in the script", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, {
            sources: {
                "app.ts": [
                    'import icon from "../vendor/structurizr/bootstrap-icons/gear.svg?raw";',
                    'import "../vendor/structurizr/css/structurizr.css";',
                ].join("\n"),
            },
            upstream: {
                ...rendererFiles(),
                "bootstrap-icons/gear.svg": "<svg/>",
                "css/structurizr.css": "body{}",
                "css/unreferenced.css": "nobody{}",
                "js/unreferenced.js": "// nobody",
            },
        });

        const { code, stdout, stderr } = await sync(dir);
        assert.equal(code, 0, stderr);

        assert.deepEqual(
            await tree(join(dir, "vendor/structurizr")),
            [
                "LICENSE",
                "README.md",
                "bootstrap-icons/gear.svg",
                "css/structurizr.css",
                ...IMPLICIT.map((p) => p).sort(),
            ].sort(),
        );

        assert.match(stdout, /Vendored 7 files/);
    });
});

test("the five renderer files are copied even though no source names them", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { upstream: rendererFiles() });

        const { code, stderr } = await sync(dir);
        assert.equal(code, 0, stderr);

        for (const path of IMPLICIT) {
            assert.ok(
                existsSync(join(dir, "vendor/structurizr", path)),
                `${path} was not vendored`,
            );
        }
    });
});

test("a reference is only followed when it ends in .css, .js or .svg", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, {
            sources: {
                "app.ts": [
                    'const dir = "vendor/structurizr/js/";',
                    'const doc = "vendor/structurizr/notes.txt";',
                    'const real = "vendor/structurizr/css/keep.css";',
                ].join("\n"),
            },
            upstream: {
                ...rendererFiles(),
                "css/keep.css": "a{}",
                "notes.txt": "ignored",
            },
        });

        const { code, stderr } = await sync(dir);
        assert.equal(code, 0, stderr);

        assert.ok(existsSync(join(dir, "vendor/structurizr/css/keep.css")));
        assert.ok(!existsSync(join(dir, "vendor/structurizr/notes.txt")));
    });
});

test("references in scripts/ count too, not just src/", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, {
            upstream: { ...rendererFiles(), "css/from-scripts.css": "a{}" },
        });
        await write(
            join(dir, "scripts/extra.js"),
            'export const sheet = "vendor/structurizr/css/from-scripts.css";\n',
        );

        const { code, stderr } = await sync(dir);
        assert.equal(code, 0, stderr);

        assert.ok(
            existsSync(join(dir, "vendor/structurizr/css/from-scripts.css")),
        );
    });
});

test("the tree is rebuilt from empty, so a file nothing imports stops shipping", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { upstream: rendererFiles() });
        await write(
            join(dir, "vendor/structurizr/js/stale.js"),
            "// removed upstream",
        );
        await write(join(dir, "vendor/structurizr/leftover.svg"), "<svg/>");

        const { code, stderr } = await sync(dir);
        assert.equal(code, 0, stderr);

        assert.ok(!existsSync(join(dir, "vendor/structurizr/js/stale.js")));
        assert.ok(!existsSync(join(dir, "vendor/structurizr/leftover.svg")));
    });
});

test("the copies are byte-for-byte", async () => {
    await withTempDir(async (dir) => {
        const body = "// structurizr.js\nvar structurizr = {};\n";
        await scratchRepo(dir, {
            upstream: { ...rendererFiles(), "js/structurizr.js": body },
        });

        assert.equal((await sync(dir)).code, 0);
        assert.equal(
            await readFile(
                join(dir, "vendor/structurizr/js/structurizr.js"),
                "utf-8",
            ),
            body,
        );
    });
});

/* ------------------------------------------------------- license and notice */

test("the upstream LICENSE is copied next to the files it covers", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { upstream: rendererFiles() });

        assert.equal((await sync(dir)).code, 0);
        assert.equal(
            await readFile(join(dir, "vendor/structurizr/LICENSE"), "utf-8"),
            "APACHE 2.0 TEXT\n",
        );
    });
});

test("a README records the provenance of the copy", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { upstream: rendererFiles() });

        assert.equal((await sync(dir)).code, 0);
        const readme = await readFile(
            join(dir, "vendor/structurizr/README.md"),
            "utf-8",
        );

        assert.match(readme, /Do not edit these files/);
        assert.match(readme, /scripts\/sync-vendor\.js/);
        assert.match(readme, /Upstream commit: `\w+`/);
        assert.match(readme, /License: Apache 2\.0/);
        assert.match(readme, /pnpm sync:vendor/);
    });
});

test("the recorded commit is the submodule's HEAD when there is one", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { upstream: rendererFiles() });

        const submodule = join(dir, "submodules/structurizr");
        const git = (...args) =>
            run("git", ["-c", "user.email=t@t", "-c", "user.name=T", ...args], {
                cwd: submodule,
            });
        await git("init", "-q");
        await git("add", "-A");
        await git("commit", "-q", "-m", "vendor fixture");
        const { stdout: head } = await git("rev-parse", "HEAD");

        assert.equal((await sync(dir)).code, 0);
        const readme = await readFile(
            join(dir, "vendor/structurizr/README.md"),
            "utf-8",
        );

        assert.ok(
            readme.includes(`Upstream commit: \`${head.trim()}\``),
            `README does not name ${head.trim()}`,
        );
    });
});

test("without a git checkout the commit is recorded as unknown rather than crashing", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { upstream: rendererFiles() });

        const { code, stdout } = await sync(dir, await sealedFromGit(dir));
        assert.equal(code, 0);

        const readme = await readFile(
            join(dir, "vendor/structurizr/README.md"),
            "utf-8",
        );
        assert.ok(readme.includes("Upstream commit: `unknown`"), readme);
        assert.match(stdout, /from unknown /);
    });
});

/* -------------------------------------------------------------- failure modes */

test("an uninitialized submodule fails with the command that fixes it", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, { submodule: false });

        const { code, stderr } = await sync(dir);

        assert.equal(code, 1);
        assert.match(stderr, /submodule is not checked out/);
        assert.match(stderr, /git submodule update --init --recursive/);
        assert.ok(!existsSync(join(dir, "vendor/structurizr")));
    });
});

test("a referenced file that is missing upstream fails and names the path", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, {
            sources: {
                "app.ts": 'import "../vendor/structurizr/css/gone.css";',
            },
            upstream: rendererFiles(),
        });

        // Seed a vendor tree, so the failure has something to destroy.
        await mkdir(join(dir, "vendor/structurizr"), { recursive: true });
        await writeFile(join(dir, "vendor/structurizr/keep.js"), "// keep me");

        const { code, stderr } = await sync(dir);

        assert.equal(code, 1);
        assert.match(stderr, /Referenced by the source but missing upstream/);
        assert.match(stderr, /css\/gone\.css/);
        // The whole point of resolving every path before deleting anything: a
        // sync that cannot finish must leave the checkout buildable.
        assert.match(stderr, /vendor\/ has not been touched/);
        assert.ok(
            existsSync(join(dir, "vendor/structurizr/keep.js")),
            "a failed sync deleted the vendor tree it could not rebuild",
        );
    });
});

test("a missing renderer file fails even though nothing imports it by name", async () => {
    await withTempDir(async (dir) => {
        const upstream = Object.fromEntries(
            Object.entries(rendererFiles()).filter(
                ([path]) => path !== "js/structurizr-diagram.js",
            ),
        );
        await scratchRepo(dir, { upstream });

        const { code, stderr } = await sync(dir);

        assert.equal(code, 1);
        assert.match(stderr, /missing upstream/);
        assert.match(stderr, /js\/structurizr-diagram\.js/);
    });
});

test("a vendor path written only as a test fixture is not treated as a reference", async () => {
    await withTempDir(async (dir) => {
        await scratchRepo(dir, {
            sources: {
                // Reads exactly like an import to a regex, and does not exist
                // upstream. Scanning it aborted every sync — after the delete.
                "app.test.ts":
                    'const sheet = "vendor/structurizr/css/phantom.css";',
            },
            upstream: rendererFiles(),
        });

        const { code, stderr } = await sync(dir);

        assert.equal(code, 0, stderr);
        assert.ok(
            !existsSync(join(dir, "vendor/structurizr/css/phantom.css")),
            "a fixture path was vendored as though the app imported it",
        );
    });
});

/* ------------------------------------------------- the real tree it produced */

test("the committed vendor tree matches what the script promises", async () => {
    const vendor = join(REPO_ROOT, "vendor/structurizr");

    assert.ok(existsSync(join(vendor, "LICENSE")), "vendor/ has no LICENSE");
    assert.ok(existsSync(join(vendor, "README.md")), "vendor/ has no README");

    const readme = await readFile(join(vendor, "README.md"), "utf-8");
    assert.match(readme, /Upstream commit: `\w+`/);

    for (const path of IMPLICIT) {
        assert.ok(existsSync(join(vendor, path)), `vendor/ is missing ${path}`);
    }
});
