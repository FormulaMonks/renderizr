/**
 * The toolbar title (`CurrentView`) and the view drawer
 * (`DiagramNavigation`) read view lists and titles from the typed workspace
 * model in `src/model/`, not from the vendored renderer's globals.
 *
 * No `structurizr` global exists in this file, so a component still reaching
 * for `structurizr.ui.getTitleForView` throws here.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { default: DiagramNavigation } = await importSrc(
    "components/diagram-navigation",
);
const { default: CurrentView } = await importSrc("components/current-view");

const { document } = dom;

const model = new WorkspaceModel(
    JSON.parse(
        readFileSync(
            new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
            "utf-8",
        ),
    ),
);

/** Just enough of the vendored diagram for the chrome to drive it. */
function stubDiagram() {
    let current = null;
    return {
        changeView: (key) => {
            current = { key };
        },
        getCurrentView: () => current,
        isDarkMode: () => false,
        setDarkMode: () => {},
        toggleDescription: () => {},
        toggleMetadata: () => {},
        currentViewHasAnimation: () => false,
        currentViewIsDynamic: () => false,
        animationStarted: () => false,
        onAnimationStarted: () => {},
        onAnimationStopped: () => {},
        stopAnimation: () => {},
    };
}

test("the drawer lists the model's views with their titles", () => {
    const element = document.createElement("nav");
    const drawer = new DiagramNavigation(element, stubDiagram(), model);
    drawer.render();

    const items = [...element.querySelectorAll("li[data-viewkey]")];
    assert.deepEqual(
        items.map((item) => item.dataset.viewkey),
        model.getViews().map((view) => view.key),
    );
    assert.equal(
        items[2].querySelector("button").getAttribute("aria-label"),
        "Container View: Internet Banking System (#Containers)",
    );
    // A bracketed kind is dropped; the icon already says it.
    assert.equal(
        element
            .querySelector(
                'li[data-viewkey="MainframeBankingSystemFacade"] button',
            )
            .getAttribute("aria-label"),
        "Mainframe Banking System Facade (#MainframeBankingSystemFacade)",
    );
    drawer.clear();
});

test("the toolbar titles the current view from the model", () => {
    const element = document.createElement("section");
    const toolbar = new CurrentView(
        element,
        stubDiagram(),
        { fit() {}, zoomIn() {}, zoomOut() {} },
        model,
    );

    toolbar.render(model.findViewByKey("Components"));
    assert.equal(
        element.querySelector("h2").textContent,
        "Component View: Internet Banking System - API Application",
    );

    toolbar.render(model.findViewByKey("MainframeBankingSystemFacade"));
    const heading = element.querySelector("h2");
    assert.match(heading.textContent, /^Mainframe Banking System Facade/);
    assert.match(heading.querySelector("span").textContent, /^Code$/);
    toolbar.clear();
});
