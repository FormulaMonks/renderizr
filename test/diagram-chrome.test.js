/**
 * The toolbar (`CurrentView`) and the view drawer (`DiagramNavigation`) read
 * view lists and titles from the typed workspace model in `src/model/` and
 * drive the engine through its contract.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/index");
const { default: DiagramNavigation } = await importSrc(
    "components/diagram-navigation",
);
const { default: CurrentView, DIAGRAM_THEME_STORAGE_KEY } = await importSrc(
    "components/current-view",
);
const theme = await importSrc("components/theme");

const { document, window } = dom;

const model = new WorkspaceModel(
    JSON.parse(
        readFileSync(
            new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
            "utf-8",
        ),
    ),
);

/** Just enough of a view switcher for the drawer to drive it. */
function stubSwitcher() {
    let current = null;
    return {
        changeView: (key) => {
            current = { key };
        },
        getCurrentView: () => current,
    };
}

/**
 * The engine's animation members as the toolbar sees them, recording every
 * call; `emit` plays the engine announcing a new state.
 */
function stubAnimation(initial = { steps: 0, step: null, playing: false }) {
    const listeners = new Set();
    const calls = [];
    let state = initial;
    const record = (name) => () => calls.push(name);
    return {
        calls,
        emit(patch) {
            state = { ...state, ...patch };
            for (const listener of listeners) listener(state);
        },
        play: record("play"),
        pause: record("pause"),
        stepForward: record("stepForward"),
        stepBack: record("stepBack"),
        stop: record("stop"),
        onAnimationChanged(callback) {
            listeners.add(callback);
            callback(state);
            return () => listeners.delete(callback);
        },
        listeners,
    };
}

/**
 * The engine as the toolbar sees it: its animation members from `animation`,
 * and its setters and zoom, recording the scheme and labels it was given.
 */
function stubEngine(animation = stubAnimation()) {
    const engine = {
        ...animation,
        schemes: [],
        labels: [],
        setColorScheme: (scheme) => engine.schemes.push(scheme),
        setLabels: (labels) => engine.labels.push(labels),
        fit() {},
        zoomIn() {},
        zoomOut() {},
    };
    return engine;
}

