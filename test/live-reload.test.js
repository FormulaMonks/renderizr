/**
 * Live reload on the diagrams page (spec 6.2, 6.3): which views a workspace
 * from disk touched, and which held edits still lie over it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importSrc, srcTest as test } from "./support/ts.js";

const { WorkspaceModel } = await importSrc("model/workspace");
const { heldEdits, viewSignature } = await importSrc("components/live-reload");

const FIXTURE = JSON.parse(
    readFileSync(
        new URL("./__fixtures__/view-types.json", import.meta.url),
        "utf8",
    ),
);

/** The fixture's workspace after `change` has edited a copy of it. */
const changed = (change = () => {}) => {
    const workspace = structuredClone(FIXTURE);
    change(workspace);
    return new WorkspaceModel(workspace);
};
const warehouse = (workspace) =>
    workspace.views.customViews.find((view) => view.key === "Warehouse");

test("a view the workspace left alone keeps its signature, whatever happened elsewhere", () => {
    const before = changed();
    const after = changed((workspace) => {
        workspace.description = "Changed on disk";
        workspace.views.systemLandscapeViews[0].elements[0].x = 999;
    });
    assert.equal(
        viewSignature(after, "Warehouse"),
        viewSignature(before, "Warehouse"),
    );
    assert.notEqual(
        viewSignature(after, "Landscape"),
        viewSignature(before, "Landscape"),
    );
});

test("a move, a vertex, a new member, a canvas or an id shift touches the view", () => {
    const before = viewSignature(changed(), "Warehouse");
    const touches = {
        move: (workspace) => {
            warehouse(workspace).elements[0].x += 5;
        },
        vertex: (workspace) => {
            warehouse(workspace).relationships[0].vertices = [{ x: 5, y: 5 }];
        },
        member: (workspace) => {
            warehouse(workspace).elements.push({ id: "1", x: 5, y: 5 });
        },
        canvas: (workspace) => {
            warehouse(workspace).dimensions = { width: 900, height: 900 };
        },
        // The same id now names another element, as when a DSL change
        // shifts ids.
        "id shift": (workspace) => {
            const rename = (node) => {
                if (Array.isArray(node)) node.forEach(rename);
                else if (node && typeof node === "object") {
                    if (node.id === "20" && "name" in node)
                        node.name = "Somebody else";
                    Object.values(node).forEach(rename);
                }
            };
            rename(workspace.model);
        },
    };
    for (const [name, touch] of Object.entries(touches))
        assert.notEqual(
            viewSignature(changed(touch), "Warehouse"),
            before,
            `${name} left the view untouched`,
        );
});

test("a view the workspace no longer has has no signature", () => {
    assert.equal(viewSignature(changed(), "Nowhere"), null);
});

test("held edits keep the elements and routes the view still has, and its canvas", () => {
    const after = changed((workspace) => {
        warehouse(workspace).elements = warehouse(workspace).elements.filter(
            (element) => element.id !== "21",
        );
        warehouse(workspace).relationships = warehouse(
            workspace,
        ).relationships.filter((relationship) => relationship.id !== "23");
    });
    const layout = {
        elements: { 20: { x: 1, y: 2 }, 21: { x: 3, y: 4 } },
        relationships: { 22: { vertices: [] }, 23: { vertices: [] } },
        dimensions: { width: 900, height: 900 },
    };
    assert.deepEqual(heldEdits(changed(), after, "Warehouse", layout), {
        elements: { 20: { x: 1, y: 2 } },
        relationships: { 22: { vertices: [] } },
        dimensions: { width: 900, height: 900 },
    });
    assert.deepEqual(heldEdits(changed(), after, "Nowhere", layout), {});
});

test("held edits leave out what the author never changed from the stored layout, so the file's layout shows there", () => {
    const before = changed();
    const stored = warehouse(structuredClone(FIXTURE));
    const unmoved = stored.elements.find((element) => element.id === "21");
    const after = changed((workspace) => {
        warehouse(workspace).elements.find(
            (element) => element.id === "21",
        ).x += 200;
    });
    const layout = {
        // A first edit carries every element, moved or not (spec 9.2).
        elements: {
            20: { x: 5, y: 5 },
            21: { x: unmoved.x, y: unmoved.y },
        },
        relationships: { 22: { vertices: [], routing: "Curved" } },
    };
    const routing = stored.relationships.find(
        (relationship) => relationship.id === "22",
    ).routing;
    assert.deepEqual(heldEdits(before, after, "Warehouse", layout), {
        elements: { 20: { x: 5, y: 5 } },
        relationships: {
            22:
                routing === "Curved"
                    ? { vertices: [] }
                    : { vertices: [], routing: "Curved" },
        },
    });
});
