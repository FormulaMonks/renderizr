/**
 * Where the engine report (`report.ts`) lives in the page: a
 * `<script type="application/json" id="engine-report">` written once the view
 * is painted. Chrome's `--dump-dom` carries it out of the page, so the
 * acceptance harness reads it without a DevTools Protocol client (spec 15.1).
 *
 * Only a build made with `RENDERIZR_ENGINE_REPORT=1` calls these; everywhere
 * else the calls are compiled out (`__RENDERIZR_ENGINE_REPORT__`).
 */

import type { EngineReport } from "./report";

/** The id of the script element the report is written into. */
export const REPORT_ID = "engine-report";

/**
 * Write `report` into the document, replacing the previous view's. `<` is
 * escaped so that no name in the workspace can close the element early when
 * the dumped document is parsed again.
 */
export function writeReport(document: Document, report: EngineReport) {
    let script = document.getElementById(REPORT_ID);
    if (!script) {
        script = document.createElement("script");
        script.setAttribute("id", REPORT_ID);
        script.setAttribute("type", "application/json");
        document.body.appendChild(script);
    }
    script.textContent = JSON.stringify(report).replace(/</g, "\\u003c");
}

/** Take the report out of the document, as the engine unmounts. */
export function removeReport(document: Document) {
    document.getElementById(REPORT_ID)?.remove();
}
