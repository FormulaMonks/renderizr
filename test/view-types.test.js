/**
 * The three view types that are not plain C4 levels (spec 12): filtered views
 * resolved in the model layer, image views drawn as one picture, and custom
 * views drawn by the rules every other view follows. The island's part is
 * exercised in Chrome by `test/e2e.test.js`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe } from "node:test";
import { validateWorkspace } from "../scripts/assets.js";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel, findViewError, resolveView } =
    await importSrc("model/index");
const {
    buildGraph,
    fitMaxZoom,
    imageBox,
    imageVariant,
    IMAGE_PLACEHOLDER,
    svgSize,
} = await importSrc("engine/react-flow/graph");

const BIG_BANK = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/big-bank-plc.json", import.meta.url),
        "utf-8",
    ),
);

const LABELS = { descriptions: true, technologies: true };

/** Big Bank plc with `filters` added as its filtered views. */
const bigBank = (filters = [], edit = () => {}) => {
    const json = structuredClone(BIG_BANK);
    json.views.filteredViews = filters;
    edit(json);
    return new WorkspaceModel(json);
};

const ids = (items) => items.map((item) => item.id);

/** The ids of Big Bank elements by name. */
const idOf = (model, name) =>
    model.getElements().find((element) => element.name === name).id;

/** The relationship with `id`, wherever the workspace JSON declares it. */
function relationshipIn(json, id) {
    const pending = [json.model];
    while (pending.length) {
        const item = pending.pop();
        if (Array.isArray(item)) pending.push(...item);
        else if (item && typeof item === "object") {
            if (item.sourceId && item.id === id) return item;
            pending.push(...Object.values(item));
        }
    }
    throw new Error(`no relationship ${id}`);
}

/* ------------------------------------------------------------ filtered */

