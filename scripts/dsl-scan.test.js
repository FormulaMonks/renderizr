import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { dslReferences, holds, scanDsl, staleExports } from "./dsl-scan.js";
import { withTempDir } from "./__fixtures__/helpers.js";

/* ----------------------------------------------------------------- helpers */

/** Write `files`, each path relative to `dir`, creating folders on the way. */
async function write(dir, files) {
    for (const [name, text] of Object.entries(files)) {
        const path = join(dir, name);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, text);
    }
}

/** The scan's files, relative to `dir` and sorted, for a stable assertion. */
const relative = (dir, scan) =>
    scan.files.map((path) => path.slice(dir.length + 1)).sort();

/* ------------------------------------------------------------ the references */

const REFERENCES = [
    {
        name: "each directive that reads a file, with its path as written",
        text: [
            "workspace extends ../landscape/workspace.dsl {",
            "    !docs docs",
            "    !adrs decisions adrtools",
            "    model {",
            '        !include "shared people.dsl"',
            "        !include systems",
            "    }",
            "    !script scripts/spare.groovy",
            "}",
        ].join("\n"),
        expected: [
            { directive: "extends", path: "../landscape/workspace.dsl" },
            { directive: "docs", path: "docs" },
            { directive: "adrs", path: "decisions" },
            { directive: "include", path: "shared people.dsl" },
            { directive: "include", path: "systems" },
            { directive: "script", path: "scripts/spare.groovy" },
        ],
    },
    {
        name: "a directive in a comment reads nothing",
        text: [
            "// !include line.dsl",
            "# !include hash.dsl",
            "/* !include block.dsl",
            "   !docs block-docs */",
            "!include kept.dsl",
        ].join("\n"),
        expected: [{ directive: "include", path: "kept.dsl" }],
    },
    {
        name: "keywords read in any case",
        text: "WORKSPACE EXTENDS base.dsl {\n!Include part.dsl\n}",
        expected: [
            { directive: "extends", path: "base.dsl" },
            { directive: "include", path: "part.dsl" },
        ],
    },
    {
        name: "an inline script names no file",
        text: '!script groovy {\n    workspace.views.createDefaultViews()\n}\n!script kotlin {\n    println("hi")\n}',
        expected: [],
    },
    {
        name: "a workspace that extends nothing reads nothing",
        text: 'workspace "Name" "Description" {\n    model {\n    }\n}',
        expected: [],
    },
];

for (const { name, text, expected } of REFERENCES) {
    test(`dslReferences: ${name}`, () => {
        assert.deepEqual(
            dslReferences(text).references,
            expected,
            "the references differ",
        );
    });
}

const UNRESOLVABLE = [
    { text: `!include \${SHARED}/people.dsl`, unresolvable: true },
    { text: `!docs "\${DOCS}"`, unresolvable: true },
    {
        text: '!script groovy {\n    new File("people.csv").eachLine { }\n}',
        unresolvable: true,
    },
    {
        text: '!script kotlin {\n    Files.readAllLines(Paths.get("x"))\n}',
        unresolvable: true,
    },
    {
        text: "!script groovy {\n    workspace.views.createDefaultViews()\n}",
        unresolvable: false,
    },
    { text: "!include https://example.com/people.dsl", unresolvable: false },
    { text: "!include people.dsl", unresolvable: false },
];

for (const { text, unresolvable } of UNRESOLVABLE) {
    test(`dslReferences: ${JSON.stringify(text.split("\n")[0])} is ${unresolvable ? "" : "not "}unresolvable`, () => {
        assert.equal(dslReferences(text).unresolvable, unresolvable);
    });
}

test("dslReferences: a URL is no reference, as the dev server watches no URL", () => {
    assert.deepEqual(
        dslReferences(
            "workspace extends https://example.com/workspace.dsl {\n!include https://example.com/people.dsl\n}",
        ).references,
        [],
    );
});

/* ------------------------------------------------------------------- scanDsl */

test("a DSL depends on itself and each file it includes, transitively, relative to the file that names it", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "orders/workspace.dsl": "workspace {\n!include model/people.dsl\n}",
            "orders/model/people.dsl": "!include ../../shared/roles.dsl",
            "shared/roles.dsl": "",
            "orders/unrelated.dsl": "",
        });
        const scan = await scanDsl(join(dir, "orders/workspace.dsl"));
        assert.deepEqual(relative(dir, scan), [
            "orders/model/people.dsl",
            "orders/workspace.dsl",
            "shared/roles.dsl",
        ]);
        assert.equal(scan.unresolvable, false);
    });
});

test("overlapping !includes of a folder and a file in it count each file once", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl":
                "workspace {\n!include systems\n!include systems/orders.dsl\n!include systems/nested\n}",
            "systems/orders.dsl": "!include ../people.dsl",
            "systems/nested/payments.dsl": "",
            "systems/.hidden.dsl": "!include ../never.dsl",
            "people.dsl": "",
        });
        const scan = await scanDsl(join(dir, "workspace.dsl"));
        assert.deepEqual(relative(dir, scan), [
            "people.dsl",
            "systems",
            "systems/nested",
            "systems/nested/payments.dsl",
            "systems/orders.dsl",
            "workspace.dsl",
        ]);
    });
});

