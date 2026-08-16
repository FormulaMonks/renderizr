/**
 * The test DOM's own tests.
 *
 * Everything under `test/*-page.test.js`, `menu`, `router` and `navigation`
 * rests on `support/dom.js`, and a harness nobody checks is a place for a
 * false green to hide: a `querySelectorAll` that quietly returns nothing makes
 * "the menu rendered no stale entries" pass for the wrong reason. So the
 * pieces the suite leans on — parsing, serializing, selectors, bubbling,
 * `classList`, `dataset`, and the fake clock — are asserted directly here.
 */

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
    DOMEvent,
    decodeEntities,
    installDOM,
    parseDocument,
    parseNodes,
} from "./support/dom.js";

const dom = installDOM();
const { document, window } = dom;

beforeEach(() => dom.reset());

const parse = (html) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    return host;
};

/* --------------------------------------------------------------- parsing -- */

test("parses nested elements into a tree", () => {
    const host = parse("<ul><li><a href='#one'>One</a></li></ul>");

    assert.equal(host.children.length, 1);
    assert.equal(host.querySelector("a").getAttribute("href"), "#one");
    assert.equal(host.querySelector("a").textContent, "One");
    assert.equal(host.querySelector("li").parentNode.tagName, "UL");
});

test("keeps void elements from swallowing their siblings", () => {
    const host = parse("<p>before</p><hr><p>after</p>");

    assert.deepEqual(
        host.children.map((child) => child.tagName),
        ["P", "HR", "P"],
    );
    assert.equal(host.children[2].textContent, "after");
});

test("treats script content as text, not markup", () => {
    // The single-file artifact is one megabyte of exactly this, and a `<` in a
    // string literal must not be read as a tag.
    const host = parse("<script>const a = 1 < 2 && '</b>';</script><p>x</p>");

    assert.equal(host.children.length, 2);
    assert.equal(
        host.querySelector("script").textContent,
        "const a = 1 < 2 && '</b>';",
    );
    assert.equal(host.querySelector("p").textContent, "x");
});

test("parses unquoted and valueless attributes", () => {
    const host = parse('<input type=checkbox disabled data-id="7">');
    const input = host.querySelector("input");

    assert.equal(input.getAttribute("type"), "checkbox");
    assert.equal(input.getAttribute("disabled"), "");
    assert.equal(input.dataset.id, "7");
});

test("drops comments and doctypes", () => {
    const host = parse("<!doctype html><!-- note --><p>kept</p>");

    assert.equal(host.children.length, 1);
    assert.equal(host.textContent, "kept");
});

test("decodes entities in text and attributes", () => {
    assert.equal(decodeEntities("a &amp; b &#65; &#x42;"), "a & b A B");

    const host = parse('<a title="a &amp; b">5 &lt; 6</a>');
    assert.equal(host.querySelector("a").getAttribute("title"), "a & b");
    assert.equal(host.textContent, "5 < 6");
});

test("re-escapes text on the way back out", () => {
    const host = document.createElement("div");
    host.textContent = "5 < 6 & 7";

    assert.equal(host.innerHTML, "5 &lt; 6 &amp; 7");
});

test("survives a stray closing tag", () => {
    const host = parse("<p>one</div><p>two</p>");

    assert.equal(host.querySelectorAll("p").length, 2);
});

test("round-trips markdown-it's output", () => {
    // The docs page splits a rendered section by walking these very elements.
    const rendered =
        '<h2 id="a-title" tabindex="-1">A title</h2>\n<p>Body <code>x &lt; y</code></p>\n<pre><code>1 &amp; 2\n</code></pre>';
    const host = parse(rendered);

    assert.deepEqual(
        host.children.map((child) => child.tagName),
        ["H2", "P", "PRE"],
    );
    assert.equal(host.querySelector("code").textContent, "x < y");
    assert.equal(host.innerHTML.includes("&lt;"), true);
});

/* ------------------------------------------------------------- selectors -- */

