/**
 * Which elements `resolveView` draws as boundaries and how they nest (spec 8,
 * ADR 9): software systems, containers and deployment nodes with children in
 * the view, groups, and the enterprise boundary. The boxes themselves are
 * derived in `test/boundary-geometry.test.js`.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const {
    WorkspaceModel,
    findBoundaryStyle,
    findEnterpriseStyle,
    findGroupStyle,
    groupBoundaryId,
    resolveView,
} = await importSrc("model/index");

/** Where an element sits in a view; every one is placed, so layouts are stored. */
const at = (id) => ({ id, x: 100, y: 100 });

/**
 * A small workspace with every kind of boundary: a grouped software system
 * with containers and a component, a deployment environment with a nested
 * node, and a node with nothing in it.
 */
const json = () => ({
    name: "Boundaries",
    model: {
        enterprise: { name: "Acme" },
        properties: { "structurizr.groupSeparator": "/" },
        people: [
            {
                id: "user",
                name: "User",
                tags: "Element,Person",
                location: "External",
            },
        ],
        softwareSystems: [
            {
                id: "shop",
                name: "Shop",
                tags: "Element,Software System",
                location: "Internal",
                group: "Retail/Online",
                containers: [
                    {
                        id: "web",
                        name: "Web",
                        tags: "Element,Container",
                        group: "Front",
                        components: [
                            {
                                id: "controller",
                                name: "Controller",
                                tags: "Element,Component",
                            },
                        ],
                    },
                    { id: "db", name: "Database", tags: "Element,Container" },
                ],
            },
            {
                id: "mail",
                name: "Mail",
                tags: "Element,Software System",
                location: "Internal",
                group: "Retail",
            },
        ],
        deploymentNodes: [
            {
                id: "server",
                name: "Server",
                tags: "Element,Deployment Node",
                environment: "Live",
                instances: "4",
                group: "Data centre",
                children: [
                    {
                        id: "tomcat",
                        name: "Tomcat",
                        tags: "Element,Deployment Node",
                        environment: "Live",
                        instances: "1",
                        containerInstances: [
                            {
                                id: "web-1",
                                containerId: "web",
                                tags: "Container Instance",
                                environment: "Live",
                            },
                        ],
                    },
                ],
            },
            {
                id: "spare",
                name: "Spare",
                tags: "Element,Deployment Node",
                environment: "Live",
                instances: "0..2",
            },
        ],
    },
    views: {
        systemLandscapeViews: [
            {
                key: "Landscape",
                enterpriseBoundaryVisible: true,
                elements: [at("user"), at("shop"), at("mail")],
            },
        ],
        containerViews: [
            {
                key: "Containers",
                softwareSystemId: "shop",
                elements: [at("user"), at("web"), at("db"), at("mail")],
            },
        ],
        componentViews: [
            {
                key: "Components",
                containerId: "web",
                elements: [at("controller"), at("db")],
            },
        ],
        deploymentViews: [
            {
                key: "Live",
                environment: "Live",
                elements: [
                    at("server"),
                    at("tomcat"),
                    at("web-1"),
                    at("spare"),
                ],
            },
        ],
        configuration: { styles: { elements: [] } },
    },
});

const model = (edit = () => {}) => {
    const workspace = json();
    edit(workspace);
    return new WorkspaceModel(workspace);
};

/** Each boundary of a view as `id → { parent, children }`, for comparing. */
const nesting = (view) =>
    Object.fromEntries(
        view.boundaries.map((boundary) => [
            boundary.id,
            { parent: boundary.parent, children: boundary.children },
        ]),
    );

/** With the enterprise boundary on, top-level groups split by location. */
const RETAIL = groupBoundaryId("location:Internal", "Retail");
const ONLINE = groupBoundaryId("location:Internal", "Retail/Online");
const FRONT = groupBoundaryId("shop", "Front");
const DATA_CENTRE = groupBoundaryId("deployment:Live", "Data centre");

/* ------------------------------------------------- boundary or element */

test("a software system whose containers are in the view is a boundary, though the view does not list it", () => {
    const view = resolveView(model(), "Containers");
    const shop = view.boundaries.find((boundary) => boundary.id === "shop");

    assert.ok(shop, "the Shop should be drawn as a boundary");
    assert.equal(shop.kind, "Element");
    assert.equal(shop.element.name, "Shop");
    assert.deepEqual(shop.children, [FRONT, "db"]);
});

