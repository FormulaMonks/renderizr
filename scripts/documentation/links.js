/**
 * The link resolver the build renders documentation with (ADR 31): a
 * relative link between the author's own files becomes the address of the
 * page of this site that shows the same document, and a heading gets the id
 * GitHub would give it, so links written for GitHub land here too.
 */

import {
    scopedId,
    searchOf,
    sectionId,
} from "../../src/model/documentation-scopes.js";
import { decodeAddress, HAS_SCHEME } from "./addresses.js";

/**
 * What a link in the documentation turns into.
 *
 * - a string: the in-app route to use as the new `href`
 * - `null`: a link to a document that is not part of this workspace
 * - `undefined`: not a link this resolver has an opinion about; left alone
 *
 * @typedef {string | null | undefined} ResolvedLink
 * @typedef {(href: string) => ResolvedLink} LinkResolver
 * @typedef {"docs" | "decisions"} LinkContext Where the link sits, which
 *   decides how a bare `0003-foo.md` is read.
 */

const DOCUMENT_FILE = /\.(md|markdown|adoc|asciidoc)$/i;
const DECISION_FILE = /^(\d+)[-_. ]/;
const DECISIONS_DIRECTORY = /^(decisions?|adrs?)$/i;

/**
 * Turn a `markdown-it` heading into the id GitHub would give it.
 *
 * These documents are written to be read on GitHub first, so their own
 * cross-references — `[terms](#customs--documentation-terms)` — use GitHub's
 * slugs. `markdown-it-anchor`'s default percent-encodes instead, which gave
 * that heading the id `customs-%26-documentation-terms`: every link to a
 * heading with an `&`, a `/`, a `?` or a `.` in it went nowhere, and the id
 * was double-encoded again on its way into the URL.
 *
 * This is `github-slugger`'s rule: lowercase, drop everything that is not a
 * letter, mark, number, connector, space or hyphen, then spaces become
 * hyphens. It is not trimmed and runs of hyphens are not collapsed, because
 * GitHub does neither — `A & B` really is `a--b`.
 *
 * @param {string} text
 * @returns {string}
 */
export const githubSlug = (text) =>
    text
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
        .replace(/ /g, "-");

/**
 * Resolve the relative links authors write between their own files —
 * `04-file-definitions.md#1-cbp-form-7501`, `../decisions/0052-duty-line.md`
 * — to the page and heading of this site that holds the same content.
 *
 * On GitHub those paths are real files. Here every section and decision lives
 * in one document behind a hash router, so left as they were they resolved
 * against the page's own URL and led nowhere — out of the artifact entirely,
 * in a single-file build.
 *
 * `docs` and `decisions` each hold the page that shows them, the workspace's
 * own sections or decisions, and every documentation scope, so a link inside
 * an element's documentation reaches that element's documents first. Either
 * is `null` when the workspace shows no such page.
 *
 * @param {{
 *   docs?: { page: string, sections: object[], scopes?: object[] } | null,
 *   decisions?: { page: string, decisions: object[], scopes?: object[] } | null,
 * }} options
 * @returns {(context: LinkContext, scope?: string) => LinkResolver}
 */
export function createLinkResolver({ docs, decisions }) {
    /** File name -> addressed section id, of the scope at each slug path. */
    const sectionsIn = (path, list) =>
        new Map(
            list.map((section) => [
                ((section.filename ?? "").split("/").pop() ?? "").toLowerCase(),
                scopedId(path, sectionId(section)),
            ]),
        );
    const sections = sectionsIn("", docs?.sections ?? []);
    const scopeSections = new Map(
        (docs?.scopes ?? [])
            .filter((scope) => scope.path)
            .map((scope) => [
                scope.path,
                sectionsIn(scope.path, scope.sections),
            ]),
    );
    /** Number -> addressed decision id, of the scope at each slug path. */
    const decisionsIn = (path, list) =>
        new Map(
            list.map((decision) => [
                Number(decision.id),
                scopedId(path, decision.id),
            ]),
        );
    const decisionIds = decisionsIn("", decisions?.decisions ?? []);
    const scopeDecisions = new Map(
        (decisions?.scopes ?? [])
            .filter((scope) => scope.path)
            .map((scope) => [
                scope.path,
                decisionsIn(scope.path, scope.decisions),
            ]),
    );

    const route = (search) => `#/?${searchOf(search)}`;

    // `scope` is the slug path of the documentation scope the link sits in;
    // its own sections come first, then the workspace's.
    return (context, scope) => (href) => {
        if (!href || href.startsWith("#") || href.startsWith("/")) return;
        if (HAS_SCHEME.test(href)) return;

        const hashAt = href.indexOf("#");
        const path = (hashAt >= 0 ? href.slice(0, hashAt) : href).split("?")[0];
        const fragment =
            hashAt >= 0 ? decodeAddress(href.slice(hashAt + 1)) : "";

        // An image or a CSV next to the markdown is not ours to reroute.
        if (!DOCUMENT_FILE.test(path)) return;

        const segments = decodeAddress(path).split("/").filter(Boolean);
        const name = (segments.pop() ?? "").toLowerCase();

        const section =
            docs &&
            (scopeSections.get(scope ?? "")?.get(name) ?? sections.get(name));
        if (docs && section) {
            return route({
                page: docs.page,
                section,
                ...(fragment ? { subsection: fragment } : {}),
            });
        }

        // `0003-foo.md` is a decision when it sits in a decisions directory,
        // or next to the decision linking to it.
        const number = name.match(DECISION_FILE)?.[1];
        const inDecisions =
            segments.some((segment) => DECISIONS_DIRECTORY.test(segment)) ||
            (context === "decisions" && !segments.length);
        const decision =
            number !== undefined && inDecisions
                ? (scopeDecisions.get(scope ?? "")?.get(Number(number)) ??
                  decisionIds.get(Number(number)))
                : undefined;

        if (decisions && decision !== undefined) {
            return route({ page: decisions.page, adr: decision });
        }

        return null;
    };
}
