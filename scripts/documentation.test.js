import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { prepareWorkspace } from "./assets.js";
import {
    CLASSES,
    decisionTitle,
    formatDecision,
    renderDecision,
    renderDocumentation,
    renderSection,
    STATUS_WORDS,
    sectionTitle,
} from "./documentation/index.js";
import { loadSet } from "./workspace-set.js";
import { readJsonFixture, REPO_ROOT } from "./__fixtures__/helpers.js";

/**
 * The build step that renders documentation (ADR 31): every section and
 * decision of every documentation scope, rendered to HTML in
 * `prepareWorkspace`. These pin what the step hands the page; what markdown-it
 * makes of each construct is in `test/markdown-renderer.test.js`.
 */

/** A section of `filename` holding `content`. */
const section = (filename, content, extra = {}) => ({
    title: "",
    order: 1,
    filename,
    format: "Markdown",
    content,
    ...extra,
});

/** Decision `id`, written the way adr-tools writes one. */
const decision = (id, body = "Because.", extra = {}) => ({
    id,
    title: `Decision ${id}`,
    date: "2024-01-01T00:00:00Z",
    status: "Accepted",
    format: "Markdown",
    links: [],
    content: `# ${id}. Decision ${id}\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\n## Context\n\n${body}\n`,
    ...extra,
});

/** A PNG the workspace embeds as `name`. */
const image = (name, content = "iVBORw0KGgo=") => ({
    name,
    type: "image/png",
    content,
});

/**
 * A workspace whose own documentation is `documentation`, with a software
 * system Internet Banking holding `system` and its container API holding
 * `container`.
 */
const workspace = ({ documentation, system, container } = {}) => ({
    name: "Bank",
    ...(documentation ? { documentation } : {}),
    model: {
        softwareSystems: [
            {
                id: "1",
                name: "Internet Banking",
                ...(system ? { documentation: system } : {}),
                containers: [
                    {
                        id: "2",
                        name: "API",
                        ...(container ? { documentation: container } : {}),
                    },
                ],
            },
        ],
    },
});

/* ------------------------------------------------------- scopes and payload */

test("a section of the workspace's documentation carries its HTML in place of its Markdown", async () => {
    const docs = {
        sections: [section("01-context.md", "# Context\n\nHello.\n")],
    };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.equal(
        docs.sections[0].content,
        '<h2 id="context" tabindex="-1">Context</h2>\n<p>Hello.</p>\n',
    );
    assert.equal(docs.sections[0].title, "Context");
});

test("a section of a software system and of a container render in their own scope", async () => {
    const system = { sections: [section("01-system.md", "# System\n")] };
    const container = { sections: [section("01-api.md", "# API\n")] };
    await renderDocumentation(workspace({ system, container }));

    assert.match(system.sections[0].content, /<h2 id="system"/);
    assert.match(container.sections[0].content, /<h2 id="api"/);
});

test("a decision of the workspace and of an element carry their HTML, with the status block formatted", async () => {
    const own = { decisions: [decision("1")] };
    const system = { decisions: [decision("1", "Its own.")] };
    await renderDocumentation(workspace({ documentation: own, system }));

    for (const [scope, body] of [
        [own, "Because."],
        [system, "Its own."],
    ]) {
        assert.equal(
            scope.decisions[0].content,
            `<h3 id="context" tabindex="-1">Context</h3>\n<p>${body}</p>\n`,
        );
        assert.equal(scope.decisions[0].title, "Decision 1");
    }
});

test("the decision graph keeps reading Structurizr's links", async () => {
    const links = [{ id: "2", description: "Supersedes" }];
    const docs = { decisions: [decision("1", "x", { links }), decision("2")] };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.deepEqual(docs.decisions[0].links, links);
});

test("a workspace with no documentation is left as it is", async () => {
    const json = workspace();
    const before = structuredClone(json);

    assert.equal(await renderDocumentation(json), json);
    assert.deepEqual(json, before);
});