test("a container whose components are in the view is a boundary inside its software system", () => {
    // A component view groups components only, so neither Web's group nor
    // Shop's is drawn around them.
    const view = resolveView(model(), "Components");

    assert.deepEqual(
        nesting(view).web,
        { parent: "shop", children: ["controller"] },
        "Web should sit directly inside Shop",
    );
    assert.deepEqual(
        nesting(view).shop,
        { parent: undefined, children: ["web", "db"] },
        "Shop should be outermost, around Web and the Database",
    );
});

test("a software system none of whose containers the view lists is not a boundary, though its container is", () => {
    const view = resolveView(
        model((workspace) => {
            workspace.views.componentViews[0].elements = [at("controller")];
        }),
        "Components",
    );
    const ids = view.boundaries.map((boundary) => boundary.id);

    assert.ok(ids.includes("web"), "Web's component is in the view");
    assert.ok(!ids.includes("shop"), "none of Shop's containers is listed");
    assert.equal(
        nesting(view).web.parent,
        undefined,
        "Web should be outermost",
    );
});

test("deployment nodes with children in the view are boundaries, and a node with none is an element", () => {
    const view = resolveView(model(), "Live");
    const ids = view.boundaries.map((boundary) => boundary.id);

    assert.deepEqual(nesting(view).server, {
        parent: DATA_CENTRE,
        children: ["tomcat"],
    });
    assert.deepEqual(nesting(view).tomcat, {
        parent: "server",
        children: ["web-1"],
    });
    assert.ok(!ids.includes("spare"), "Spare has nothing in it");
    assert.equal(view.layout, "stored", "Spare counts as a placed element");
});

test("software systems in a landscape view are elements", () => {
    const view = resolveView(model(), "Landscape");
    const ids = view.boundaries.map((boundary) => boundary.id);

    assert.ok(!ids.includes("shop"));
    assert.ok(!ids.includes("mail"));
});

/* ------------------------------------------------------------------ groups */

test("groups nest by structurizr.groupSeparator and are labelled with their last segment", () => {
    const view = resolveView(model(), "Landscape");
    const online = view.boundaries.find((boundary) => boundary.id === ONLINE);

    assert.equal(online.kind, "Group");
    assert.equal(online.name, "Online");
    assert.equal(online.group, "Retail/Online");
    assert.deepEqual(nesting(view)[ONLINE], {
        parent: RETAIL,
        children: ["shop"],
    });
    assert.deepEqual(nesting(view)[RETAIL].children, [ONLINE, "mail"]);
});

test("without structurizr.groupSeparator a group name is one flat group", () => {
    const view = resolveView(
        model((workspace) => {
            workspace.model.properties = {};
        }),
        "Landscape",
    );
    const online = view.boundaries.find((boundary) => boundary.id === ONLINE);

    assert.equal(online.name, "Retail/Online");
    assert.equal(online.parent, "enterprise");
    assert.deepEqual(nesting(view)[RETAIL].children, ["mail"]);
});

test("a group's identity is its scope plus its name, and it sits inside its members' parent", () => {
    const view = resolveView(model(), "Containers");

    assert.deepEqual(nesting(view)[FRONT], {
        parent: "shop",
        children: ["web"],
    });
    assert.deepEqual(nesting(view)[DATA_CENTRE], undefined);
    assert.deepEqual(
        nesting(resolveView(model(), "Live"))[DATA_CENTRE].children,
        ["server"],
    );
});

test("a container view draws groups around its containers only, not around the software systems beside them", () => {
    // Mail is in the Retail group, but a container view draws groups for
    // containers alone, as upstream's `includeGroup` does.
    const view = resolveView(model(), "Containers");
    const groups = view.boundaries
        .filter((boundary) => boundary.kind === "Group")
        .map((boundary) => boundary.id);

    assert.deepEqual(groups, [FRONT], "the wrong groups were drawn");
});

test("each view type draws groups around the element types upstream does", () => {
    const cases = [
        // [view, the groups it draws]
        ["Landscape", [RETAIL, ONLINE]],
        ["Containers", [FRONT]],
        ["Components", []],
        ["Live", [DATA_CENTRE]],
    ];
    for (const [key, expected] of cases) {
        const groups = resolveView(model(), key)
            .boundaries.filter((boundary) => boundary.kind === "Group")
            .map((boundary) => boundary.id);
        assert.deepEqual(
            groups.sort(),
            [...expected].sort(),
            `${key} drew the wrong groups`,
        );
    }
});