test("matches tag, id, class and attribute selectors", () => {
    const host = parse(
        '<div id="wrap" class="a b"><a data-item-id="7" class="a">x</a></div>',
    );

    assert.ok(host.querySelector("#wrap"));
    assert.ok(host.querySelector(".a.b"));
    assert.ok(host.querySelector("a[data-item-id]"));
    assert.ok(host.querySelector('a[data-item-id="7"]'));
    assert.equal(host.querySelector('a[data-item-id="8"]'), null);
    assert.equal(host.querySelectorAll(".a").length, 2);
});

test("honors the child combinator", () => {
    const host = parse(
        "<ul><li><a>direct</a><ul><li><a>nested</a></li></ul></li></ul>",
    );

    assert.equal(host.querySelectorAll("ul > li > a").length, 2);
    assert.equal(host.querySelectorAll("ul > li > ul > li > a").length, 1);
    assert.equal(
        host.querySelector("ul > li > ul > li > a").textContent,
        "nested",
    );
});

test("honors descendant combinators and selector lists", () => {
    const host = parse("<section><p><em>deep</em></p></section><b>flat</b>");

    assert.equal(host.querySelectorAll("section em").length, 1);
    assert.equal(host.querySelectorAll("em, b").length, 2);
    assert.equal(host.querySelectorAll("b em").length, 0);
});

test("querySelectorAll never returns the element it was called on", () => {
    const host = parse("<div class='x'><div class='x'></div></div>");

    assert.equal(host.querySelectorAll("div").length, 2);
    assert.equal(host.children[0].querySelectorAll(".x").length, 1);
});

test("closest walks up and stops at the first match", () => {
    const host = parse('<a href="#3"><span><em>label</em></span></a>');
    const em = host.querySelector("em");

    assert.equal(em.closest("a").getAttribute("href"), "#3");
    assert.equal(em.closest("table"), null);
});

test("getElementById finds an id anywhere in the document", () => {
    document.body.innerHTML = '<main><p id="docs-breadcrumb"></p></main>';

    assert.equal(document.getElementById("docs-breadcrumb").tagName, "P");
    assert.equal(document.getElementById("missing"), null);
});

/* ---------------------------------------------------------------- events -- */

test("click events bubble to an ancestor listener", () => {
    const host = parse('<div id="page"><a href="#1"><span>go</span></a></div>');
    document.body.appendChild(host);

    const seen = [];
    host.children[0].addEventListener("click", (event) => {
        seen.push(event.target.tagName);
    });

    host.querySelector("span").click();

    assert.deepEqual(seen, ["SPAN"]);
});

test("stopPropagation halts the walk and preventDefault is observable", () => {
    const host = parse("<div><a><span>go</span></a></div>");
    document.body.appendChild(host);

    const seen = [];
    host.addEventListener("click", () => seen.push("outer"));
    host.querySelector("a").addEventListener("click", (event) => {
        seen.push("inner");
        event.stopPropagation();
        event.preventDefault();
    });

    const event = new DOMEvent("click", { bubbles: true });
    const notCancelled = host.querySelector("span").dispatchEvent(event);

    assert.deepEqual(seen, ["inner"]);
    assert.equal(notCancelled, false);
    assert.equal(event.defaultPrevented, true);
});

test("removeEventListener actually detaches", () => {
    const host = document.createElement("div");
    let calls = 0;
    const handler = () => {
        calls += 1;
    };

    host.addEventListener("click", handler);
    host.click();
    host.removeEventListener("click", handler);
    host.click();

    assert.equal(calls, 1);
});

/* ------------------------------------------------------ element mutation -- */

test("classList add, remove, toggle and contains agree with the attribute", () => {
    const element = document.createElement("div");

    element.classList.add("one", "two");
    assert.equal(element.getAttribute("class"), "one two");

    assert.equal(element.classList.toggle("one"), false);
    assert.equal(element.classList.contains("one"), false);

    element.classList.toggle("three", true);
    element.classList.toggle("two", false);
    assert.equal(element.className, "three");
});

test("dataset maps camelCase onto data- attributes both ways", () => {
    const element = document.createElement("a");

    element.dataset.itemId = "section:one";
    assert.equal(element.getAttribute("data-item-id"), "section:one");

    element.setAttribute("data-page-index", "4");
    assert.equal(element.dataset.pageIndex, "4");
    assert.equal(element.dataset.missing, undefined);
});

