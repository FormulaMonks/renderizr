/**
 * `src/components/doc-links.ts` — how a link written between files on GitHub
 * becomes a link between pages of the rendered site.
 *
 * The documents are authored to be read on GitHub, so the two things they
 * get from GitHub for free — heading ids, and relative paths to sibling files
 * — are both reproduced here, and both are what these pin.
 */

import assert from "node:assert/strict";
import { importSrc, srcTest as test } from "./support/ts.js";

const { sectionId } = await importSrc("model/documentation");
const { createLinkResolver, githubSlug } = await importSrc(
    "components/doc-links",
);

const SECTIONS = [
    { filename: "01-context.md", order: 1, content: "" },
    { filename: "04-file-definitions.md", order: 4, content: "" },
];

const DECISIONS = [{ id: "5" }, { id: "52" }];

const resolver = createLinkResolver({
    docs: { page: "docs", sections: SECTIONS },
    decisions: { page: "adrs", decisions: DECISIONS },
});

const inDocs = resolver("docs");
const inDecisions = resolver("decisions");

/* ------------------------------------------------------------------ slugs */

test("an ampersand is dropped and leaves both spaces as hyphens, as on GitHub", () => {
    assert.equal(
        githubSlug("Customs & documentation terms"),
        "customs--documentation-terms",
    );
});

test("punctuation goes, hyphens and underscores stay, case is folded", () => {
    assert.equal(
        githubSlug("1. CBP Form 7501 — Entry Summary (supporting evidence)"),
        "1-cbp-form-7501--entry-summary-supporting-evidence",
    );
    assert.equal(
        githubSlug("snake_case & kebab-case"),
        "snake_case--kebab-case",
    );
});

test("letters outside ASCII are kept rather than percent-encoded", () => {
    assert.equal(githubSlug("Café Größe"), "café-größe");
});

/* ---------------------------------------------------------- section links */

test("a sibling section becomes a route to that section", () => {
    assert.equal(
        inDocs("04-file-definitions.md"),
        "#/?page=docs&section=04-file-definitions",
    );
});

test("a fragment rides along as the subsection to open", () => {
    assert.equal(
        inDocs("04-file-definitions.md#1-cbp-form-7501"),
        "#/?page=docs&section=04-file-definitions&subsection=1-cbp-form-7501",
    );
});

test("the directory in front of a section does not matter", () => {
    // Decisions link into the docs as `../docs/01-context.md`.
    assert.equal(
        inDecisions("../docs/01-context.md#background"),
        "#/?page=docs&section=01-context&subsection=background",
    );
});

test("the section id is the one the docs page addresses it by", () => {
    assert.equal(sectionId(SECTIONS[0]), "01-context");
    assert.equal(sectionId({ ...SECTIONS[0], id: "context" }), "context");
});

/* --------------------------------------------------------- decision links */

test("a file in a decisions directory is the decision with that number", () => {
    assert.equal(
        inDocs("../decisions/0052-a-duty-line-is-the-grain.md"),
        "#/?page=adrs&adr=52",
    );
});

test("from one decision, a bare sibling file is another decision", () => {
    assert.equal(inDecisions("0005-valid-case-data.md"), "#/?page=adrs&adr=5");
});

test("from the docs, a bare numbered file is not taken for a decision", () => {
    assert.equal(inDocs("0005-valid-case-data.md"), null);
});

test("a decision the workspace does not hold is unresolved", () => {
    assert.equal(inDocs("../decisions/0099-missing.md"), null);
});

/* ------------------------------------------------------- everything else */

test("a document the workspace does not include is unresolved", () => {
    assert.equal(inDocs("reference/data-model.md#tables"), null);
});

test("links that are not to documents are left alone", () => {
    for (const href of [
        "https://www.cbp.gov/",
        "mailto:someone@example.com",
        "#customs--documentation-terms",
        "/absolute/path.md",
        "diagram.png",
        "data.csv",
        "",
    ]) {
        assert.equal(inDocs(href), undefined, href);
    }
});

test("without a docs page, a section link has nowhere to go", () => {
    const decisionsOnly = createLinkResolver({
        decisions: { page: "adrs", decisions: DECISIONS },
    })("decisions");

    assert.equal(decisionsOnly("../docs/01-context.md"), null);
});

/* ------------------------------------------------- documentation scopes */

const { documentationScopes } = await importSrc("model/documentation");

const SCOPED = documentationScopes({
    name: "Big Bank plc",
    documentation: { sections: SECTIONS },
    model: {
        softwareSystems: [
            {
                id: "1",
                name: "Internet Banking System",
                documentation: {
                    sections: [
                        { filename: "01-context.md", order: 1, content: "" },
                        { filename: "02-deployment.md", order: 2, content: "" },
                    ],
                },
                containers: [
                    {
                        id: "2",
                        name: "API Application",
                        documentation: {
                            sections: [
                                {
                                    filename: "01-overview.md",
                                    order: 1,
                                    content: "",
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    },
});

const scoped = createLinkResolver({
    docs: { page: "docs", sections: SECTIONS, scopes: SCOPED },
    decisions: { page: "adrs", decisions: DECISIONS },
});

test("a relative link inside an element's documentation resolves in its own scope first", () => {
    assert.equal(
        scoped("docs", "internet-banking-system")("01-context.md#goals"),
        "#/?page=docs&section=internet-banking-system/01-context&subsection=goals",
    );
    assert.equal(
        scoped(
            "docs",
            "internet-banking-system/api-application",
        )("01-overview.md"),
        "#/?page=docs&section=internet-banking-system/api-application/01-overview",
    );
});

test("a relative link its own scope lacks falls back to the workspace's", () => {
    assert.equal(
        scoped(
            "docs",
            "internet-banking-system/api-application",
        )("../../04-file-definitions.md"),
        "#/?page=docs&section=04-file-definitions",
    );
});

test("a relative link neither its scope nor the workspace holds stays broken", () => {
    assert.equal(
        scoped("docs", "internet-banking-system")("09-missing.md"),
        null,
    );
});

test("a relative link never reaches another element's sections", () => {
    // 02-deployment.md lives on Internet Banking System, not on its container.
    assert.equal(
        scoped(
            "docs",
            "internet-banking-system/api-application",
        )("02-deployment.md"),
        null,
    );
});

test("the workspace scope resolves links as before", () => {
    assert.equal(
        scoped("docs")("01-context.md"),
        "#/?page=docs&section=01-context",
    );
    assert.equal(
        scoped("docs", "")("01-context.md"),
        "#/?page=docs&section=01-context",
    );
});