test("structurizr.groups false on a view draws none of its groups", () => {
    const view = resolveView(
        model((workspace) => {
            workspace.views.systemLandscapeViews[0].properties = {
                "structurizr.groups": "false",
            };
        }),
        "Landscape",
    );

    assert.deepEqual(
        view.boundaries.map((boundary) => boundary.id),
        ["enterprise"],
        "a group was drawn though the view switches groups off",
    );
    assert.deepEqual(
        view.boundaries[0].children,
        ["shop", "mail"],
        "the enterprise boundary should hold the Internal elements directly",
    );
});

/* -------------------------------------------------------------- enterprise */

test("the enterprise boundary goes around every Internal element, outermost", () => {
    const view = resolveView(model(), "Landscape");
    const [outermost] = view.boundaries;

    assert.equal(outermost.id, "enterprise");
    assert.equal(outermost.kind, "Enterprise");
    assert.equal(outermost.name, "Acme");
    assert.equal(outermost.parent, undefined);
    assert.deepEqual(outermost.children, [RETAIL]);
    assert.equal(nesting(view)[RETAIL].parent, "enterprise");
});

test("the enterprise boundary needs it switched on, an Internal element and a landscape or context view", () => {
    const cases = [
        {
            name: "switched off",
            edit: (w) => {
                w.views.systemLandscapeViews[0].enterpriseBoundaryVisible = false;
            },
            drawn: false,
        },
        {
            name: "switched on by the view property",
            edit: (w) => {
                w.views.systemLandscapeViews[0].enterpriseBoundaryVisible = false;
                w.views.systemLandscapeViews[0].properties = {
                    "structurizr.enterpriseBoundary": "true",
                };
            },
            drawn: true,
        },
        {
            name: "switched on by the flag, whatever the view property says",
            edit: (w) => {
                w.views.systemLandscapeViews[0].properties = {
                    "structurizr.enterpriseBoundary": "false",
                };
            },
            drawn: true,
        },
        {
            name: "no Internal element",
            edit: (w) => {
                for (const system of w.model.softwareSystems) {
                    system.location = "Unspecified";
                }
            },
            drawn: false,
        },
    ];
    for (const { name, edit, drawn } of cases) {
        const view = resolveView(model(edit), "Landscape");
        assert.equal(
            view.boundaries.some((boundary) => boundary.id === "enterprise"),
            drawn,
            name,
        );
    }
    assert.ok(
        !resolveView(model(), "Containers").boundaries.some(
            (boundary) => boundary.kind === "Enterprise",
        ),
        "a container view draws no enterprise boundary",
    );
});

test("the enterprise boundary goes around Internal elements only, so a group mixing Internal and External members is split", () => {
    const view = resolveView(
        model((workspace) => {
            workspace.model.people[0].group = "Retail";
        }),
        "Landscape",
    );
    const enterprise = view.boundaries.find((b) => b.id === "enterprise");
    const outside = groupBoundaryId("location:External", "Retail");

    assert.deepEqual(enterprise.children, [RETAIL]);
    assert.deepEqual(nesting(view)[outside], {
        parent: undefined,
        children: ["user"],
    });
});

test("the enterprise boundary is called Enterprise when the model names none", () => {
    const view = resolveView(
        model((workspace) => {
            workspace.model.enterprise = undefined;
        }),
        "Landscape",
    );
    assert.equal(view.boundaries[0].name, "Enterprise");
});

test("boundaries are listed outer before inner", () => {
    const view = resolveView(model(), "Components");
    const order = view.boundaries.map((boundary) => boundary.id);

    for (const boundary of view.boundaries) {
        if (boundary.parent === undefined) continue;
        assert.ok(
            order.indexOf(boundary.parent) < order.indexOf(boundary.id),
            `${boundary.parent} should come before ${boundary.id}`,
        );
    }
});

/* ------------------------------------------------------------------- style */

const styled = (elements) =>
    model((workspace) => {
        workspace.views.configuration.styles.elements = elements;
    });

test("a software-system boundary starts from the element's style, fills with the canvas and keeps its stroke", () => {
    const m = styled([
        {
            tag: "Software System",
            background: "#1168bd",
            color: "#ffffff",
            fontSize: 30,
            shape: "Folder",
        },
    ]);
    const style = findBoundaryStyle(m, m.findElementById("shop"), "Light");

    assert.equal(style.background, "#ffffff");
    assert.equal(style.stroke, "#0f5eaa", "the background darkened 10%");
    assert.equal(style.color, "#0f5eaa", "white on white falls back");
    assert.equal(style.fontSize, 30);
});

