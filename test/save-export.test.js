/**
 * The page's side of an export (ADR 21): the file name it gives the export
 * the engine builds, and how it saves it inside and outside a Claude
 * artifact, from `src/components/save-export.ts`.
 */

import assert from "node:assert/strict";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { window } = dom;

const { exportFileName, exportSaver, saveWithLink } = await importSrc(
    "components/save-export",
);

/** What the reader sees, and the name the export takes. */
const NAMES = [
    [
        { workspace: "Big Bank plc", view: "SystemContext", format: "png" },
        "big-bank-plc-system-context.png",
    ],
    [
        {
            workspace: "Big Bank plc",
            view: "SignIn",
            step: 2,
            scheme: "dark",
            format: "svg",
        },
        "big-bank-plc-sign-in-step-2-dark.svg",
    ],
    [
        {
            workspace: "Big Bank plc",
            view: "SignIn",
            step: null,
            scheme: "light",
            format: "png",
        },
        "big-bank-plc-sign-in.png",
    ],
    [
        {
            workspace: "Big Bank plc",
            view: "Containers",
            scheme: "dark",
            format: "png",
        },
        "big-bank-plc-containers-dark.png",
    ],
    [
        { workspace: "Acme", view: "APIApplication-Components", format: "svg" },
        "acme-api-application-components.svg",
    ],
    [
        { workspace: "  Café  Ünïcode!! ", view: "view_1 key", format: "png" },
        "cafe-unicode-view-1-key.png",
    ],
    [
        { workspace: "", view: "Landscape", format: "png" },
        "workspace-landscape.png",
    ],
    [
        { workspace: "日本", view: "SystemLandscape2", format: "svg" },
        "workspace-system-landscape2.svg",
    ],
];

test("an export is named for its workspace, view, step and scheme", () => {
    for (const [input, expected] of NAMES) {
        assert.equal(exportFileName(input), expected, JSON.stringify(input));
    }
});

/* ------------------------------------------------------------ the saver */

/**
 * Runs `body` inside a stand-in artifact viewer: `window.claude` grants
 * `downloads` as `granted` (a stub, or null for an artifact that did not
 * declare it) and records every capability the page asks for.
 */
async function inArtifact(granted, body) {
    const asked = [];
    window.claude = {
        use: (name) => {
            asked.push(name);
            return Promise.resolve(granted);
        },
    };
    try {
        await body(asked);
    } finally {
        window.claude = undefined;
    }
}

/** A stub `downloads` that records each file and settles as `outcome` says. */
function stubDownloads(outcome = () => Promise.resolve()) {
    const files = [];
    return {
        files,
        save(file) {
            files.push(file);
            return outcome(file);
        },
    };
}

test("outside an artifact, an export saves through a link", async () => {
    assert.equal(window.claude, undefined);
    assert.equal(await exportSaver(), saveWithLink);
});

test("inside an artifact without downloads, nothing can save an export", async () => {
    await inArtifact(null, async (asked) => {
        assert.equal(await exportSaver(), null);
        assert.deepEqual(asked, ["downloads"]);
    });
});

test("inside an artifact whose viewer fails to answer, nothing can save an export", async () => {
    window.claude = { use: () => Promise.reject(new Error("gone")) };
    try {
        assert.equal(await exportSaver(), null);
    } finally {
        window.claude = undefined;
    }
});

test("inside an artifact with downloads, an export saves through it", async () => {
    const downloads = stubDownloads();
    await inArtifact(downloads, async () => {
        const save = await exportSaver();
        assert.notEqual(save, saveWithLink);
        const blob = new Blob(["<svg/>"]);
        await save(blob, "acme-landscape.svg");
        assert.deepEqual(downloads.files, [
            { filename: "acme-landscape.svg", data: blob },
        ]);
    });
});

test("a save the reader declines settles quietly", async () => {
    const downloads = stubDownloads(() =>
        Promise.reject(Object.assign(new Error("no"), { code: "declined" })),
    );
    await inArtifact(downloads, async () => {
        const save = await exportSaver();
        assert.equal(
            await save(new Blob(["png"]), "acme-landscape.png"),
            undefined,
        );
    });
});

test("a save the viewer refuses for any other reason fails", async () => {
    const refusal = { code: "rate_limited" };
    const downloads = stubDownloads(() => Promise.reject(refusal));
    await inArtifact(downloads, async () => {
        const save = await exportSaver();
        await assert.rejects(
            save(new Blob(["png"]), "acme-landscape.png"),
            (error) => error === refusal,
        );
    });
});