test("a section with no content renders to nothing", async () => {
    assert.equal(await renderSection(section("01-empty.md", "  \n")), "");
    assert.equal(await renderDecision({ content: "" }), "");
});

test("a section with no file name or content renders to nothing rather than failing the build", async () => {
    const docs = { sections: [{ title: "Intro" }] };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.deepEqual(docs.sections, [{ title: "Intro", content: "" }]);
});

test("prepareWorkspace renders the documentation, so every build mode, pnpm dev and edit mode receive HTML", async () => {
    const prepared = await prepareWorkspace(readJsonFixture("workspace.json"));

    for (const { content } of [
        ...prepared.documentation.sections,
        ...prepared.documentation.decisions,
    ]) {
        assert.match(content, /^<(h\d|p|div)/, content);
        assert.ok(!content.includes("\n# "), content);
    }
});

/* ------------------------------------------------------------------- links */

test("a link between sections resolves to the section's page and heading", async () => {
    const docs = {
        sections: [
            section("01-context.md", "See [ops](02-ops.md#on-call).\n"),
            section("02-ops.md", "# Ops\n"),
        ],
    };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.match(
        docs.sections[0].content,
        /href="#\/\?page=docs&amp;section=02-ops&amp;subsection=on-call"/,
    );
});

test("a link inside an element's documentation reaches its own sections first, then the workspace's", async () => {
    const docs = {
        sections: [
            section("01-context.md", "# Workspace context\n"),
            section("02-glossary.md", "# Glossary\n"),
        ],
    };
    const system = {
        sections: [
            section(
                "01-context.md",
                "[own](01-context.md) and [shared](02-glossary.md)\n",
            ),
        ],
    };
    await renderDocumentation(workspace({ documentation: docs, system }));

    const html = system.sections[0].content;
    assert.match(
        html,
        /href="#\/\?page=docs&amp;section=internet-banking\/01-context"/,
    );
    assert.match(html, /href="#\/\?page=docs&amp;section=02-glossary"/);
});

test("a link to a decision resolves in the decision's own scope", async () => {
    const container = {
        decisions: [decision("1", "See [two](0002-two.md)."), decision("2")],
    };
    await renderDocumentation(workspace({ container }));

    assert.match(
        container.decisions[0].content,
        /href="#\/\?page=adrs&amp;adr=internet-banking\/api\/2"/,
    );
});

test("a link to a document the workspace lacks stops being a link", async () => {
    const docs = { sections: [section("01-a.md", "[gone](09-gone.md)\n")] };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.equal(
        docs.sections[0].content,
        `<p><span class="${CLASSES.unresolvedLink}" title="Not part of this workspace: 09-gone.md">gone</span></p>\n`,
    );
});

test("a link to a decision stays unresolved when the workspace shows no decisions", async () => {
    const docs = {
        sections: [section("01-a.md", "[adr](decisions/0001-a.md)\n")],
    };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.match(docs.sections[0].content, /rz-unresolved-link/);
});

test("each workspace of a set resolves against itself", async () => {
    const orders = workspace({
        documentation: {
            sections: [section("01-orders.md", "[api](02-api.md)\n")],
        },
    });
    const payments = workspace({
        documentation: {
            sections: [
                section("01-payments.md", "[api](02-api.md)\n"),
                section("02-api.md", "# API\n"),
            ],
        },
    });
    await renderDocumentation(orders);
    await renderDocumentation(payments);

    assert.match(
        orders.documentation.sections[0].content,
        /rz-unresolved-link/,
    );
    assert.match(
        payments.documentation.sections[0].content,
        /href="#\/\?page=docs&amp;section=02-api"/,
    );
});