test("Boundary and Boundary:<type> override the element's style field by field", () => {
    const m = styled([
        {
            tag: "Software System",
            background: "#1168bd",
            color: "#ffffff",
            shape: "Hexagon",
        },
        { tag: "Boundary", stroke: "#ff0000", fontSize: 18 },
        {
            tag: "Boundary:SoftwareSystem",
            color: "#00ff00",
            border: "Dashed",
        },
    ]);
    const style = findBoundaryStyle(m, m.findElementById("shop"), "Light");

    assert.equal(style.stroke, "#ff0000");
    assert.equal(style.color, "#00ff00");
    assert.equal(style.border, "Dashed");
    assert.equal(style.fontSize, 18);
});

test("a boundary's text falls back to its stroke when it matches the fill", () => {
    const m = styled([
        { tag: "Software System", background: "#1168bd", color: "#ffffff" },
    ]);
    const dark = findBoundaryStyle(m, m.findElementById("shop"), "Dark");
    assert.equal(dark.background, "#111111");
    assert.equal(dark.color, "#ffffff", "white on the dark canvas is fine");

    const plain = styled([{ tag: "Container", color: "#ffffff" }]);
    const web = findBoundaryStyle(plain, plain.findElementById("web"), "Light");
    assert.equal(web.color, web.stroke);
});

test("a boundary background from Boundary leaves the element's resolved stroke", () => {
    const m = styled([
        { tag: "Software System", stroke: "#123456" },
        { tag: "Boundary", background: "#ff0000" },
    ]);
    const style = findBoundaryStyle(m, m.findElementById("shop"), "Light");

    assert.equal(style.background, "#ff0000");
    assert.equal(style.stroke, "#123456", "not the boundary fill darkened");
});

test("a deployment node boundary uses its own tags", () => {
    const m = styled([
        { tag: "Deployment Node", background: "#eeeeee", shape: "Cylinder" },
        { tag: "Boundary", background: "#ff0000" },
    ]);
    const style = findBoundaryStyle(m, m.findElementById("server"), "Light");

    assert.equal(style.background, "#eeeeee");
});

test("groups take Group and Group:<full path> only, with no inheritance between levels", () => {
    const m = styled([
        { tag: "Group", color: "#111111" },
        { tag: "Group:Retail", background: "#ff0000", fontSize: 40 },
        { tag: "Group:Retail/Online", stroke: "#00ff00" },
    ]);
    const retail = findGroupStyle(m, "Retail", "Light");
    const online = findGroupStyle(m, "Retail/Online", "Light");

    assert.equal(retail.background, "#ff0000");
    assert.equal(retail.fontSize, 40);
    assert.equal(retail.border, "Dotted");
    assert.equal(online.background, "#ffffff", "nothing from Group:Retail");
    assert.equal(online.fontSize, 24);
    assert.equal(online.stroke, "#00ff00");
    assert.equal(online.color, "#111111", "from Group");
});

test("neither groups nor the enterprise boundary pick up Element styles, and the enterprise boundary none from Group", () => {
    const m = styled([
        { tag: "Element", background: "#ff0000", fontSize: 50 },
        { tag: "Group", stroke: "#00ff00", icon: "data:," },
    ]);
    const group = findGroupStyle(m, "Retail", "Light");
    const enterprise = findEnterpriseStyle(m, "Light");

    assert.equal(group.background, "#ffffff");
    assert.equal(group.fontSize, 24);
    assert.ok(!group.tags.includes("Element"), group.tags.join());
    assert.equal(enterprise.background, "#ffffff");
    assert.notEqual(enterprise.stroke, "#00ff00");
    assert.equal(enterprise.icon, undefined);
    assert.ok(
        !enterprise.tags.includes("Element") &&
            !enterprise.tags.includes("Group"),
        enterprise.tags.join(),
    );
});

test("the enterprise boundary is styled by Boundary and Boundary:Enterprise", () => {
    const m = styled([
        { tag: "Boundary", strokeWidth: 4 },
        { tag: "Boundary:Enterprise", stroke: "#ff0000" },
    ]);
    const style = findEnterpriseStyle(m, "Light");

    assert.equal(style.strokeWidth, 4);
    assert.equal(style.stroke, "#ff0000");
});
