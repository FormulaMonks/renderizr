/**
 * The page's side of an export (ADR 21): the file name it gives the export
 * the engine builds, from `src/components/save-export.ts`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { exportFileName } = await importSrc("components/save-export");

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