test("a set's software system scoped workspace renders its documentation against itself", async () => {
    const set = await loadSet(["test/__fixtures__/enterprise-documentation"], {
        cwd: REPO_ROOT,
        env: {},
        output: { isTTY: false, write: () => true },
    });
    const [payments] = set.workspaces;
    const [system] = payments.workspace.model.softwareSystems.filter(
        (element) => element.documentation,
    );

    assert.match(
        system.documentation.sections[0].content,
        /href="#\/\?page=docs&amp;section=payments\/02-api"/,
    );
    assert.match(
        system.documentation.sections[0].content,
        /href="#\/\?page=adrs&amp;adr=payments\/2"/,
    );
});

/* ------------------------------------------------------------------ images */

test("an image resolves to the copy its scope embeds, then to the workspace's", async () => {
    const docs = {
        sections: [section("01-a.md", "# A\n")],
        images: [image("shared.png", "U0hBUkVE"), image("own.png", "V1M=")],
    };
    const system = {
        sections: [
            section("01-b.md", "![own](own.png) ![shared](./shared.png)\n"),
        ],
        images: [image("own.png", "T1dO")],
    };
    await renderDocumentation(workspace({ documentation: docs, system }));

    const html = system.sections[0].content;
    assert.match(html, /src="data:image\/png;base64,T1dO"/);
    assert.match(html, /src="data:image\/png;base64,U0hBUkVE"/);
});

