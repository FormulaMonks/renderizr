/**
 * How the workspace's documentation is addressed. The model lists the ids a
 * link may lead to, and the docs page and its links address the same
 * sections, so the rule lives here where all of them can reach it.
 */

import type {
    Decision,
    DocumentationImage,
    DocumentationSection,
} from "../types/structurizr-documentation";
import { carries } from "./carries.js";
import {
    documentationScopes,
    placeElements,
    scopedId,
    searchOf,
    sectionId,
} from "./documentation-scopes.js";
import { siblingSlugs, slugOf } from "./slug.js";

export {
    documentationScopes,
    scopedId,
    searchOf,
    sectionId,
    siblingSlugs,
    slugOf,
};

/* ---------------------------------------------------- documentation scopes */

/**
 * Structurizr's name for the workspace's own documentation scope, in a name
 * path; the decisions page's filter holds it for the same scope.
 */
export const WORKSPACE_SCOPE = "*";

/** What a documentation scope is: the workspace or the element it belongs to. */
export type DocumentationScopeType =
    | "Workspace"
    | "Software System"
    | "Container"
    | "Component";

/**
 * A documentation scope (see `GLOSSARY.md`): the workspace, a software
 * system, a container or a component, with the sections and decisions it
 * carries.
 */
export type DocumentationScope = {
    type: DocumentationScopeType;
    /** The element's name, or the workspace's. */
    name: string;
    /** The element's id; `null` for the workspace. */
    elementId: string | null;
    /**
     * Structurizr's name path, one name per element from the software
     * system down; empty for the workspace.
     */
    names: string[];
    /**
     * The slug path its documents are addressed by (ADR 30), one segment
     * per element from the software system down; `""` for the workspace.
     */
    path: string;
    /**
     * The path of the scope it nests under: the nearest ancestor element
     * that is a documentation scope. `null` at the top level, where the
     * workspace and each software system sit.
     */
    parent: string | null;
    /** How many scopes it nests under. */
    depth: number;
    sections: DocumentationSection[];
    decisions: Decision[];
    images: DocumentationImage[];
};

/**
 * What names `scope` beside other documentation scopes: the element's name,
 * or "Workspace" for the workspace's own.
 */
export const scopeLabel = (scope: Pick<DocumentationScope, "type" | "name">) =>
    scope.type === "Workspace" ? "Workspace" : scope.name;

/**
 * Two or more siblings whose names slug the same, where it reaches a
 * documentation scope: the later ones in model order take `-2`, `-3`.
 */
export type SlugCollision = {
    /** The slug path of the element they sit under; `""` at the top. */
    parent: string;
    /** The slug they share. */
    slug: string;
    /** Their names, in model order. */
    names: string[];
    /** The slug path each one takes, in the same order. */
    paths: string[];
};

type Documentation = {
    sections?: DocumentationSection[];
    decisions?: Decision[];
    images?: DocumentationImage[];
};

export type DocumentedElement = {
    id?: string;
    name?: string;
    documentation?: Documentation;
    containers?: DocumentedElement[];
    components?: DocumentedElement[];
};

/** The part of a workspace JSON that documentation scopes read. */
export type DocumentedWorkspace = {
    name?: string;
    documentation?: Documentation;
    model?: { softwareSystems?: DocumentedElement[] };
};

/**
 * The siblings of `workspace` whose slugs collide where it reaches a
 * documentation scope: one of them, or an element under one, carries
 * sections or decisions. `pnpm dev` and edit mode warn the author of each.
 */
export function slugCollisions(
    workspace: DocumentedWorkspace,
): SlugCollision[] {
    const { placed, collisions } = placeElements(workspace);
    const documented = placed
        .filter(({ element }) => carries(element.documentation))
        .map(({ path }) => path);
    const reaches = (path: string) =>
        documented.some(
            (scope) => scope === path || scope.startsWith(`${path}/`),
        );
    return collisions.filter(({ paths }) => paths.some(reaches));
}

/**
 * What the toast tells the author about `collisions`, or `null` when there
 * are none.
 */
export function slugCollisionWarning(
    collisions: readonly SlugCollision[],
): string | null {
    if (!collisions.length) return null;
    const each = collisions.map(
        ({ names, paths }) =>
            `${names.map((name) => `"${name}"`).join(", ")} share an address, so their documents take ${paths.join(", ")}`,
    );
    return `${each.join("; ")}. Rename one to give each its own address.`;
}