test("the drawer lists the model's views with their titles", () => {
    const element = document.createElement("nav");
    const drawer = new DiagramNavigation(element, stubSwitcher(), model);
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
    const toolbar = new CurrentView(element, stubEngine(), model);

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

test("a filtered view is shown once, though the switcher reports its base as current", () => {
    const element = document.createElement("nav");
    const calls = [];
    // A switcher that reports a filtered view's base as current and echoes
    // every change back into the drawer.
    const diagram = {
        changeView: (key) => {
            calls.push(key);
            if (calls.length > 3) throw new Error("changeView recursed");
            drawer.changeView(key);
        },
        getCurrentView: () => ({ key: "Base" }),
    };
    const drawer = new DiagramNavigation(element, diagram, model);
    drawer.render();
    calls.length = 0; // render() opens the starting view; count from here

    drawer.changeView("Filtered");

    assert.deepEqual(calls, ["Filtered"]);
    drawer.clear();
});

/* ------------------------------------------------------------- animation */

/** A toolbar over `animation`, rendered for the dynamic Big Bank view. */
function animatedToolbar(animation) {
    const element = document.createElement("section");
    const toolbar = new CurrentView(element, stubEngine(animation), model);
    toolbar.render(model.findViewByKey("SignIn"));
    const group = element.querySelector(".animation-buttons");
    const button = (name) => element.querySelector(`.${name}`);
    return { toolbar, group, button };
}

const click = (button) => button.click();

/** A view with six steps, showing all of them. */
const SIX_STEPS = { steps: 6, step: null, playing: false };

test("the toolbar hides the animation buttons when the view has no steps", () => {
    const animation = stubAnimation();
    const { toolbar, group } = animatedToolbar(animation);
    assert.equal(group.hidden, true, "no steps, no buttons");

    animation.emit({ steps: 6 });
    assert.equal(group.hidden, false, "the buttons show once there are steps");
    toolbar.clear();
});

test("prev and next are enabled whenever the view has steps", () => {
    const { toolbar, button } = animatedToolbar(stubAnimation(SIX_STEPS));
    assert.equal(button("prev-step").disabled, false);
    assert.equal(button("next-step").disabled, false);
    toolbar.clear();
});

test("play toggles pause, from the engine's state", () => {
    const animation = stubAnimation(SIX_STEPS);
    const { toolbar, button } = animatedToolbar(animation);
    const play = button("play-animation");
    assert.equal(play.getAttribute("aria-label"), "Play animation");

    click(play);
    assert.deepEqual(animation.calls, ["play"]);
    animation.emit({ step: 1, playing: true });
    assert.equal(play.getAttribute("aria-label"), "Pause animation");
    assert.equal(play.dataset.playing, "true");

    click(play);
    assert.deepEqual(animation.calls, ["play", "pause"]);
    animation.emit({ playing: false });
    assert.equal(play.getAttribute("aria-label"), "Play animation");
    toolbar.clear();
});

test("prev and next step the engine's animation", () => {
    const animation = stubAnimation(SIX_STEPS);
    const { toolbar, button } = animatedToolbar(animation);
    click(button("next-step"));
    click(button("prev-step"));
    assert.deepEqual(animation.calls, ["stepForward", "stepBack"]);
    toolbar.clear();
});

test("changing the scheme or the labels never stops the animation", () => {
    const animation = stubAnimation({ steps: 6, step: 2, playing: true });
    const { toolbar, button } = animatedToolbar(animation);
    click(button("dark-mode"));
    click(button("toggle-description"));
    click(button("toggle-technologies"));
    assert.deepEqual(animation.calls, [], "no animation member was called");
    toolbar.clear();
});

test("clearing the toolbar stops listening to the engine", () => {
    const animation = stubAnimation();
    const { toolbar } = animatedToolbar(animation);
    toolbar.clear();
    assert.equal(animation.listeners.size, 0);
});

test("a toolbar rendered again after clear repaints the animation buttons", () => {
    const animation = stubAnimation();
    const { toolbar } = animatedToolbar(animation);
    toolbar.clear();
    toolbar.render(model.findViewByKey("SignIn"));

    animation.emit({ steps: 6 });
    const group = toolbar.element.querySelector(".animation-buttons");
    assert.equal(group.hidden, false, "the engine's new state reaches it");
    toolbar.clear();
    assert.equal(animation.listeners.size, 0, "and clear lets go again");
});

/* ----------------------------------------------------------- color scheme */

test("a toolbar rendered again after clear still follows the page theme", () => {
    // No diagram-specific choice, so the diagram follows the page.
    window.localStorage.removeItem(DIAGRAM_THEME_STORAGE_KEY);
    window.localStorage.removeItem("structurizr_cooper:darkModeDiagrams");
    theme.setMode("light");
    const engine = stubEngine();
    const element = document.createElement("section");
    const toolbar = new CurrentView(element, engine, model);
    toolbar.render(model.findViewByKey("SignIn"));
    toolbar.clear();
    toolbar.render(model.findViewByKey("SignIn"));

    theme.setMode("dark");
    assert.equal(engine.schemes.at(-1), "dark", "the diagram turns dark");
    toolbar.clear();
    theme.setMode("light");
    assert.equal(
        engine.schemes.at(-1),
        "dark",
        "a cleared toolbar no longer follows the page",
    );
});

test("the toolbar's scheme and label buttons set the engine's state", () => {
    window.localStorage.clear();
    theme.setMode("light");
    const engine = stubEngine();
    const element = document.createElement("section");
    const toolbar = new CurrentView(element, engine, model);
    toolbar.render(model.findViewByKey("SignIn"));
    const button = (name) => element.querySelector(`.${name}`);

    // Seeded from the reader's stored preferences before anything is drawn.
    assert.equal(engine.schemes.at(-1), "light");
    assert.deepEqual(engine.labels.at(-1), {
        descriptions: true,
        technologies: true,
    });

    button("dark-mode").click();
    assert.equal(engine.schemes.at(-1), "dark");
    assert.equal(button("dark-mode").getAttribute("aria-pressed"), "true");

    button("toggle-description").click();
    button("toggle-technologies").click();
    button("toggle-technologies").click();
    assert.deepEqual(engine.labels.slice(-3), [
        { descriptions: false, technologies: true },
        { descriptions: false, technologies: false },
        { descriptions: false, technologies: true },
    ]);
    assert.equal(
        button("toggle-description").getAttribute("aria-pressed"),
        "false",
    );
    toolbar.clear();
    window.localStorage.clear();
});
