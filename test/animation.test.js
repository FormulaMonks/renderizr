/**
 * Animation (spec 11): which steps a view has, what each step shows, how the
 * player moves between them, and the order check the build and the engine
 * both make (spec 13). The island's part is exercised in Chrome by
 * `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe } from "node:test";
import { validateWorkspace } from "../scripts/assets.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, animationOf, findViewError, resolveView } =
    await importSrc("model/index");
const { buildGraph } = await importSrc("engine/react-flow/graph");
const { AnimationPlayer, stepStateOf, PLAY_INTERVAL_MS } = await importSrc(
    "engine/react-flow/animation",
);

const ANIMATION = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/animation.json", import.meta.url),
        "utf-8",
    ),
);
const FRACTIONAL = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/fractional-order.json", import.meta.url),
        "utf-8",
    ),
);

const LABELS = { descriptions: true, technologies: true };

/** The animation fixture, after `edit` has changed its JSON. */
const workspace = (edit = () => {}) => {
    const json = structuredClone(ANIMATION);
    edit(json);
    return new WorkspaceModel(json);
};

const checkout = (json) => json.views.dynamicViews[0];

/* ---------------------------------------------------------- order checks */

describe("dynamic-view orders", () => {
    test("an order that isn't an integer is an error naming the view, the relationship and the order", () => {
        const model = new WorkspaceModel(structuredClone(FRACTIONAL));
        assert.equal(
            findViewError(model, "SignIn"),
            'Dynamic view "SignIn": relationship "API → Database" has order "1.1"; orders must be integers.',
        );
        assert.equal(findViewError(workspace(), "Checkout"), undefined);
    });

    const ORDERS = [
        ["1", true],
        [" 12 ", true],
        ["007", true],
        ["1.1", false],
        ["1a", false],
        ["-1", false],
        ["", false],
        ["1e3", false],
    ];
    for (const [order, valid] of ORDERS) {
        test(`order ${JSON.stringify(order)} is ${valid ? "accepted" : "refused"}`, () => {
            const model = workspace((json) => {
                checkout(json).relationships[0].order = order;
            });
            assert.equal(
                findViewError(model, "Checkout") === undefined,
                valid,
                `findViewError for order ${JSON.stringify(order)}`,
            );
        });
    }

    test("the build refuses a fractional order with the engine's message", () => {
        assert.throws(
            () => validateWorkspace(structuredClone(FRACTIONAL)),
            {
                message: findViewError(
                    new WorkspaceModel(structuredClone(FRACTIONAL)),
                    "SignIn",
                ),
            },
            "scripts/assets.js and src/model/animation.ts should say the same",
        );
        assert.doesNotThrow(() =>
            validateWorkspace(structuredClone(ANIMATION)),
        );
    });

    test("a view with a bad order draws nothing but the error", () => {
        const model = new WorkspaceModel(structuredClone(FRACTIONAL));
        const graph = buildGraph(model, "SignIn", "light", LABELS);
        assert.match(graph.error, /has order "1\.1"/);
        assert.deepEqual(graph.elements, []);
        assert.equal(graph.animation, undefined);
    });
});

/* ----------------------------------------------------------------- steps */

