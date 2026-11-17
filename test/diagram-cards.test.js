/**
 * A diagram card carries its view's title the way the diagrams page titles
 * it (spec #342, _Embedded views_). The build reads the raw workspace and
 * the page reads `WorkspaceModel`, so this pins the two to the same titles
 * for every view of the Big Bank plc workspace, untitled ones included.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { createEmbedResolver } = await import(
    "../scripts/documentation/embeds.js"
);

const BIG_BANK = () =>
    JSON.parse(
        readFileSync(
            new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
            "utf-8",
        ),
    );

/** The title the diagrams page's header shows for `view`. */
const headerTitle = (model, view) => {
    const title = model.getTitleForView(view);
    const match = title.match(/^\[([^\]]+)\]\s*(.*)$/);
    return match ? match[2].trim() || match[1] : title;
};

const unescapeHtml = (html) =>
    html
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");

for (const untitled of [false, true]) {
    test(`each card's title is the diagrams page's title${untitled ? ", for views with no title of their own" : ""}`, () => {
        const workspace = BIG_BANK();
        if (untitled) {
            for (const views of Object.values(workspace.views))
                if (Array.isArray(views))
                    for (const view of views) delete view.title;
        }
        const resolve = createEmbedResolver(structuredClone(workspace));
        const model = new WorkspaceModel(workspace);

        for (const view of model.getViews()) {
            const card = resolve(`embed:${view.key}`);
            const title = card?.match(
                /class="rz-diagram-card-title">([^<]*)</,
            )?.[1];
            assert.equal(
                unescapeHtml(title ?? ""),
                headerTitle(model, view),
                view.key,
            );
        }
    });
}