test("a workspace extends into another workspace's folder depends on that workspace's own includes", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "landscape/workspace.dsl": "workspace {\n!include model.dsl\n}",
            "landscape/model.dsl": "",
            "orders/workspace.dsl":
                "workspace extends ../landscape/workspace.dsl {\n}",
        });
        const scan = await scanDsl(join(dir, "orders/workspace.dsl"));
        assert.deepEqual(relative(dir, scan), [
            "landscape/model.dsl",
            "landscape/workspace.dsl",
            "orders/workspace.dsl",
        ]);
        assert.ok(
            holds(scan, join(dir, "landscape/model.dsl")),
            "a change to the landscape's model.dsl touches orders",
        );
    });
});

test("a shared folder no workspace holds is a dependency of each DSL that includes it", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "orders/workspace.dsl": "workspace {\n!include ../shared\n}",
            "payments/workspace.dsl": "workspace {\n!include ../shared\n}",
            "shared/people.dsl": "",
        });
        for (const team of ["orders", "payments"]) {
            const scan = await scanDsl(join(dir, team, "workspace.dsl"));
            assert.ok(
                holds(scan, join(dir, "shared/people.dsl")),
                `a change to shared/people.dsl touches ${team}`,
            );
            assert.ok(
                holds(scan, join(dir, "shared/new.dsl")),
                `a new file in shared/ touches ${team}`,
            );
        }
    });
});

test("!docs, !adrs and a !script file are dependencies, and none is read as DSL", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl":
                "workspace {\n!docs docs\n!adrs decisions\n!script spare.groovy\n}",
            "docs/01.md": "!include never.dsl",
            "decisions/0001.md": "",
            "spare.groovy": "workspace.views.createDefaultViews()",
        });
        const scan = await scanDsl(join(dir, "workspace.dsl"));
        assert.deepEqual(relative(dir, scan), [
            "decisions",
            "docs",
            "spare.groovy",
            "workspace.dsl",
        ]);
        assert.equal(scan.unresolvable, false);
        assert.ok(holds(scan, join(dir, "docs/01.md")));
    });
});

test("an unresolvable path anywhere in the includes makes the DSL unresolvable", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl": "workspace {\n!include model.dsl\n}",
            "model.dsl": `!include \${SHARED}/people.dsl`,
        });
        const scan = await scanDsl(join(dir, "workspace.dsl"));
        assert.equal(scan.unresolvable, true);
    });
});

test("a !script file that reads files of its own makes the DSL unresolvable", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl": "workspace {\n!script people.groovy\n}",
            "people.groovy": 'new File("people.csv").eachLine { }',
        });
        assert.equal(
            (await scanDsl(join(dir, "workspace.dsl"))).unresolvable,
            true,
        );
    });
});

test("a missing include is a dependency, so the file appearing touches the DSL", async () => {
    await withTempDir(async (dir) => {
        await write(dir, { "workspace.dsl": "!include later.dsl" });
        const scan = await scanDsl(join(dir, "workspace.dsl"));
        assert.ok(holds(scan, join(dir, "later.dsl")));
        assert.equal(scan.unresolvable, false);
    });
});

test("includes that loop end", async () => {
    await withTempDir(async (dir) => {
        await write(dir, {
            "workspace.dsl": "!include a.dsl",
            "a.dsl": "!include b.dsl",
            "b.dsl": "!include a.dsl\n!include workspace.dsl",
        });
        const scan = await scanDsl(join(dir, "workspace.dsl"));
        assert.deepEqual(relative(dir, scan), [
            "a.dsl",
            "b.dsl",
            "workspace.dsl",
        ]);
    });
});

/* ------------------------------------------------------------- staleExports */

test("staleExports: a change re-exports only the DSL whose dependencies hold it", () => {
    const scans = new Map([
        [
            "/w/landscape/workspace.dsl",
            {
                files: ["/w/landscape/workspace.dsl", "/w/landscape/model.dsl"],
                unresolvable: false,
            },
        ],
        [
            "/w/orders/workspace.dsl",
            {
                files: [
                    "/w/orders/workspace.dsl",
                    "/w/landscape/workspace.dsl",
                    "/w/landscape/model.dsl",
                    "/w/shared",
                ],
                unresolvable: false,
            },
        ],
        [
            "/w/payments/workspace.dsl",
            {
                files: ["/w/payments/workspace.dsl"],
                unresolvable: false,
            },
        ],
        [
            "/w/legacy/workspace.dsl",
            {
                files: ["/w/legacy/workspace.dsl"],
                unresolvable: true,
            },
        ],
    ]);
    const cases = [
        {
            changed: ["/w/landscape/model.dsl"],
            stale: [
                "/w/landscape/workspace.dsl",
                "/w/orders/workspace.dsl",
                "/w/legacy/workspace.dsl",
            ],
        },
        {
            changed: ["/w/shared/people.dsl"],
            stale: ["/w/orders/workspace.dsl", "/w/legacy/workspace.dsl"],
        },
        {
            changed: ["/w/payments/workspace.dsl", "/w/payments/notes.md"],
            stale: ["/w/payments/workspace.dsl", "/w/legacy/workspace.dsl"],
        },
        {
            changed: ["/w/landscape/model.dsl.bak"],
            stale: ["/w/legacy/workspace.dsl"],
        },
    ];
    for (const { changed, stale } of cases) {
        assert.deepEqual(
            staleExports(changed, scans),
            stale,
            `a change to ${changed.join(", ")}`,
        );
    }
});

test("staleExports: a DSL with no scan yet re-exports on any change", () => {
    assert.deepEqual(
        staleExports(["/w/a.json"], new Map([["/w/workspace.dsl", null]])),
        ["/w/workspace.dsl"],
    );
});