describe("steps", () => {
    test("a dynamic view's steps are its distinct orders, sorted as integers", () => {
        const model = workspace((json) => {
            const [first, second, third] = checkout(json).relationships;
            first.order = "10";
            second.order = "9";
            third.order = " 2";
        });
        const animation = animationOf(model, resolveView(model, "Checkout"));
        assert.equal(animation.kind, "dynamic");
        assert.deepEqual(
            animation.steps.map((step) => step.order),
            [2, 3, 4, 9, 10],
        );
    });

    test("relationships sharing an order make one step with all their ends", () => {
        const model = workspace();
        const { steps } = animationOf(model, resolveView(model, "Checkout"));
        assert.deepEqual(
            steps.map(({ order, relationships, elements }) => ({
                order,
                relationships,
                elements,
            })),
            [
                { order: 1, relationships: ["10"], elements: ["1", "3"] },
                { order: 2, relationships: ["11"], elements: ["3", "4"] },
                {
                    order: 3,
                    relationships: ["12", "13"],
                    elements: ["4", "5", "6"],
                },
                { order: 4, relationships: ["11"], elements: ["3", "4"] },
            ],
        );
    });

    test("a relationship listed twice at one order is one edge; at two orders it is two", () => {
        const model = workspace((json) => {
            checkout(json).relationships.push({
                id: "10",
                description: "Checks out again using",
                order: "1",
            });
        });
        const view = resolveView(model, "Checkout");
        assert.deepEqual(
            view.relationships.map(({ id, order }) => `${id}@${order}`),
            ["10@1", "11@2", "12@3", "13@3", "11@4", "14@undefined"],
        );
        const graph = buildGraph(model, "Checkout", "light", LABELS);
        assert.deepEqual(
            graph.edges.map((edge) => edge.key),
            ["10", "11", "12", "13", "11#1", "14"],
        );
    });

    test('orders "1" and "01" are one step, with one edge per relationship', () => {
        const model = workspace((json) => {
            checkout(json).relationships.push({
                id: "10",
                description: "Checks out again using",
                order: "01",
            });
        });
        const view = resolveView(model, "Checkout");
        assert.deepEqual(
            view.relationships.map(({ id }) => id),
            ["10", "11", "12", "13", "11", "14"],
            "relationship 10 at order 01 is the one at order 1",
        );
        const { steps } = animationOf(model, view);
        assert.deepEqual(
            steps.map((step) => step.order),
            [1, 2, 3, 4],
        );
    });

    test("a static view's malformed order falls back to the entry's place", () => {
        const model = workspace((json) => {
            json.views.containerViews[0].animations[0].order = "first";
        });
        const animation = animationOf(model, resolveView(model, "Containers"));
        assert.ok(
            animation.steps.every((step) => Number.isInteger(step.order)),
            `orders ${animation.steps.map((step) => step.order)} should all be integers`,
        );
    });

    test("a relationship without an order has no step", () => {
        const model = workspace();
        const { steps } = animationOf(model, resolveView(model, "Checkout"));
        assert.ok(
            steps.every((step) => !step.relationships.includes("14")),
            "relationship 14 has no order",
        );
    });

    test("a dynamic view with no ordered relationship does not animate", () => {
        const model = workspace((json) => {
            for (const relationship of checkout(json).relationships) {
                relationship.order = undefined;
            }
        });
        assert.equal(
            animationOf(model, resolveView(model, "Checkout")),
            undefined,
        );
    });

    test("a static view animates through its animations entries in order", () => {
        const model = workspace((json) => {
            json.views.containerViews[0].animations.reverse();
        });
        const animation = animationOf(model, resolveView(model, "Containers"));
        assert.equal(animation.kind, "static");
        assert.deepEqual(
            animation.steps.map(({ order, elements, relationships }) => ({
                order,
                elements,
                relationships,
            })),
            [
                { order: 1, elements: ["1"], relationships: [] },
                { order: 2, elements: ["3"], relationships: ["10"] },
                { order: 3, elements: ["4", "5"], relationships: ["11", "12"] },
                { order: 4, elements: ["6"], relationships: ["13", "14"] },
            ],
        );
    });

    test("a static view with one animations entry, or none, does not animate", () => {
        for (const animations of [undefined, [], [{ order: 1 }]]) {
            const model = workspace((json) => {
                json.views.containerViews[0].animations = animations;
            });
            assert.equal(
                animationOf(model, resolveView(model, "Containers")),
                undefined,
                `animations ${JSON.stringify(animations)}`,
            );
        }
    });

    test("structurizr.zoomOnAnimation turns on zooming to each step", () => {
        const model = workspace();
        const zoom = (key) => animationOf(model, resolveView(model, key)).zoom;
        assert.equal(zoom("Checkout"), true);
        assert.equal(zoom("CheckoutInPlace"), false);
        assert.equal(zoom("Containers"), false);
    });

    test("structurizr.zoomOnAnimation is read from the view, its base, then the view set", () => {
        const ZOOM = "structurizr.zoomOnAnimation";
        const zoomIn = (key, edit) => {
            const model = workspace(edit);
            return animationOf(model, resolveView(model, key)).zoom;
        };
        const viewSet = (value) => (json) => {
            json.views.configuration ??= {};
            json.views.configuration.properties = { [ZOOM]: value };
        };
        const filtered = (properties) => (json) => {
            json.views.filteredViews = [
                {
                    key: "SomeContainers",
                    baseViewKey: "Containers",
                    mode: "Exclude",
                    tags: ["Nothing"],
                    properties,
                },
            ];
        };

        assert.equal(zoomIn("Containers", viewSet("true")), true);
        assert.equal(
            zoomIn("CheckoutInPlace", viewSet("true")),
            true,
            "a view that says nothing takes the view set's",
        );
        assert.equal(
            zoomIn("Checkout", viewSet("false")),
            true,
            "the view's own true wins over the view set's false",
        );
        assert.equal(
            zoomIn("Containers", (json) => {
                viewSet("true")(json);
                json.views.containerViews[0].properties = { [ZOOM]: "false" };
            }),
            false,
            "the view's own false wins over the view set's true",
        );
        assert.equal(
            zoomIn("SomeContainers", (json) => {
                filtered({ [ZOOM]: "false" })(json);
                json.views.containerViews[0].properties = { [ZOOM]: "true" };
            }),
            false,
            "a filtered view's own false wins over its base's true",
        );
        assert.equal(
            zoomIn("SomeContainers", (json) => {
                filtered(undefined)(json);
                json.views.containerViews[0].properties = { [ZOOM]: "true" };
            }),
            true,
            "a filtered view that says nothing takes its base's",
        );
    });

    test("the graph carries the view's animation", () => {
        const model = workspace();
        const graph = buildGraph(model, "Checkout", "light", LABELS);
        assert.equal(graph.animation.steps.length, 4);
        assert.equal(
            buildGraph(model, "Containers", "light", LABELS).animation.kind,
            "static",
        );
    });
});

