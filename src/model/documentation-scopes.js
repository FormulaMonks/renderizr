/**
 * How the workspace's documentation is addressed, and the documentation
 * scopes that carry it: the one walk over the workspace, its software
 * systems, their containers and their components. Plain JavaScript, so the
 * page and the build step that renders the documentation
 * (`scripts/documentation/`) run this one copy; `documentation-scopes.d.ts`
 * types it for the page, and `documentation.ts` holds the types it returns.
 */

import { carries } from "./carries.js";
import { siblingSlugs, slugOf } from "./slug.js";

/**
 * The id a documentation section is addressed by in the URL. Shared by the
 * docs page, its links and the activation targets, so none of them can
 * disagree about it.
 *
 * @param {{ id?: string, filename?: string }} section
 * @returns {string}
 */
export const sectionId = (section) =>
    section.id ?? (section.filename ?? "").replace(/\.md$/, "");

/**
 * The id a document of the documentation scope at slug path `path` is
 * addressed by: the slug path rides in front of the document's own id, and
 * the workspace scope (`""`) adds nothing (ADR 30).
 *
 * @param {string} path
 * @param {string} id
 * @returns {string}
 */
export const scopedId = (path, id) => (path ? `${path}/${id}` : id);

/**
 * The query string of `params`, keeping the `/` of a slug path as it is:
 * `section=internet-banking-system/01-context` reads better than `%2F`, and
 * a query may hold a `/` unencoded.
 *
 * @param {URLSearchParams | Record<string, string>} params
 * @returns {string}
 */
export const searchOf = (params) =>
    new URLSearchParams(params).toString().replace(/%2F/gi, "/");

/** What an element of each type holds, and as what. */
const CHILDREN = {
    "Software System": {
        type: "Container",
        of: (element) => element.containers,
    },
    Container: { type: "Component", of: (element) => element.components },
    Component: undefined,
};

/**
 * Every software system, container and component of `workspace` in model
 * order with its slug path, and the siblings whose slugs collided.
 *
 * @param {object} workspace
 */
export function placeElements(workspace) {
    const placed = [];
    const collisions = [];

    const place = (elements, type, above) => {
        const slugs = siblingSlugs(elements.map((element) => element.name));
        const children = elements.map((element, index) => ({
            type,
            element,
            names: [...(above?.names ?? []), String(element.name ?? "")],
            path: above ? `${above.path}/${slugs[index]}` : slugs[index],
            ancestors: above ? [above.path, ...above.ancestors] : [],
        }));

        const bySlug = new Map();
        for (const child of children) {
            const slug = slugOf(child.element.name);
            bySlug.set(slug, [...(bySlug.get(slug) ?? []), child]);
        }
        for (const [slug, siblings] of bySlug)
            if (siblings.length > 1)
                collisions.push({
                    parent: above?.path ?? "",
                    slug,
                    names: siblings.map((sibling) => sibling.names.at(-1)),
                    paths: siblings.map((sibling) => sibling.path),
                });

        const next = CHILDREN[type];
        for (const child of children) {
            placed.push(child);
            const held = next?.of(child.element);
            if (next && Array.isArray(held)) place(held, next.type, child);
        }
    };

    place(workspace.model?.softwareSystems ?? [], "Software System", null);
    return { placed, collisions };
}

/**
 * The documentation scopes of `workspace` in model order: the workspace,
 * then each software system, its containers and their components, keeping
 * only those that carry sections or decisions. Every software system,
 * container and component counts. A scope whose parent carries nothing
 * hangs from the nearest ancestor that does. Each takes its slug path by the
 * one slug rule, the later of two siblings that slug the same taking `-2`,
 * the next `-3`, whether or not the siblings carry anything (ADR 30).
 *
 * Each scope holds its element's own lists, not copies, so the build step
 * that renders them renders the workspace's.
 *
 * @param {object} workspace
 */
export function documentationScopes(workspace) {
    const scopes = [];
    const own = workspace.documentation;
    if (carries(own))
        scopes.push({
            type: "Workspace",
            name: workspace.name ?? "",
            elementId: null,
            names: [],
            path: "",
            parent: null,
            depth: 0,
            sections: own?.sections ?? [],
            decisions: own?.decisions ?? [],
            images: own?.images ?? [],
        });

    const depthOf = new Map();
    for (const { type, element, names, path, ancestors } of placeElements(
        workspace,
    ).placed) {
        const documentation = element.documentation;
        if (!carries(documentation)) continue;
        const parent = ancestors.find((above) => depthOf.has(above)) ?? null;
        const depth = parent === null ? 0 : depthOf.get(parent) + 1;
        depthOf.set(path, depth);
        scopes.push({
            type,
            name: names.at(-1),
            elementId: element.id ?? null,
            names,
            path,
            parent,
            depth,
            sections: documentation?.sections ?? [],
            decisions: documentation?.decisions ?? [],
            images: documentation?.images ?? [],
        });
    }
    return scopes;
}