describe("filtered views", () => {
    test("Exclude drops every element carrying one of the filter's tags", () => {
        const model = bigBank([
            {
                key: "NoDatabase",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Database", "Mobile App"],
            },
        ]);
        const base = resolveView(model, "Containers");
        const view = resolveView(model, "NoDatabase");

        assert.deepEqual(
            ids(view.elements),
            ids(base.elements).filter(
                (id) =>
                    id !== idOf(model, "Database") &&
                    id !== idOf(model, "Mobile App"),
            ),
        );
    });

    test("Include keeps only what carries at least one of the filter's tags", () => {
        const model = bigBank([
            {
                key: "OnlySystems",
                baseViewKey: "Containers",
                mode: "Include",
                tags: ["Existing System", "Customer", "Relationship"],
            },
        ]);
        const view = resolveView(model, "OnlySystems");

        assert.deepEqual(
            ids(view.elements).sort(),
            [
                idOf(model, "Personal Banking Customer"),
                idOf(model, "Mainframe Banking System"),
                idOf(model, "E-mail System"),
            ].sort(),
        );
    });

    test("a relationship survives only when it passes the filter and both its ends survive", () => {
        const model = bigBank([
            {
                key: "NoDatabase",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Database"],
            },
            {
                key: "ElementsOnly",
                baseViewKey: "Containers",
                mode: "Include",
                tags: ["Element"],
            },
        ]);
        const database = idOf(model, "Database");
        const base = resolveView(model, "Containers");

        const excluded = resolveView(model, "NoDatabase");
        assert.deepEqual(
            ids(excluded.relationships),
            ids(
                base.relationships.filter(
                    ({ relationship }) =>
                        relationship.sourceId !== database &&
                        relationship.destinationId !== database,
                ),
            ),
            "relationships to the dropped database go with it",
        );
        assert.ok(excluded.relationships.length > 0);

        // Every element carries Element, no relationship does.
        const included = resolveView(model, "ElementsOnly");
        assert.equal(included.elements.length, base.elements.length);
        assert.deepEqual(included.relationships, []);
    });

    test("a relationship is filtered by its own tags too", () => {
        const model = bigBank(
            [
                {
                    key: "NoAsync",
                    baseViewKey: "Containers",
                    mode: "Exclude",
                    tags: ["Async"],
                },
            ],
            (json) => {
                relationshipIn(json, "29").tags = "Relationship,Async";
            },
        );
        const base = resolveView(model, "Containers");
        const view = resolveView(model, "NoAsync");

        assert.deepEqual(
            ids(view.relationships),
            ids(base.relationships).filter((id) => id !== "29"),
        );
        assert.equal(view.elements.length, base.elements.length);
    });

    test("matching trims the filter's tags and the element's, and uses the tags an instance inherits", () => {
        const model = new WorkspaceModel({
            model: {
                softwareSystems: [
                    {
                        id: "1",
                        name: "System",
                        tags: "Element,Software System",
                        containers: [
                            {
                                id: "2",
                                name: "Store",
                                tags: "Element,Container, Database ",
                            },
                        ],
                    },
                ],
                deploymentNodes: [
                    {
                        id: "3",
                        name: "Server",
                        environment: "Live",
                        tags: "Element,Deployment Node",
                        containerInstances: [
                            {
                                id: "4",
                                containerId: "2",
                                environment: "Live",
                                tags: "Container Instance",
                            },
                        ],
                    },
                ],
            },
            views: {
                containerViews: [
                    {
                        key: "Containers",
                        softwareSystemId: "1",
                        elements: [{ id: "2" }],
                    },
                ],
                deploymentViews: [
                    {
                        key: "Live",
                        environment: "Live",
                        elements: [{ id: "3" }, { id: "4" }],
                    },
                ],
                filteredViews: [
                    {
                        key: "ContainersNoDb",
                        baseViewKey: "Containers",
                        mode: "Exclude",
                        tags: ["  Database"],
                    },
                    {
                        key: "LiveNoDb",
                        baseViewKey: "Live",
                        mode: "Exclude",
                        tags: ["Database "],
                    },
                ],
            },
        });

        assert.deepEqual(resolveView(model, "ContainersNoDb").elements, []);
        assert.deepEqual(
            ids(resolveView(model, "LiveNoDb").elements),
            ["3"],
            "the instance inherits Database from its container",
        );
    });

    test("the key, title and description are the filtered view's; type and layout settings the base's", () => {
        const model = bigBank(
            [
                {
                    key: "NoDatabase",
                    baseViewKey: "Containers",
                    mode: "Exclude",
                    tags: ["Database"],
                    title: "Without the database",
                    description: "Everything but storage",
                },
                {
                    key: "Untitled",
                    baseViewKey: "Containers",
                    mode: "Exclude",
                    tags: ["Database"],
                },
            ],
            (json) => {
                json.views.containerViews[0].description = "The base's own";
            },
        );
        const base = resolveView(model, "Containers");
        const view = resolveView(model, "NoDatabase");

        assert.equal(view.key, "NoDatabase");
        assert.equal(view.type, "Container");
        assert.equal(view.title, "Without the database");
        assert.equal(view.description, "Everything but storage");
        assert.deepEqual(view.automaticLayout, base.automaticLayout);
        assert.deepEqual(view.filter, {
            baseViewKey: "Containers",
            mode: "Exclude",
            tags: ["Database"],
        });
        assert.equal(base.filter, undefined);
        assert.equal(
            resolveView(model, "Untitled").title,
            base.title,
            "without a title of its own it takes the base's",
        );
        assert.equal(
            resolveView(model, "Untitled").description,
            "",
            "without a description of its own it has none, not the base's",
        );
    });

    test("a stored base keeps every survivor's coordinates and the gaps between them", () => {
        const model = bigBank(
            [
                {
                    key: "NoDatabase",
                    baseViewKey: "Containers",
                    mode: "Exclude",
                    tags: ["Database"],
                },
            ],
            (json) => {
                const view = json.views.containerViews[0];
                for (const [at, element] of view.elements.entries()) {
                    element.x = 100 + 500 * at;
                    element.y = 200;
                }
            },
        );
        const base = resolveView(model, "Containers");
        const view = resolveView(model, "NoDatabase");

        assert.equal(base.layout, "stored");
        assert.equal(view.layout, "stored");
        const where = new Map(base.elements.map((e) => [e.id, [e.x, e.y]]));
        for (const element of view.elements) {
            assert.deepEqual([element.x, element.y], where.get(element.id));
        }
    });

    test("an automatic base lays out what is left", () => {
        const model = bigBank([
            {
                key: "NoDatabase",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Database"],
            },
        ]);
        assert.equal(resolveView(model, "NoDatabase").layout, "automatic");
    });

    test("boundaries follow the survivors", () => {
        const model = bigBank([
            {
                key: "NoContainers",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Container"],
            },
        ]);
        const system = idOf(model, "Internet Banking System");

        assert.ok(
            ids(resolveView(model, "Containers").boundaries).includes(system),
        );
        assert.ok(
            !ids(resolveView(model, "NoContainers").boundaries).includes(
                system,
            ),
            "without its containers the system is no boundary",
        );
    });

    test("a filtered dynamic view keeps the surviving orders", () => {
        const model = bigBank([
            {
                key: "SignInNoDatabase",
                baseViewKey: "SignIn",
                mode: "Exclude",
                tags: ["Database"],
            },
        ]);
        const base = resolveView(model, "SignIn");
        const view = resolveView(model, "SignInNoDatabase");
        const database = idOf(model, "Database");

        assert.equal(view.type, "Dynamic");
        assert.deepEqual(
            view.relationships.map((r) => [r.id, r.order]),
            base.relationships
                .filter(
                    ({ relationship }) =>
                        relationship.sourceId !== database &&
                        relationship.destinationId !== database,
                )
                .map((r) => [r.id, r.order]),
        );
        assert.ok(view.relationships.length < base.relationships.length);
        assert.ok(
            view.relationships.every((r) => r.order),
            "every surviving relationship keeps an order",
        );
    });

    test("a filtered view whose base is filtered is an error naming both views", () => {
        const model = bigBank([
            {
                key: "NoDatabase",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Database"],
            },
            {
                key: "NoDatabaseNoMobile",
                baseViewKey: "NoDatabase",
                mode: "Exclude",
                tags: ["Mobile App"],
            },
        ]);

        assert.equal(
            findViewError(model, "NoDatabaseNoMobile"),
            'Filtered view "NoDatabaseNoMobile" has filtered view "NoDatabase" as its base; the base of a filtered view must not be filtered.',
        );
        assert.equal(findViewError(model, "NoDatabase"), undefined);
        assert.equal(findViewError(model, "Containers"), undefined);
        assert.equal(resolveView(model, "NoDatabaseNoMobile"), undefined);
    });

    test("the build refuses a filtered view of a filtered view with the engine's message", () => {
        const filters = [
            {
                key: "NoDatabase",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Database"],
            },
            {
                key: "NoDatabaseNoMobile",
                baseViewKey: "NoDatabase",
                mode: "Exclude",
                tags: ["Mobile App"],
            },
        ];
        const json = structuredClone(BIG_BANK);
        json.views.filteredViews = filters;

        assert.throws(
            () => validateWorkspace(json),
            {
                message: findViewError(bigBank(filters), "NoDatabaseNoMobile"),
            },
            "scripts/assets.js and src/model/filter.ts should say the same",
        );
    });
});