test("the embedded images leave the payload once the HTML carries them", async () => {
    const docs = {
        sections: [section("01-a.md", "![a](a.png)\n")],
        images: [image("a.png")],
    };
    const system = {
        sections: [section("01-b.md", "![a](a.png)\n")],
        images: [image("b.png")],
    };
    await renderDocumentation(workspace({ documentation: docs, system }));

    assert.equal("images" in docs, false);
    assert.equal("images" in system, false);
    assert.match(system.sections[0].content, /src="data:image\/png/);
});

test("an image in a decision resolves too, and a remote one stays as written", async () => {
    const docs = {
        decisions: [
            decision("1", "![a](a.png) ![b](https://example.com/b.png)"),
        ],
        images: [image("a.png", "QQ==")],
    };
    await renderDocumentation(workspace({ documentation: docs }));

    const html = docs.decisions[0].content;
    assert.match(html, /src="data:image\/png;base64,QQ=="/);
    assert.match(html, /src="https:\/\/example.com\/b.png"/);
});

/* ------------------------------------------------------------------ titles */

test("a section's own title beats its first heading", () => {
    assert.equal(
        sectionTitle(section("01-a.md", "# Heading\n", { title: "Own" })),
        "Own",
    );
});

test("a section with no title takes its first # heading, never one in a deeper level", () => {
    assert.equal(
        sectionTitle(
            section("01-a.md", "## Not this\n\n# Written In The Document\n"),
        ),
        "Written In The Document",
    );
});

test("an AsciiDoc section takes its = heading", () => {
    assert.equal(
        sectionTitle(section("runbook.adoc", "= Runbook\n\nRestart.\n")),
        "Runbook",
    );
});

test("a section with no heading takes its file name, without the number", () => {
    assert.equal(
        sectionTitle(section("0004-record_the-facts.md", "Body.\n")),
        "Record The Facts",
    );
});

test("a decision's own title beats its heading", () => {
    assert.equal(decisionTitle(decision("3")), "Decision 3");
});

test("a decision with no title takes its first heading, without the number", () => {
    assert.equal(
        decisionTitle({ content: "# 3. Use Kafka\n\nDate: 2024-01-01\n" }),
        "Use Kafka",
    );
    assert.equal(decisionTitle({ content: "No heading." }), "");
});

/* ------------------------------------------------------ decision formatter */

test("the formatter drops the title, the date and a bare status word", () => {
    assert.equal(
        formatDecision(decision("1").content).trim(),
        "## Context\n\nBecause.",
    );
});

test("the formatter keeps each supersession note on a line of its own", async () => {
    const content =
        "# 4. Four\n\nDate: 2024-01-01\n\n## Status\n\nAccepted\n\nAmends 2.\nAmended by 9.\n\n## Context\n\nWhy.\n";

    assert.equal(
        await renderDecision({ content }),
        "<blockquote>\n<p>Amends 2.<br>\nAmended by 9.</p>\n</blockquote>\n" +
            '<h3 id="context" tabindex="-1">Context</h3>\n<p>Why.</p>\n',
    );
});

test("the status words the formatter drops are the ones the page knows", async () => {
    // The page's TypeScript loads only under the test hooks, so this reads
    // `DECISION_STATUS` from its source.
    const source = await readFile(
        join(REPO_ROOT, "src/model/decisions.ts"),
        "utf8",
    );
    const keys = [
        ...source
            .match(/DECISION_STATUS[^{]*\{([^}]*)\}/)[1]
            .matchAll(/(\w+):/g),
    ].map((match) => match[1]);

    assert.deepEqual([...STATUS_WORDS].sort(), keys.sort());
});

/* ---------------------------------------------------------------- AsciiDoc */

test("an AsciiDoc section goes through asciidoctor.js, its headings shifted like Markdown's", async () => {
    assert.equal(
        await renderSection(
            section("runbook.adoc", "= Runbook\n\n== Restart\n\nNow.\n"),
        ),
        '<h2 id="runbook" tabindex="-1">Runbook</h2>\n' +
            '<h3 id="restart" tabindex="-1">Restart</h3>\n<p>Now.</p>\n',
    );
});

test("the AsciiDoc format selects asciidoctor.js whatever the file name", async () => {
    assert.equal(
        await renderSection(
            section("runbook.txt", "NOTE: Careful.\n", { format: "AsciiDoc" }),
        ).then((html) => html.includes('class="rz-alert rz-alert-note"')),
        true,
    );
});

/**
 * One body of every AsciiDoc counterpart of what Markdown renders, and the
 * markup each has to come out as, whether a section or a decision holds it.
 */
const ASCIIDOC_BODY = [
    '[cols="1,2"]',
    "|===",
    "|Name |Role",
    "",
    "|api",
    "|serves",
    "|===",
    "",
    "[.line-through]#mistaken# H~2~O mc^2^ -- it's (C)",
    "",
    "WARNING: Mind the gap.",
    "",
    "[source,json]",
    "----",
    '{"a": 1}',
    "----",
].join("\n");

const assertAsciiDocBody = (html) => {
    assert.match(html, /<div class="rz-table"><table>\n<colgroup>/);
    assert.match(html, /<th>Name<\/th>/);
    assert.match(html, /<td>api<\/td>/);
    assert.match(html, /<s>mistaken<\/s>/);
    assert.match(html, /H<sub>2<\/sub>O mc<sup>2<\/sup>/);
    assert.match(html, /&#8201;&#8212;&#8201;it&#8217;s &#169;/);
    assert.match(
        html,
        /<div class="rz-alert rz-alert-warning">\n<div class="rz-alert-title"><svg [\s\S]*<span>Warning<\/span><\/div>\n<p>Mind the gap.<\/p>\n<\/div>/,
    );
    assert.match(
        html,
        /<pre><code class="language-json">[\s\S]*<span class="hljs-attr">&quot;a&quot;<\/span>/,
    );
};

test("an AsciiDoc section renders tables, strikethrough, sub and sup, alerts, typography and source blocks", async () => {
    const docs = {
        sections: [
            section("01-deploy.adoc", `= Deploy\n\n${ASCIIDOC_BODY}\n`, {
                format: "AsciiDoc",
            }),
        ],
    };
    await renderDocumentation(workspace({ documentation: docs }));

    assert.equal(docs.sections[0].title, "Deploy");
    assert.match(docs.sections[0].content, /^<h2 id="deploy" tabindex="-1">/);
    assertAsciiDocBody(docs.sections[0].content);
});

/** Decision `id` in AsciiDoc, its `== Status` holding `status`. */
const asciidocDecision = (id, body, status = "Accepted") => ({
    id,
    date: "2024-01-01T00:00:00Z",
    status: "Accepted",
    format: "AsciiDoc",
    links: [],
    content: `= ${id}. Render AsciiDoc\n\nDate: 2024-01-01\n\n== Status\n\n${status}\n\n== Context\n\n${body}\n`,
});

test("an AsciiDoc decision renders the same constructs, its status block formatted", async () => {
    const docs = { decisions: [asciidocDecision("4", ASCIIDOC_BODY)] };
    await renderDocumentation(workspace({ documentation: docs }));

    const [rendered] = docs.decisions;
    assert.equal(rendered.title, "Render AsciiDoc");
    assert.match(rendered.content, /^<h3 id="context" tabindex="-1">Context/);
    assert.ok(!rendered.content.includes("Date:"), rendered.content);
    assert.ok(!rendered.content.includes("Accepted"), rendered.content);
    assertAsciiDocBody(rendered.content);
});

test("an AsciiDoc decision keeps each supersession note on a line of its own", async () => {
    assert.equal(
        await renderDecision(
            asciidocDecision(
                "4",
                "Why.",
                "Accepted\n\nAmends 2.\nAmended by 9.",
            ),
        ),
        "<blockquote>\n<p>Amends 2.<br>\nAmended by 9.</p>\n</blockquote>\n" +
            '<h3 id="context" tabindex="-1">Context</h3>\n<p>Why.</p>\n',
    );
});

test("an AsciiDoc decision with no title takes its = heading, without the number", () => {
    assert.equal(
        decisionTitle({
            format: "AsciiDoc",
            content: "= 3. Use Kafka\n\nDate: 2024-01-01\n",
        }),
        "Use Kafka",
    );
});

test("links and images in AsciiDoc resolve in the document's own scope", async () => {
    const system = {
        sections: [
            section(
                "01-system.adoc",
                "xref:02-ops.adoc#on-call[Ops], xref:0001-one.adoc[the decision] and xref:09-gone.adoc[gone]\n\nimage::own.png[Own]\n",
            ),
            section("02-ops.adoc", "= Ops\n"),
        ],
        decisions: [asciidocDecision("1", "See link:01-system.adoc[it].")],
        images: [image("own.png", "T1dO")],
    };
    await renderDocumentation(workspace({ system }));

    const html = system.sections[0].content;
    assert.match(
        html,
        /href="#\/\?page=docs&amp;section=internet-banking\/02-ops.adoc&amp;subsection=on-call"/,
    );
    assert.match(
        html,
        /rz-unresolved-link" title="Not part of this workspace: 09-gone.adoc">gone/,
    );
    assert.match(html, /src="data:image\/png;base64,T1dO"/);
    assert.match(
        system.decisions[0].content,
        /href="#\/\?page=docs&amp;section=internet-banking\/01-system.adoc"/,
    );
});

/* ------------------------------------------------------------ heading ids */

test("headings take GitHub's ids, shifted one level", async () => {
    assert.equal(
        await renderSection(section("01-a.md", "# A & B\n\n## A & B\n")),
        '<h2 id="a--b" tabindex="-1">A &amp; B</h2>\n' +
            '<h3 id="a--b-1" tabindex="-1">A &amp; B</h3>\n',
    );
});

/* -------------------------------------------------------------- class names */

test("the rendered HTML carries the same class names from build to build", async () => {
    const html = await renderSection(
        section("01-a.md", "| a |\n|---|\n| 1 |\n\n> [!NOTE]\n> Hi.\n"),
    );

    assert.match(html, /<div class="rz-table"><table>/);
    assert.match(html, /<div class="rz-alert rz-alert-note">/);
    assert.match(html, /<div class="rz-alert-title">/);
});
