/**
 * `src/model/` — the typed workspace model, style resolution and
 * `resolveView`, ported from the vendored Structurizr renderer.
 *
 * Most of it runs against the Big Bank plc workspace from the Structurizr
 * repository (`test/__fixtures__/big-bank-plc.json`, Apache-2.0), which is the
 * workspace the README, the Pages site and the engine's acceptance set all use.
 * Every Big Bank view is an automatic layout; stored layouts and unplaced
 * elements are made by giving copies of its views coordinates.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe } from "node:test";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    WorkspaceModel,
    findElementStyle,
    findRelationshipStyle,
    getMetadataForElement,
    getMetadataForRelationship,
    resolveView,
    shadeColor,
} = await importSrc("model/index");

const BIG_BANK = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
        "utf-8",
    ),
);

const clone = (value) => structuredClone(value);
const bigBank = (edit = () => {}) => {
    const json = clone(BIG_BANK);
    edit(json);
    return new WorkspaceModel(json);
};

const byName = (model, name) =>
    model.getElements().find((element) => element.name === name);

describe("workspace model", () => {
    test("finds elements, relationships and views", () => {
        const model = bigBank();
        const customer = byName(model, "Personal Banking Customer");
        assert.equal(customer.type, "Person");
        assert.equal(model.findElementById(customer.id), customer);

        const api = byName(model, "API Application");
        assert.equal(api.type, "Container");
        assert.equal(
            model.findElementById(api.parentId).name,
            "Internet Banking System",
        );

        assert.ok(model.getRelationships().length > 0);
        assert.equal(model.findViewByKey("Containers").type, "Container");
        assert.equal(model.findViewByKey("nope"), undefined);
    });

    test("orders views the way the drawer always listed them", () => {
        const keys = bigBank()
            .getViews()
            .map((view) => view.key);
        assert.deepEqual(keys, [
            "SystemLandscape",
            "SystemContext",
            "Containers",
            "Components",
            "MainframeBankingSystemFacade",
            "SignIn",
            "DevelopmentDeployment",
            "LiveDeployment",
        ]);
    });

    test("finds the views that detail an element", () => {
        const model = bigBank();
        const system = byName(model, "Internet Banking System");
        const api = byName(model, "API Application");
        assert.deepEqual(
            model
                .findSystemContextViewsForSoftwareSystem(system.id)
                .map((v) => v.key),
            ["SystemContext"],
        );
        assert.deepEqual(
            model
                .findContainerViewsForSoftwareSystem(system.id)
                .map((v) => v.key),
            ["Containers"],
        );
        assert.deepEqual(
            model.findComponentViewsForContainer(api.id).map((v) => v.key),
            ["Components"],
        );
    });

    test("collects tags, instances inheriting from what they instantiate", () => {
        const model = bigBank();
        const tags = model.getTags();
        assert.ok(tags.includes("Database"));
        assert.ok(tags.includes("Existing System"));
        assert.deepEqual([...tags].sort(), tags);

        const instance = model
            .getElements()
            .find(
                (element) =>
                    element.type === "ContainerInstance" &&
                    element.name === "Database",
            );
        const all = model.getAllTagsForElement(instance);
        assert.ok(all.includes("Container"));
        assert.ok(all.includes("Database"));
        assert.ok(all.includes("Container Instance"));
    });

    test("titles views from their title, then their name, then their type", () => {
        const model = bigBank((json) => {
            json.views.containerViews[0].title = "Inside the bank";
        });
        const title = (key) => model.getTitleForView(model.findViewByKey(key));

        assert.equal(title("Containers"), "Inside the bank");
        // Big Bank plc names no enterprise.
        assert.equal(title("SystemLandscape"), "System Landscape View");
        assert.equal(
            title("SystemContext"),
            "System Context View: Internet Banking System",
        );
        assert.equal(
            title("Components"),
            "Component View: Internet Banking System - API Application",
        );
        assert.equal(
            title("SignIn"),
            "Dynamic View: Internet Banking System - API Application",
        );
        assert.equal(
            title("LiveDeployment"),
            "Deployment View: Internet Banking System - Live",
        );
        assert.equal(
            title("MainframeBankingSystemFacade"),
            "[Code] Mainframe Banking System Facade",
        );
        const untitled = bigBank((json) => {
            json.views.imageViews[0].title = undefined;
            json.model.enterprise = { name: "Big Bank plc" };
        });
        assert.equal(
            untitled.getTitleForView(
                untitled.findViewByKey("MainframeBankingSystemFacade"),
            ),
            "Image View: MainframeBankingSystemFacade",
        );
        assert.equal(
            untitled.getTitleForView(untitled.findViewByKey("SystemLandscape")),
            "System Landscape View: Big Bank plc",
        );
    });

    test("does not mutate the JSON it is given", () => {
        const json = clone(BIG_BANK);
        new WorkspaceModel(json);
        assert.deepEqual(json, BIG_BANK);
    });
});

describe("style resolution", () => {
    test("cascades tag styles in tag order", () => {
        const model = bigBank();
        const style = findElementStyle(
            model,
            byName(model, "Personal Banking Customer"),
            "Light",
        );
        // Person sets shape, color and font size; Customer the background.
        assert.equal(style.shape, "Person");
        assert.equal(style.color, "#ffffff");
        assert.equal(style.fontSize, 22);
        assert.equal(style.background, "#08427b");
        // Person-shaped elements keep a square default size.
        assert.equal(style.width, 400);
        assert.equal(style.height, 400);
        assert.deepEqual(style.tags, ["Element", "Person", "Customer"]);

        const mainframe = findElementStyle(
            model,
            byName(model, "Mainframe Banking System"),
            "Light",
        );
        // Existing System comes after Software System, so it wins.
        assert.equal(mainframe.background, "#999999");
        assert.equal(mainframe.shape, "Box");
        assert.equal(mainframe.border, "Solid");
        assert.equal(mainframe.width, 450);
    });

    test("later definitions of the same tag override earlier ones", () => {
        const model = bigBank((json) => {
            json.views.configuration.styles.elements.push({
                tag: "Container",
                background: "#ff0000",
            });
        });
        const style = findElementStyle(
            model,
            byName(model, "API Application"),
            "Light",
        );
        assert.equal(style.background, "#ff0000");
        assert.equal(style.color, "#ffffff");
    });

    test("themes come first, the workspace's own styles last", () => {
        const model = bigBank();
        const theme = {
            elements: [
                { tag: "Container", background: "#00ff00", icon: "x.png" },
            ],
            relationships: [{ tag: "Relationship", color: "#123456" }],
        };
        const style = findElementStyle(
            model,
            byName(model, "API Application"),
            "Light",
            [theme],
        );
        assert.equal(style.background, "#438dd5");
        assert.equal(style.icon, "x.png");

        const relationship = findRelationshipStyle(
            model,
            model.getRelationships()[0],
            "Light",
            [theme],
        );
        assert.equal(relationship.color, "#123456");
    });

    test("applies scheme-scoped styles only in their scheme", () => {
        const model = bigBank((json) => {
            json.views.configuration.styles.elements.push(
                {
                    tag: "Container",
                    background: "#000000",
                    colorScheme: "Dark",
                },
                { tag: "Container", color: "#111111", colorScheme: "Light" },
            );
        });
        const api = byName(model, "API Application");
        const light = findElementStyle(model, api, "Light");
        const dark = findElementStyle(model, api, "Dark");
        assert.equal(light.background, "#438dd5");
        assert.equal(light.color, "#111111");
        assert.equal(dark.background, "#000000");
        assert.equal(dark.color, "#ffffff");
    });

    test("falls back to the scheme defaults", () => {
        const model = new WorkspaceModel({
            model: {
                softwareSystems: [
                    { id: "1", name: "Plain", tags: "Element,Software System" },
                ],
            },
        });
        const plain = model.findElementById("1");

        const light = findElementStyle(model, plain, "Light");
        assert.equal(light.background, "#ffffff");
        assert.equal(light.color, "#444444");
        assert.equal(light.stroke, "#444444");
        assert.equal(light.strokeWidth, 2);

        const dark = findElementStyle(model, plain, "Dark");
        assert.equal(dark.background, "#111111");
        assert.equal(dark.color, "#cccccc");
        assert.equal(dark.stroke, "#cccccc");
        assert.equal(dark.strokeWidth, 2);

        const relationship = findRelationshipStyle(
            model,
            { id: "r", sourceId: "1", destinationId: "1" },
            "Dark",
        );
        assert.equal(relationship.color, "#cccccc");
        assert.equal(relationship.thickness, 2);
        assert.equal(relationship.style, "Dashed");
        assert.equal(relationship.routing, "Direct");
    });

    test("an unset stroke is the background darkened 10% in both schemes", () => {
        const model = bigBank();
        const api = byName(model, "API Application");
        const expected = shadeColor("#438dd5", -10);
        assert.equal(expected, "#3c7fc0");
        assert.equal(findElementStyle(model, api, "Light").stroke, expected);
        assert.equal(findElementStyle(model, api, "Dark").stroke, expected);
    });

    test("clamps stroke width and relationship thickness", () => {
        const model = bigBank((json) => {
            json.views.configuration.styles.elements.push({
                tag: "Container",
                strokeWidth: 40,
            });
            json.views.configuration.styles.relationships = [
                { tag: "Relationship", thickness: 0 },
            ];
        });
        assert.equal(
            findElementStyle(model, byName(model, "API Application"), "Light")
                .strokeWidth,
            10,
        );
        assert.equal(
            findRelationshipStyle(model, model.getRelationships()[0], "Light")
                .thickness,
            1,
        );
    });

    test("groups default to a dotted border", () => {
        const model = bigBank();
        const style = findElementStyle(
            model,
            { id: "g", type: "Group", tags: "" },
            "Light",
        );
        assert.equal(style.border, "Dotted");
        assert.ok(style.tags.includes("Group"));
    });
});

describe("perspectives", () => {
    const withPerspectives = () =>
        bigBank((json) => {
            const system = json.model.softwareSystems.find(
                (s) => s.name === "Internet Banking System",
            );
            const api = system.containers.find(
                (c) => c.name === "API Application",
            );
            api.perspectives = [
                { name: "Security", description: "", value: "High" },
            ];
            const web = system.containers.find(
                (c) => c.name === "Web Application",
            );
            web.perspectives = [
                { name: "Security", description: "", value: "Low" },
            ];
            const spa = system.containers.find(
                (c) => c.name === "Single-Page Application",
            );
            spa.perspectives = [
                {
                    name: "Security",
                    description: "",
                    url: "https://example.com/poll",
                },
            ];
            json.views.configuration.styles.elements.push(
                { tag: "Perspective:Security", background: "#00aa00" },
                {
                    tag: "Perspective:Security[value==High]",
                    background: "#aa0000",
                    color: "#eeeeee",
                },
            );
            json.views.configuration.styles.relationships = [
                { tag: "Perspective:Security", color: "#abcdef" },
            ];
            api.relationships[0].perspectives = [
                { name: "Security", description: "" },
            ];
        });

    test("re-resolve styles with Perspective:<name> overrides", () => {
        const model = withPerspectives();
        const api = byName(model, "API Application");
        const web = byName(model, "Web Application");

        const high = findElementStyle(model, api, "Light", [], "Security");
        assert.equal(high.background, "#aa0000");
        assert.equal(high.color, "#eeeeee");
        assert.equal(high.stroke, shadeColor("#aa0000", -10));

        const low = findElementStyle(model, web, "Light", [], "Security");
        assert.equal(low.background, "#00aa00");
        assert.equal(low.color, "#ffffff");

        // Without the perspective the cascade is untouched.
        assert.equal(
            findElementStyle(model, api, "Light").background,
            "#438dd5",
        );

        const relationship = findRelationshipStyle(
            model,
            api.relationships[0],
            "Light",
            [],
            "Security",
        );
        assert.equal(relationship.color, "#abcdef");
    });

    test("ignore dynamic perspectives, which are polled from a URL", () => {
        const model = withPerspectives();
        const spa = byName(model, "Single-Page Application");
        assert.equal(
            findElementStyle(model, spa, "Light", [], "Security").background,
            "#438dd5",
        );
    });

    test("leave elements outside the perspective alone", () => {
        const model = withPerspectives();
        const db = byName(model, "Database");
        assert.equal(
            findElementStyle(model, db, "Light", [], "Security").background,
            "#438dd5",
        );
    });
});

describe("metadata strings", () => {
    test("use the type term, technology and square brackets by default", () => {
        const model = bigBank();
        assert.equal(
            getMetadataForElement(
                model,
                byName(model, "API Application"),
                true,
            ),
            "[Container: Java and Spring MVC]",
        );
        assert.equal(
            getMetadataForElement(
                model,
                byName(model, "API Application"),
                false,
            ),
            "[Container]",
        );
        assert.equal(
            getMetadataForElement(
                model,
                byName(model, "Personal Banking Customer"),
                true,
            ),
            "[Person]",
        );
        const relationship = model
            .getRelationships()
            .find((r) => r.technology === "JSON/HTTPS");
        assert.equal(
            getMetadataForRelationship(model, relationship),
            "[JSON/HTTPS]",
        );
        assert.equal(
            getMetadataForRelationship(model, {
                sourceId: "a",
                destinationId: "b",
            }),
            "",
        );
    });

    test("honor terminology overrides and metadataSymbols", () => {
        const symbols = {
            RoundBrackets: ["(", ")"],
            CurlyBrackets: ["{", "}"],
            AngleBrackets: ["<", ">"],
            DoubleAngleBrackets: ["<<", ">>"],
            None: ["", ""],
        };
        for (const [name, [open, close]] of Object.entries(symbols)) {
            const model = bigBank((json) => {
                json.views.configuration.metadataSymbols = name;
                json.views.configuration.terminology = { container: "Service" };
            });
            assert.equal(
                getMetadataForElement(
                    model,
                    byName(model, "API Application"),
                    true,
                ),
                `${open}Service: Java and Spring MVC${close}`,
            );
        }
    });

    test("custom elements show their own metadata, or nothing", () => {
        const model = new WorkspaceModel({
            model: {
                customElements: [
                    { id: "1", name: "Hardware", metadata: "Box" },
                    { id: "2", name: "Bare" },
                ],
            },
        });
        assert.equal(
            getMetadataForElement(model, model.findElementById("1"), true),
            "[Box]",
        );
        assert.equal(
            getMetadataForElement(model, model.findElementById("2"), true),
            "",
        );
    });
});

describe("resolveView", () => {
    const at = (view, place) => {
        for (const element of view.elements) {
            const [x, y] = place(element);
            element.x = x;
            element.y = y;
        }
    };

    test("resolves every plain view type on Big Bank plc", () => {
        const model = bigBank();
        for (const [key, type] of [
            ["SystemLandscape", "SystemLandscape"],
            ["SystemContext", "SystemContext"],
            ["Containers", "Container"],
            ["Components", "Component"],
            ["SignIn", "Dynamic"],
            ["LiveDeployment", "Deployment"],
        ]) {
            const view = resolveView(model, key);
            assert.equal(view.key, key);
            assert.equal(view.type, type);
            assert.equal(
                view.title,
                model.getTitleForView(model.findViewByKey(key)),
            );
            assert.equal(typeof view.description, "string");
            assert.ok(view.elements.length > 0, key);
            for (const element of view.elements) {
                assert.equal(typeof element.x, "number");
                assert.equal(typeof element.y, "number");
                assert.ok(element.element.id, key);
            }
            for (const relationship of view.relationships) {
                assert.ok(relationship.relationship.sourceId, key);
            }
            assert.equal(view.layout, "automatic", key);
            assert.deepEqual(view.unplaced, []);
        }
    });

    test("reports an unknown key as undefined", () => {
        assert.equal(resolveView(bigBank(), "nope"), undefined);
    });

    test("fills in automatic layout settings from the view or the defaults", () => {
        const model = bigBank();
        const context = resolveView(model, "SystemContext");
        assert.equal(context.automaticLayout.rankDirection, "TopBottom");

        const plain = bigBank((json) => {
            json.views.systemContextViews[0].automaticLayout = undefined;
        });
        assert.deepEqual(resolveView(plain, "SystemContext").automaticLayout, {
            implementation: "Dagre",
            rankDirection: "LeftRight",
            rankSeparation: 100,
            nodeSeparation: 50,
            edgeSeparation: 50,
            vertices: true,
        });
    });

    test("treats missing coordinates as (0,0)", () => {
        const model = bigBank((json) => {
            for (const element of json.views.containerViews[0].elements) {
                element.x = undefined;
                element.y = undefined;
            }
        });
        const view = resolveView(model, "Containers");
        assert.equal(view.layout, "automatic");
        assert.ok(view.elements.every((e) => e.x === 0 && e.y === 0));
    });

    test("keeps a stored layout where every element is placed", () => {
        const model = bigBank((json) => {
            at(json.views.containerViews[0], (_e) => [100, 200]);
            json.views.containerViews[0].automaticLayout.applied = true;
        });
        const view = resolveView(model, "Containers");
        assert.equal(view.layout, "stored");
        assert.deepEqual(view.unplaced, []);
        assert.ok(view.elements.every((e) => e.x === 100 && e.y === 200));
    });

    test("names the unplaced elements of a stored layout", () => {
        let customer;
        const model = bigBank((json) => {
            const view = json.views.containerViews[0];
            customer = json.model.people.find(
                (p) => p.name === "Personal Banking Customer",
            ).id;
            at(view, (e) => (e.id === customer ? [0, 0] : [10, 10]));
        });
        const view = resolveView(model, "Containers");
        assert.equal(view.layout, "unplaced");
        assert.deepEqual(view.unplaced, [customer]);
    });

    test("does not count elements drawn as boundaries", () => {
        // The Internet Banking System is not in its own container view, so
        // add it; its containers are, which makes it a boundary.
        let system;
        const model = bigBank((json) => {
            const view = json.views.containerViews[0];
            system = json.model.softwareSystems.find(
                (s) => s.name === "Internet Banking System",
            ).id;
            at(view, () => [50, 50]);
            view.elements.push({ id: system, x: 0, y: 0 });
        });
        const view = resolveView(model, "Containers");
        assert.equal(view.layout, "stored");
        assert.deepEqual(view.unplaced, []);
        assert.ok(view.boundaries.some((b) => b.id === system));
    });

    test("deployment nodes with children in the view are boundaries", () => {
        const model = bigBank();
        const view = resolveView(model, "LiveDeployment");
        const nodes = view.elements.filter(
            (e) => e.element.type === "DeploymentNode",
        );
        assert.ok(nodes.length > 0);
        const ids = view.boundaries.map((b) => b.id);
        assert.ok(nodes.every((n) => ids.includes(n.id)));
    });

    test("sorts dynamic relationships by order", () => {
        const view = resolveView(bigBank(), "SignIn");
        const orders = view.relationships.map((r) => Number(r.order));
        assert.deepEqual(
            orders,
            [...orders].sort((a, b) => a - b),
        );
    });
});