/* ----------------------------------------------------------- step states */

describe("step states", () => {
    const graphOf = (key, edit) =>
        buildGraph(workspace(edit), key, "light", LABELS);

    test("with no step, everything is shown", () => {
        const state = stepStateOf(graphOf("Checkout"), null);
        assert.ok(
            [
                ...Object.values(state.elements),
                ...Object.values(state.edges),
                ...Object.values(state.boundaries),
            ].every((presence) => presence === "shown"),
        );
        assert.equal(state.focus, undefined);
    });

    test("a dynamic step shows its edges and their ends, and fades the rest", () => {
        const state = stepStateOf(graphOf("Checkout"), 3);
        assert.deepEqual(state.elements, {
            1: "faded",
            3: "faded",
            4: "shown",
            5: "shown",
            6: "shown",
        });
        assert.deepEqual(state.edges, {
            10: "faded",
            11: "faded",
            12: "shown",
            13: "shown",
            "11#1": "faded",
            // No order: always shown.
            14: "shown",
        });
    });

    test("a dynamic step highlights only the edge at its order when a relationship repeats", () => {
        const state = stepStateOf(graphOf("Checkout"), 4);
        assert.equal(state.edges["11#1"], "shown");
        assert.equal(state.edges["11"], "faded");
    });

    test("boundaries never fade", () => {
        const graph = graphOf("Checkout");
        assert.ok(graph.boundaries.length > 0, "the shop is a boundary");
        for (let step = 1; step <= 4; step++) {
            const state = stepStateOf(graph, step);
            assert.ok(
                Object.values(state.boundaries).every((p) => p === "shown"),
                `step ${step}`,
            );
        }
    });

    test("a static step reveals everything up to it and hides the rest", () => {
        const graph = graphOf("Containers");
        assert.deepEqual(stepStateOf(graph, 1).elements, {
            1: "shown",
            3: "hidden",
            4: "hidden",
            5: "hidden",
            6: "hidden",
        });
        const third = stepStateOf(graph, 3);
        assert.deepEqual(third.elements, {
            1: "shown",
            3: "shown",
            4: "shown",
            5: "shown",
            6: "hidden",
        });
        assert.deepEqual(third.edges, {
            10: "shown",
            11: "shown",
            12: "shown",
            13: "hidden",
            14: "hidden",
        });
    });

    test("a static step hides edges no step lists, even between revealed elements", () => {
        const graph = graphOf("Containers", (json) => {
            json.views.containerViews[0].animations[1].relationships = [];
        });
        assert.equal(stepStateOf(graph, 2).edges["10"], "hidden");
        assert.equal(stepStateOf(graph, 2).elements["3"], "shown");
    });

    test("a boundary appears with its first revealed child, sized from all of them", () => {
        const graph = graphOf("Containers");
        const shop = graph.boundaries.find((b) => b.id === "2");
        assert.deepEqual(stepStateOf(graph, 1).boundaries, { 2: "hidden" });
        assert.deepEqual(stepStateOf(graph, 2).boundaries, { 2: "shown" });
        // Derived from Web App, API and Database, whatever is revealed.
        assert.ok(shop.x < 200 && shop.x + shop.width > 975 + 450);
        assert.ok(shop.y + shop.height > 1300 + 300);
    });

    test("the focus is the box around the step's elements", () => {
        const graph = graphOf("Checkout");
        assert.deepEqual(stepStateOf(graph, 1).focus, {
            x: 200,
            y: 0,
            width: 1200,
            height: 1000,
        });
    });
});

