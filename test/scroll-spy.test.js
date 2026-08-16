/**
 * `src/components/scroll-spy.ts` — which heading the sidebar highlights.
 *
 * Its rules only make sense in terms of a reader: the heading under the sticky
 * header is not the one being read, the last heading has to win at the bottom
 * of the document even though it never crosses the band, and a reader above
 * everything is on the first heading. None of that is observable in a
 * screenshot, and all of it is observable here — the intersection observer and
 * the geometry are both under the test's control.
 */

import assert from "node:assert/strict";
import { beforeEach } from "node:test";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const { default: ScrollSpy } = await importSrc("components/scroll-spy");

const { document, window } = dom;

let reported;

beforeEach(() => {
    dom.reset();
    reported = [];
});

/** Three headings, stacked down a document taller than the viewport. */
function headings(tops = [0, 400, 800]) {
    const article = document.createElement("article");
    document.body.appendChild(article);

    return tops.map((top, index) => {
        const heading = document.createElement("h2");
        heading.setAttribute("id", `h${index + 1}`);
        heading.rect = { top, left: 0, width: 600, height: 32 };
        article.appendChild(heading);
        return heading;
    });
}

const spyOn = (targets) => {
    const spy = new ScrollSpy({
        targets,
        onChange: (id) => reported.push(id),
    });
    spy.render();
    return spy;
};

test("with nothing to track it reports nothing at all", () => {
    spyOn([]);

    assert.deepEqual(reported, [null]);
});

test("the first heading is current before the reader has scrolled", () => {
    spyOn(headings());

    assert.deepEqual(reported, ["h1"]);
});

test("the topmost heading inside the band wins", () => {
    const targets = headings();
    spyOn(targets);

    dom.intersect([targets[1], targets[2]]);

    assert.equal(reported.at(-1), "h2");
});

test("a heading that scrolls out of the band hands over to the next", () => {
    const targets = headings();
    spyOn(targets);

    dom.intersect([targets[1]]);

    // The reader keeps going: the first two headings are now above the
    // viewport, and the third has come into the band.
    targets[0].rect.top = -500;
    targets[1].rect.top = -100;
    dom.intersect([targets[1]], false);
    dom.intersect([targets[2]]);

    assert.deepEqual(reported, ["h1", "h2", "h3"]);
});

test("nothing changes, nothing is reported", () => {
    // The callback repaints the whole menu, so a scroll that changes nothing
    // must stay silent.
    const targets = headings();
    spyOn(targets);

    dom.intersect([targets[1]]);
    dom.intersect([targets[1]]);
    dom.intersect([targets[1]]);

    assert.deepEqual(reported, ["h1", "h2"]);
});

test("with the band empty, the last heading above it is current", () => {
    // Between two headings: the observer sees nothing, and the reader is
    // plainly still under the previous heading.
    const targets = headings([-500, -100, 900]);
    spyOn(targets);

    dom.intersect(targets, false);

    assert.equal(reported.at(-1), "h2");
});

test("the sticky header does not decide which heading is current", () => {
    // A heading tucked under the header is not the heading being read, so the
    // ceiling the spy measures against is the header's height.
    const header = document.createElement("div");
    header.classList.add("workspace-header");
    header.rect = { top: 0, left: 0, width: 1280, height: 120 };
    document.body.appendChild(header);

    const targets = headings([100, 300, 700]);
    spyOn(targets);

    dom.intersect(targets, false);

    assert.equal(
        reported.at(-1),
        "h1",
        "the second heading is below the header, so the first still holds",
    );
});

test("at the bottom of the document the last heading wins", () => {
    const targets = headings([-900, -600, -300]);
    document.documentElement.scrollHeight = 3000;
    window.innerHeight = 800;
    window.scrollY = 2200;

    spyOn(targets);

    assert.equal(reported.at(-1), "h3");
});

test("a scroll event is coalesced into one animation frame", () => {
    const targets = headings();
    spyOn(targets);

    document.documentElement.scrollHeight = 3000;
    window.scrollY = 2200;

    for (const listener of window.listenersFor("scroll")) listener();
    for (const listener of window.listenersFor("scroll")) listener();

    assert.equal(window.frames.length, 1, "three scrolls, one frame of work");

    dom.runFrames();
    assert.equal(reported.at(-1), "h3");
});

test("clear() detaches the observer and the window listeners", () => {
    const targets = headings();
    const spy = spyOn(targets);

    spy.clear();
    dom.intersect(targets);

    assert.deepEqual(reported, ["h1"]);
    assert.equal(window.listenersFor("scroll").length, 0);
    assert.equal(window.listenersFor("resize").length, 0);
});

test("render() twice does not leave two observers running", () => {
    const targets = headings();
    const spy = spyOn(targets);

    spy.render();
    dom.intersect([targets[1]]);

    assert.deepEqual(reported, ["h1", "h1", "h2"], "one report per change");
});