/* --------------------------------------------------------------- image */

/** A workspace with one image view holding `content`. */
const imageWorkspace = (content) =>
    new WorkspaceModel({
        model: {},
        views: {
            imageViews: [
                {
                    key: "Picture",
                    title: "A picture",
                    description: "Drawn elsewhere",
                    ...content,
                },
            ],
        },
    });

const LIGHT = "data:image/png;base64,TElHSFQ=";
const PLAIN = "data:image/png;base64,UExBSU4=";
const DARK = "data:image/png;base64,REFSSw==";

describe("image views", () => {
    test("an image view resolves to its content and nothing else", () => {
        const view = resolveView(
            imageWorkspace({
                content: PLAIN,
                contentLight: LIGHT,
                contentDark: DARK,
            }),
            "Picture",
        );

        assert.equal(view.type, "Image");
        assert.equal(view.title, "A picture");
        assert.equal(view.description, "Drawn elsewhere");
        assert.deepEqual(view.elements, []);
        assert.deepEqual(view.relationships, []);
        assert.deepEqual(view.boundaries, []);
        assert.deepEqual(view.image, {
            content: PLAIN,
            contentLight: LIGHT,
            contentDark: DARK,
        });
    });

    const variants = [
        // [content given, dark pick, light pick]
        [
            { content: PLAIN, contentLight: LIGHT, contentDark: DARK },
            DARK,
            LIGHT,
        ],
        [{ content: PLAIN, contentLight: LIGHT }, PLAIN, LIGHT],
        [{ content: PLAIN, contentDark: DARK }, DARK, PLAIN],
        [{ contentLight: LIGHT }, LIGHT, LIGHT],
        [{ contentDark: DARK }, DARK, DARK],
        [{ content: PLAIN }, PLAIN, PLAIN],
        [{}, undefined, undefined],
    ];
    for (const [content, dark, light] of variants) {
        test(`the scheme picks the variant from ${Object.keys(content).join(", ") || "no content"}`, () => {
            assert.equal(imageVariant(content, "dark"), dark);
            assert.equal(imageVariant(content, "light"), light);
        });
    }

    test("the graph of an image view carries the variant for its scheme and no elements", () => {
        const model = imageWorkspace({ content: PLAIN, contentDark: DARK });
        const light = buildGraph(model, "Picture", "light", LABELS);
        const dark = buildGraph(model, "Picture", "dark", LABELS);

        assert.deepEqual(light.image, { src: PLAIN, alt: "A picture" });
        assert.deepEqual(dark.image, { src: DARK, alt: "A picture" });
        assert.deepEqual(light.elements, []);
        assert.deepEqual(light.edges, []);
        assert.equal(light.color, "#444444");
        assert.equal(dark.color, "#cccccc");
    });

    test("an image is drawn at its natural size; a failed one as the placeholder; a loading one not yet", () => {
        const picture = { src: PLAIN, alt: "A picture" };
        assert.deepEqual(
            imageBox(picture, "#444444", {
                status: "loaded",
                src: PLAIN,
                width: 640,
                height: 480,
            }),
            {
                type: "image",
                width: 640,
                height: 480,
                data: { src: PLAIN, alt: "A picture" },
            },
        );
        assert.deepEqual(
            imageBox(picture, "#444444", { status: "failed", reason: "nope" }),
            {
                type: "placeholder",
                ...IMAGE_PLACEHOLDER,
                data: { color: "#444444" },
            },
        );
        assert.equal(
            imageBox(picture, "#444444", { status: "loading" }),
            undefined,
        );
    });

    test("an image view is never fitted above its natural size; other views are", () => {
        const image = buildGraph(
            imageWorkspace({ content: PLAIN }),
            "Picture",
            "light",
            LABELS,
        );
        const plain = buildGraph(bigBank(), "Containers", "light", LABELS);

        assert.equal(fitMaxZoom(image), 1, "an image is never upscaled");
        assert.equal(fitMaxZoom(plain), Number.POSITIVE_INFINITY);
    });

    /** An SVG data URI whose root carries `attributes`. */
    const svg = (attributes, encode = "base64") => {
        const text = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect/></svg>`;
        return encode === "base64"
            ? `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`
            : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
    };

    const sizes = [
        // [root attributes, the size the picture was drawn at]
        [
            'width="100%" style="max-width: 933.617px;" viewBox="0 -50 933.6171875 4565.796875"',
            { width: 933.6171875, height: 4565.796875 },
        ],
        ['viewBox="0 0 400 1200"', { width: 400, height: 1200 }],
        [
            "viewBox='0,0,400,1200' width='100%' height='100%'",
            { width: 400, height: 1200 },
        ],
        ['width="200" viewBox="0 0 400 1200"', { width: 200, height: 600 }],
        ['height="600px" viewBox="0 0 400 1200"', { width: 200, height: 600 }],
        ['width="10em" viewBox="0 0 400 1200"', { width: 400, height: 1200 }],
    ];
    for (const [attributes, size] of sizes) {
        test(`an SVG with ${attributes} takes its size from its viewBox`, () => {
            assert.deepEqual(svgSize(svg(attributes)), size);
            assert.deepEqual(svgSize(svg(attributes, "url")), size);
        });
    }

    const browserSized = [
        [
            "an SVG sized in pixels",
            svg('width="480" height="240" viewBox="0 0 10 10"'),
        ],
        ["an SVG with no viewBox", svg('width="100%"')],
        ["an SVG with an empty viewBox", svg('viewBox="0 0 0 1200"')],
        ["a raster picture", PLAIN],
        ["a remote SVG", "https://example.test/picture.svg"],
        ["a data URI that does not decode", "data:image/svg+xml;base64,%%%"],
    ];
    for (const [name, src] of browserSized) {
        test(`${name} keeps the size the browser gives it`, () => {
            assert.equal(svgSize(src), undefined);
        });
    }

    test("a plain view's graph has no image", () => {
        const graph = buildGraph(bigBank(), "Containers", "light", LABELS);
        assert.equal(graph.image, undefined);
    });
});

/* ------------------------------------------------------------- errors */

describe("view errors in the graph", () => {
    test("a filtered view whose base is filtered draws nothing but the error", () => {
        const model = bigBank([
            {
                key: "A",
                baseViewKey: "Containers",
                mode: "Exclude",
                tags: ["Database"],
            },
            { key: "B", baseViewKey: "A", mode: "Exclude", tags: [] },
        ]);
        const graph = buildGraph(model, "B", "dark", LABELS);

        assert.equal(graph.key, "B");
        assert.match(graph.error, /"B".*"A"/);
        assert.deepEqual(graph.elements, []);
        assert.deepEqual(graph.boundaries, []);
        assert.deepEqual(graph.edges, []);
        assert.equal(graph.background, "#111111");
        assert.equal(graph.color, "#cccccc");
        assert.equal(buildGraph(model, "A", "dark", LABELS).error, undefined);
    });
});

/* -------------------------------------------------------------- custom */

describe("custom views", () => {
    const custom = () =>
        new WorkspaceModel({
            model: {
                enterprise: { name: "Acme" },
                customElements: [
                    {
                        id: "1",
                        name: "Sensor",
                        metadata: "Hardware",
                        tags: "Element",
                    },
                    { id: "2", name: "Gateway", tags: "Element" },
                ],
                people: [
                    {
                        id: "3",
                        name: "Operator",
                        location: "Internal",
                        tags: "Element,Person",
                    },
                ],
            },
            views: {
                customViews: [
                    {
                        key: "Plant",
                        title: "Plant floor",
                        enterpriseBoundaryVisible: true,
                        properties: {
                            "structurizr.enterpriseBoundary": "true",
                        },
                        elements: [
                            { id: "1", x: 100, y: 100 },
                            { id: "2", x: 700, y: 100 },
                            { id: "3", x: 1300, y: 100 },
                        ],
                    },
                ],
            },
        });

    test("a custom view draws every element as an element, with no enterprise boundary", () => {
        const view = resolveView(custom(), "Plant");
        assert.equal(view.type, "Custom");
        assert.equal(view.title, "Plant floor");
        assert.equal(view.layout, "stored");
        assert.deepEqual(ids(view.elements), ["1", "2", "3"]);
        assert.deepEqual(view.boundaries, []);
    });

    test("an unstyled custom element takes the scheme defaults and shows its own metadata", () => {
        const model = custom();
        const light = buildGraph(model, "Plant", "light", LABELS);
        const dark = buildGraph(model, "Plant", "dark", LABELS);
        const sensor = light.elements.find((e) => e.id === "1");
        const darkSensor = dark.elements.find((e) => e.id === "1");

        assert.equal(sensor.metadata, "[Hardware]");
        assert.equal(light.elements.find((e) => e.id === "2").metadata, "");
        assert.equal(sensor.background, "#ffffff");
        assert.equal(sensor.color, "#444444");
        assert.equal(darkSensor.background, "#111111");
        assert.equal(darkSensor.color, "#cccccc");
        assert.deepEqual(light.boundaries, []);
    });
});
