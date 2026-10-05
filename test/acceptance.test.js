/**
 * The acceptance harness (spec 15, ADR 11): every view of every workspace in
 * the acceptance set, drawn by the React Flow engine in headless Chrome and
 * held to the geometry rules through the engine report, with no pixels
 * compared. The contact sheet (`test/contact-sheet.js`) covers what only a
 * person can judge.
 *
 * Each workspace is built once as a single file with the report flag on;
 * each view is opened at its own URL, one Chrome at a time, so the wall-clock
 * time to the document, less what Chrome takes to start, is that view's alone
 * (`renderPage`, `launchCost`). `pnpm test` runs this file by itself, after
 * the other test files, which `node --test` runs side by side: their builds
 * and Chromes would otherwise share the runner with the timed views.
 *
 * Skips with a reason when Chrome is missing, and per workspace when the
 * Structurizr submodule is.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import {
    ACCEPTANCE_SET,
    buildForAcceptance,
    missingReason,
    prepareWorkspace,
    viewKeys,
    viewUrl,
} from "./support/acceptance.js";
import { findChrome, launchCost, renderPage } from "./support/browser.js";
import { parseDocument } from "./support/dom.js";
import {
    avoidsElements,
    edgeEndsOnOutlines,
    elementsInsideBoundaries,
    expectedDrawing,
    noOverlappingBoundaries,
    noOverlappingElements,
    readyInTime,
    sameBoundariesAsResolved,
    sameElementsAndEdgesAsResolved,
    storedElementsInPlace,
    unexpectedLogs,
} from "./support/engine-checks.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");

const CHROME = findChrome();
const NO_CHROME = CHROME
    ? false
    : "no Chrome or Chromium on this machine; set CHROME_PATH to run the browser tests";

const SCRATCH = await mkdtemp(join(tmpdir(), "renderizr-acceptance-"));
after(() => rm(SCRATCH, { recursive: true, force: true }));

/**
 * Spec 15.2: an ordinary acceptance view is painted within 2 s. An entry of
 * the set can allow more with `readyWithinMs`, as the large fixture does.
 */
const READY_WITHIN_MS = 2000;

/**
 * How many times a view over the limit is opened in all before it counts as
 * slow. A CI runner now and then takes a second longer to start one Chrome,
 * which no view can help; a slow view is slow every time.
 */
const TIMED_RUNS = 3;

/**
 * Console lines the engine is allowed to write: the warnings the spec asks
 * for, and nothing else.
 */
const KNOWN_WARNINGS = [
    // Spec 10.6: a relationship ending at a boundary is skipped.
    /^Relationship .* ends at a boundary/,
    // Spec 7.2: every unplaced element placed around a stored layout is named.
    /^Placed unplaced element /,
    // Spec 12, 13: an image view drawn as its placeholder logs why.
    /^Image view ".*": /,
];

/**
 * Every check a view's report is held to. `pending(expected)` gives a todo
 * reason, naming the ticket that closes the gap, for the views the engine
 * cannot meet it in yet, or false: the check still runs and reports, as a
 * todo, so a gap that closes early shows up as a passing todo rather than
 * going unnoticed. Every gap is closed today.
 */
const CHECKS = [
    {
        name: "draws exactly the elements and edges resolveView says",
        check: ({ report, expected }) =>
            sameElementsAndEdgesAsResolved(report, expected),
        pending: () => false,
    },
    {
        name: "draws exactly the boundaries resolveView says",
        check: ({ report, expected }) =>
            sameBoundariesAsResolved(report, expected),
        pending: () => false,
    },
    {
        name: "keeps stored elements at their stored position and size",
        check: ({ report, expected }) =>
            storedElementsInPlace(report, expected),
        pending: () => false,
    },
    {
        name: "draws no overlapping elements",
        check: ({ report, expected }) =>
            noOverlappingElements(report, expected),
        pending: () => false,
    },
    {
        name: "keeps every element inside its boundary",
        check: ({ report, expected }) =>
            elementsInsideBoundaries(report, expected),
        pending: () => false,
    },
    {
        name: "draws no boundary over a sibling or an element outside it",
        check: ({ report, expected }) =>
            noOverlappingBoundaries(report, expected),
        pending: () => false,
    },
    {
        name: "starts and ends every edge on its elements' outlines",
        check: ({ report }) => edgeEndsOnOutlines(report),
        pending: () => false,
    },
    {
        name: "routes every edge without vertices around other elements",
        check: ({ report }) => avoidsElements(report),
        pending: () => false,
    },
    {
        name: "logs nothing beyond the known warnings",
        check: ({ console }) => unexpectedLogs(console, KNOWN_WARNINGS),
        pending: () => false,
    },
];