/* ---------------------------------------------------------------- player */

/** A clock the test moves by hand. */
function fakeClock() {
    let now = 0;
    let next = 1;
    const timers = new Map();
    return {
        setTimeout(callback, delay) {
            const id = next++;
            timers.set(id, { at: now + delay, callback });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        now: () => now,
        /** Move time on by `ms`, running every timer that comes due. */
        tick(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers.entries()]
                    .filter(([, timer]) => timer.at <= end)
                    .sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                timers.delete(due[0]);
                now = due[1].at;
                due[1].callback();
            }
            now = end;
        },
        pending: () => timers.size,
    };
}

const playerWith = (steps) => {
    const clock = fakeClock();
    const player = new AnimationPlayer(clock);
    player.load(steps);
    return { clock, player };
};

describe("player", () => {
    test("a view without steps cannot play or step", () => {
        const { player } = playerWith(0);
        player.play();
        player.stepForward();
        assert.deepEqual(player.state, {
            steps: 0,
            step: null,
            playing: false,
        });
    });

    test("next from the full view starts at step 1; prev from the full view does nothing", () => {
        const { player } = playerWith(3);
        player.stepBack();
        assert.equal(player.state.step, null);
        player.stepForward();
        assert.equal(player.state.step, 1);
    });

    test("past the last step, or back from step 1, returns to the full view", () => {
        const { player } = playerWith(2);
        player.stepForward();
        player.stepBack();
        assert.equal(player.state.step, null);
        player.stepForward();
        player.stepForward();
        player.stepForward();
        assert.equal(player.state.step, null);
    });

    test("play advances every 2 s and stops at the end", () => {
        const { clock, player } = playerWith(3);
        assert.equal(PLAY_INTERVAL_MS, 2000);
        player.play();
        assert.deepEqual(player.state, { steps: 3, step: 1, playing: true });
        clock.tick(1999);
        assert.equal(player.state.step, 1);
        clock.tick(1);
        assert.equal(player.state.step, 2);
        clock.tick(2000);
        assert.equal(player.state.step, 3);
        clock.tick(2000);
        assert.deepEqual(player.state, {
            steps: 3,
            step: null,
            playing: false,
        });
        assert.equal(clock.pending(), 0);
    });

    test("pause keeps the step, and play goes on from it", () => {
        const { clock, player } = playerWith(3);
        player.play();
        clock.tick(2000);
        player.pause();
        assert.deepEqual(player.state, { steps: 3, step: 2, playing: false });
        clock.tick(10000);
        assert.equal(player.state.step, 2);
        player.play();
        assert.equal(player.state.step, 2);
        clock.tick(2000);
        assert.equal(player.state.step, 3);
    });

    test("stop ends the animation and returns to the full view", () => {
        const { clock, player } = playerWith(3);
        player.play();
        player.stop();
        assert.deepEqual(player.state, {
            steps: 3,
            step: null,
            playing: false,
        });
        assert.equal(clock.pending(), 0);
    });

    test("loading another view's steps stops the animation", () => {
        const { player } = playerWith(3);
        player.play();
        player.load(5);
        assert.deepEqual(player.state, {
            steps: 5,
            step: null,
            playing: false,
        });
    });

    test("play holds while the page is hidden and resumes the same step's time", () => {
        const { clock, player } = playerWith(3);
        player.play();
        clock.tick(1500);
        player.setHidden(true);
        clock.tick(60000);
        assert.equal(player.state.step, 1, "no step passes while hidden");
        player.setHidden(false);
        clock.tick(499);
        assert.equal(player.state.step, 1);
        clock.tick(1);
        assert.equal(player.state.step, 2);
    });

    test("listeners hear each change, and a late one hears the current state", () => {
        const { player } = playerWith(3);
        const heard = [];
        const stop = player.onChanged((state) => heard.push(state.step));
        player.stepForward();
        player.stepForward();
        player.stepForward();
        stop();
        player.stepForward();
        assert.deepEqual(heard, [null, 1, 2, 3]);
    });
});