test("replaceWith swaps a node in place, keeping its position", () => {
    const host = parse("<div><p>a</p><h4 id='x'>b</h4><p>c</p></div>");
    const heading = host.querySelector("h4");
    const replacement = document.createElement("h1");

    replacement.setAttribute("id", heading.getAttribute("id"));
    replacement.innerHTML = heading.innerHTML;
    heading.replaceWith(replacement);

    assert.deepEqual(
        host.children[0].children.map((child) => child.tagName),
        ["P", "H1", "P"],
    );
    assert.equal(host.querySelector("#x").textContent, "b");
});

test("setting innerHTML detaches the previous children", () => {
    const host = parse("<p>old</p>");
    const old = host.children[0];

    host.innerHTML = "<p>new</p>";

    assert.equal(old.parentNode, null);
    assert.equal(host.textContent, "new");
});

test("a select reports the value that was assigned to it", () => {
    const select = document.createElement("select");
    for (const id of ["a", "b"]) {
        const option = document.createElement("option");
        option.value = id;
        select.appendChild(option);
    }

    assert.equal(select.value, "a", "defaults to the first option");
    select.value = "b";
    assert.equal(select.value, "b");
});

/* ------------------------------------------------- window, clock, history -- */

test("timers do not run until the test says so", () => {
    let ran = false;
    window.setTimeout(() => {
        ran = true;
    }, 100);

    assert.equal(ran, false);
    dom.runTimers();
    assert.equal(ran, true);
});

test("timers run soonest first and a cleared timer never runs", () => {
    const order = [];
    window.setTimeout(() => order.push("late"), 300);
    const canceled = window.setTimeout(() => order.push("canceled"), 10);
    window.setTimeout(() => order.push("early"), 100);
    window.clearTimeout(canceled);

    dom.runTimers();

    assert.deepEqual(order, ["early", "late"]);
});

test("matchMedia answers the width breakpoint the menu asks about", () => {
    const query = window.matchMedia("(min-width: 900px)");
    assert.equal(query.matches, true);

    let changes = 0;
    query.addEventListener("change", () => {
        changes += 1;
    });

    dom.setViewportWidth(600);

    assert.equal(query.matches, false);
    assert.equal(changes, 1);
});

test("pushState adds an entry that back() returns from", () => {
    window.history.pushState({ idx: 1 }, "", "#/?page=docs");
    assert.equal(window.location.hash, "#/?page=docs");

    const popped = [];
    window.addEventListener("popstate", () =>
        popped.push(window.location.hash),
    );
    window.history.back();

    assert.equal(popped.length, 1);
    assert.equal(window.location.hash, "");
});

test("assigning location.hash fires hashchange; pushState does not", () => {
    let hashChanges = 0;
    window.addEventListener("hashchange", () => {
        hashChanges += 1;
    });

    window.history.pushState(null, "", "#/?page=adrs");
    assert.equal(hashChanges, 0);

    window.location.hash = "#/?page=docs";
    assert.equal(hashChanges, 1);
});

test("localStorage keeps values and reset() empties it", () => {
    window.localStorage.setItem("renderizr:theme", "dark");
    assert.equal(window.localStorage.getItem("renderizr:theme"), "dark");

    dom.reset();
    assert.equal(window.localStorage.getItem("renderizr:theme"), null);
});

/* --------------------------------------------------------- whole document -- */

test("parseDocument keeps head and body apart", () => {
    const parsed = parseDocument(
        "<!doctype html><html><head><title>Fixture</title></head><body><h1>Hi</h1></body></html>",
    );

    assert.equal(parsed.title, "Fixture");
    assert.equal(parsed.body.querySelector("h1").textContent, "Hi");
    assert.equal(parsed.querySelector("h1").textContent, "Hi");
});

test("parseNodes returns detached roots", () => {
    const [first, second] = parseNodes("<p>a</p><p>b</p>", document);

    assert.equal(first.parentNode, null);
    assert.equal(second.textContent, "b");
});
