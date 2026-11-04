/**
 * `src/perspective-address.ts`: the perspective a reader picks, held by the
 * address alone as `?perspective=<name>` beside `view`. A pick replaces the
 * history entry, a name the workspace lacks leaves the address with a
 * notice (silently after a crossing), the name stays across views, and a
 * shared link that opens a view carrying none of it says so once.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryHistory } from "history";
import { importSrc, srcTest as test } from "./support/ts.js";

const { followPerspective } = await importSrc("perspective-address");
const { WorkspaceModel, perspectiveOf, withPerspective } =
    await importSrc("model/index");

const model = new WorkspaceModel(
    JSON.parse(
        readFileSync(
            new URL("./__fixtures__/perspectives.json", import.meta.url),
            "utf-8",
        ),
    ),
);

/* ------------------------------------------------------------ the address */

test("the address names the perspective beside the view", () => {
    assert.equal(
        perspectiveOf("?page=diagrams&view=Context&perspective=Security"),
        "Security",
    );
    assert.equal(perspectiveOf("page=diagrams&view=Context"), null);
    assert.equal(perspectiveOf("?perspective="), null);
});

test("writing a perspective keeps the view and the page", () => {
    assert.equal(
        withPerspective("?page=diagrams&view=Context", "Security"),
        "page=diagrams&view=Context&perspective=Security",
    );
    assert.equal(
        withPerspective(
            "page=diagrams&view=Context&perspective=Security",
            "Ownership",
        ),
        "page=diagrams&view=Context&perspective=Ownership",
    );
});

test("writing no perspective removes it from the address", () => {
    assert.equal(
        withPerspective(
            "?page=diagrams&perspective=Security&view=Context",
            null,
        ),
        "page=diagrams&view=Context",
    );
});

/* ------------------------------------------------------------- following */

/**
 * A follower on the fixture from the address `start`, recording the
 * notices it shows and every perspective it applies.
 */
function follow(start, { crossed = false } = {}) {
    const history = createMemoryHistory({ initialEntries: [start] });
    const notices = [];
    const applied = [];
    const follower = followPerspective({
        history,
        model,
        workspace: "Shop",
        crossed,
        notice: (text) => notices.push(text),
        apply: (name) => applied.push(name),
    });
    return { history, follower, notices, applied };
}

const address = ({ location }) => `${location.pathname}${location.search}`;

test("a shared link opens with the perspective it names", () => {
    const page = follow("/?page=diagrams&view=Context&perspective=Security");
    assert.equal(page.follower.selected(), "Security");
    assert.deepEqual(page.notices, []);
    page.follower.stop();
});

test("a pick writes the address with a history replace and applies it", () => {
    const page = follow("/?page=diagrams&view=Context");
    page.follower.pick("Ownership");
    assert.equal(
        address(page.history),
        "/?page=diagrams&view=Context&perspective=Ownership",
    );
    assert.equal(page.history.action, "REPLACE");
    assert.equal(page.follower.selected(), "Ownership");
    assert.deepEqual(page.applied, ["Ownership"]);

    page.follower.pick(null);
    assert.equal(address(page.history), "/?page=diagrams&view=Context");
    assert.equal(page.history.action, "REPLACE");
    assert.deepEqual(page.applied, ["Ownership", null]);
    page.follower.stop();
});

test("a name the workspace lacks leaves the address, and a notice says so", () => {
    const page = follow("/?page=diagrams&view=Context&perspective=Securty");
    assert.equal(page.follower.selected(), null);
    assert.equal(address(page.history), "/?page=diagrams&view=Context");
    assert.deepEqual(page.notices, [
        "Shop has no perspective Securty, so the page shows none.",
    ]);
    page.follower.stop();
});

test("a typed name the workspace lacks leaves the address too", () => {
    const page = follow("/?page=diagrams&view=Context");
    page.history.push("/?page=diagrams&view=Context&perspective=Nope");
    assert.equal(page.follower.selected(), null);
    assert.equal(address(page.history), "/?page=diagrams&view=Context");
    assert.deepEqual(page.notices, [
        "Shop has no perspective Nope, so the page shows none.",
    ]);
    assert.deepEqual(page.applied, []);
    page.follower.stop();
});

test("the name stays across views, and moving between them applies nothing", () => {
    const page = follow("/?page=diagrams&view=Context&perspective=Security");
    page.follower.viewShown("Shop context", ["Ownership", "Security"]);
    page.history.push("/?page=diagrams&view=Mailing&perspective=Security");
    page.follower.viewShown("Mailing lists", []);
    page.history.push("/?page=diagrams&view=Containers&perspective=Security");
    page.follower.viewShown("Shop containers", ["Ownership", "Security"]);
    assert.equal(page.follower.selected(), "Security");
    assert.deepEqual(page.applied, []);
    assert.deepEqual(page.notices, []);
    page.follower.stop();
});

test("back to an address without the name switches it off", () => {
    const page = follow("/?page=diagrams&view=Context");
    page.history.push("/?page=diagrams&view=Containers&perspective=Security");
    page.history.back();
    assert.equal(page.follower.selected(), null);
    assert.deepEqual(page.applied, ["Security", null]);
    page.follower.stop();
});

test("a shared link opening a view that carries none of it says so once", () => {
    const page = follow("/?page=diagrams&view=Mailing&perspective=Security");
    page.follower.viewShown("Mailing lists", []);
    page.follower.viewShown("Mailing lists", []);
    page.history.push("/?page=diagrams&view=Context&perspective=Security");
    page.follower.viewShown("Shop context", ["Ownership", "Security"]);
    page.history.push("/?page=diagrams&view=Mailing&perspective=Security");
    page.follower.viewShown("Mailing lists", []);
    assert.deepEqual(page.notices, [
        "Nothing in Mailing lists carries the Security perspective.",
    ]);
    page.follower.stop();
});

test("a shared link opening a view that carries it says nothing", () => {
    const page = follow("/?page=diagrams&view=Context&perspective=Security");
    page.follower.viewShown("Shop context", ["Ownership", "Security"]);
    page.history.push("/?page=diagrams&view=Mailing&perspective=Security");
    page.follower.viewShown("Mailing lists", []);
    assert.deepEqual(page.notices, []);
    page.follower.stop();
});

test("a crossing keeps a name the workspace has", () => {
    const page = follow("/orders/?page=diagrams&perspective=Ownership", {
        crossed: true,
    });
    assert.equal(page.follower.selected(), "Ownership");
    page.follower.viewShown("Mailing lists", []);
    assert.deepEqual(page.notices, []);
    page.follower.stop();
});

test("a crossing drops a name the workspace lacks, silently", () => {
    const page = follow("/orders/?page=diagrams&perspective=Cost", {
        crossed: true,
    });
    assert.equal(page.follower.selected(), null);
    assert.equal(address(page.history), "/orders/?page=diagrams");
    assert.deepEqual(page.notices, []);
    page.follower.stop();
});

test("an address in another workspace or page is not the follower's", () => {
    const page = follow("/?page=diagrams&view=Context&perspective=Security");
    page.history.push("/orders/?page=diagrams&perspective=Nope");
    page.history.push("/?page=docs&perspective=Nope");
    assert.deepEqual(page.notices, []);
    assert.deepEqual(page.applied, []);
    page.follower.stop();
});

test("a stopped follower hears no address", () => {
    const page = follow("/?page=diagrams&view=Context");
    page.follower.stop();
    page.history.push("/?page=diagrams&view=Context&perspective=Security");
    assert.deepEqual(page.applied, []);
});
