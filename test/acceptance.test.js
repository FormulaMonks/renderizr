/**
 * The acceptance harness (spec 15, ADR 11): every view of every workspace in
 * the acceptance set, drawn by the React Flow engine in headless Chrome and
 * held to the geometry rules through the engine report, with no pixels
 * compared. The contact sheet (`test/contact-sheet.js`) covers what only a
 * person can judge.
 *
 * Each workspace is built once as a single file with the report flag on;
 * each view is opened at its own URL, so `readyAt` is the time from
 * navigation to that view being painted.
 *
 * Skips with a reason when Chrome is missing, and per workspace when the
 * Structurizr submodule is.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
    ACCEPTANCE_SET,
    buildForAcceptance,
    mapLimit,
    missingReason,
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "./support/acceptance.js";
import { findChrome, renderPage } from "./support/browser.js";
import { parseDocument } from "./support/dom.js";
import {
    avoidsElements,
    edgeEndsOnOutlines,
    elementsInsideBoundaries,
    expectedDrawing,
    noOverlappingElements,
    readyInTime,
    sameIdsAsResolved,
    storedElementsInPlace,
    unexpectedLogs,
} from "./support/engine-checks.js";
import { importSrc } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");

const CHROME = findChrome();
const NO_CHROME = CHROME
    ? false
    : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-acceptance-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

/** Spec 15.2: an ordinary acceptance view is painted within 2 s. */
const READY_WITHIN_MS = 2000;

/** How many Chromes run at once while a workspace's views are rendered. */
const BROWSERS = 4;

/**
 * Console lines the engine is allowed to write: the warnings the spec asks
 * for, and nothing else.
 */
const KNOWN_WARNINGS = [
    // Spec 10.6: a relationship ending at a boundary is skipped.
    /^Relationship .* ends at a boundary/,
    // Spec 7.2: every unplaced element placed around a stored layout is named.
    /^Placed unplaced element /,
];

/**
 * Rules the tracer cannot meet yet, each until the ticket that builds what
 * they check. The check still runs and reports, as a todo, so a gap that
 * closes early shows up as a passing todo rather than going unnoticed. Delete
 * an entry with the ticket that closes it.
 */
const PENDING = [
    {
        check: "draws exactly what resolveView says",
        when: (expected) => expected.boundaries.length > 0,
        until: "#44 draws boundaries",
    },
    {
        check: "draws no overlapping elements",
        when: (expected) => expected.layout === "automatic",
        until: "#45 lays out automatic views",
    },
    {
        check: "starts and ends every edge on its elements' outlines",
        when: (expected) => expected.layout === "automatic",
        until: "#45 lays out automatic views",
    },
    {
        check: "routes every edge without vertices around other elements",
        when: (expected) => expected.layout !== "stored",
        until: "#45 and #46 lay out and route the view",
    },
];

const pending = (check, expected) =>
    PENDING.find((gap) => gap.check === check && gap.when(expected))?.until ??
    false;

/** Every check a view's report is held to, as `[name, problems]` pairs. */
const CHECKS = [
    [
        "draws exactly what resolveView says",
        ({ report, expected }) => sameIdsAsResolved(report, expected),
    ],
    [
        "keeps stored elements at their stored position and size",
        ({ report, expected }) => storedElementsInPlace(report, expected),
    ],
    [
        "draws no overlapping elements",
        ({ report, expected }) =>
            expected.layout === "automatic"
                ? noOverlappingElements(report)
                : [],
    ],
    [
        "keeps every element inside its boundary",
        ({ report }) => elementsInsideBoundaries(report),
    ],
    [
        "starts and ends every edge on its elements' outlines",
        ({ report }) => edgeEndsOnOutlines(report),
    ],
    [
        "routes every edge without vertices around other elements",
        ({ report }) => avoidsElements(report),
    ],
    [
        "logs nothing beyond the known warnings",
        ({ console }) => unexpectedLogs(console, KNOWN_WARNINGS),
    ],
];

/** Open one view and read back its canvas, its report and the console. */
async function drawView(site, key) {
    const page = await renderPage(CHROME, viewUrl(site, key));
    const document = parseDocument(page.html);
    const root = document.querySelector(
        "#structurizr-diagram-target [data-view-key]",
    );
    const script = document.querySelector("#engine-report");
    return {
        viewKey: root?.getAttribute("data-view-key") ?? null,
        ready: root?.getAttribute("data-ready") === "true",
        report: script ? JSON.parse(script.textContent) : null,
        console: page.console,
    };
}

for (const entry of ACCEPTANCE_SET) {
    const skip = NO_CHROME || missingReason(entry);
    const workspace = skip ? null : prepareWorkspace(entry);
    const keys = workspace ? viewKeys(workspace) : [];
    const model = workspace ? new WorkspaceModel(workspace) : null;

    // Built and rendered once, the first time a test of this workspace asks.
    let drawn;
    const draw = () => {
        drawn ??= buildForAcceptance(workspace, join(SCRATCH, entry.name), {
            engine: "react-flow",
            report: true,
        }).then(async (site) => {
            const views = await mapLimit(keys, BROWSERS, (key) =>
                drawView(site, key),
            );
            return new Map(keys.map((key, at) => [key, views[at]]));
        });
        return drawn;
    };

    if (skip) {
        test(`${entry.name}: every view is drawn as the workspace says`, {
            skip,
        });
        continue;
    }

    for (const key of keys) {
        const expected = expectedDrawing(model, key);

        test(`${entry.name}, view ${key}`, async (t) => {
            const view = (await draw()).get(key);

            await t.test(`is painted within ${READY_WITHIN_MS} ms`, () => {
                assert.equal(
                    view.viewKey,
                    key,
                    "the canvas shows another view",
                );
                assert.ok(view.ready, "data-ready never turned true");
                assert.ok(view.report, "no #engine-report in the document");
                assert.deepEqual(readyInTime(view.report, READY_WITHIN_MS), []);
            });
            if (!view.report) return;

            for (const [name, check] of CHECKS) {
                await t.test(name, { todo: pending(name, expected) }, () => {
                    const problems = check({ ...view, expected });
                    assert.deepEqual(
                        problems,
                        [],
                        `${entry.name}, view ${key}:\n  ${problems.join("\n  ")}`,
                    );
                });
            }
        });
    }
}