/** Chrome's own share of every `renderPage`, measured once, when first asked. */
let launch;
const chromeLaunch = () => {
    launch ??= launchCost(CHROME);
    return launch;
};

/**
 * Open one view and read back its canvas, its report, the console, and how
 * long the view took to arrive in wall-clock time, Chrome's start aside. A
 * view over the limit is opened again, up to `TIMED_RUNS` times, and the
 * fastest run is the one read, as `launchCost` takes the least of its runs.
 */
async function drawView(site, key, readyWithin) {
    // Measured before the first view opens, so that view is not the one to
    // pay for Chrome's cold start, which `launchCost` would not take off.
    const launched = await chromeLaunch();
    let page;
    for (let run = 0; run < TIMED_RUNS; run++) {
        const next = await renderPage(CHROME, viewUrl(site, key), {
            offline: true,
        });
        if (!page || next.elapsed < page.elapsed) page = next;
        if (page.elapsed - launched <= readyWithin) break;
    }
    const document = parseDocument(page.html);
    const root = document.querySelector(
        "#structurizr-diagram-target [data-view-key]",
    );
    const script = document.querySelector("#engine-report");
    return {
        viewKey: root?.getAttribute("data-view-key") ?? null,
        ready: root?.getAttribute("data-ready") === "true",
        readyIn: page.elapsed - launched,
        report: script ? JSON.parse(script.textContent) : null,
        console: page.console,
    };
}

for (const entry of ACCEPTANCE_SET) {
    const skip = NO_CHROME || missingReason(entry);
    const workspace = skip ? null : prepareWorkspace(entry);
    const keys = workspace ? viewKeys(workspace) : [];
    const model = workspace ? new WorkspaceModel(workspace) : null;
    const readyWithin = entry.readyWithinMs ?? READY_WITHIN_MS;

    // Built and rendered once, the first time a test of this workspace asks.
    let drawn;
    const draw = () => {
        drawn ??= buildForAcceptance(workspace, join(SCRATCH, entry.name), {
            report: true,
        }).then(async (site) => {
            // One at a time: Chromes beside each other slow each other down,
            // and the wall-clock time to the document is the budget.
            const views = new Map();
            for (const key of keys) {
                views.set(key, await drawView(site, key, readyWithin));
            }
            return views;
        });
        return drawn;
    };

    if (skip) {
        test(`every view of ${entry.name} is drawn as the workspace says`, {
            skip,
        });
        continue;
    }

    for (const key of keys) {
        const expected = expectedDrawing(model, key);

        test(`view ${key} of ${entry.name} is drawn as the workspace says`, async (t) => {
            const view = (await draw()).get(key);

            await t.test(`is painted within ${readyWithin} ms`, () => {
                assert.equal(
                    view.viewKey,
                    key,
                    "the canvas shows another view",
                );
                assert.ok(view.ready, "data-ready never turned true");
                assert.ok(view.report, "no #engine-report in the document");
                const slow = readyInTime(view.readyIn, readyWithin);
                assert.deepEqual(slow, [], slow.join("\n"));
            });
            if (!view.report) return;

            for (const { name, check, pending } of CHECKS) {
                await t.test(name, { todo: pending(expected) }, () => {
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
