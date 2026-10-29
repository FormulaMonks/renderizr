/// <reference types="vite/client" />

declare const workspaceData: Record<string, unknown>;

/**
 * The header logo of the workspace the page lands on (`--logo`, then
 * `renderizr.logo`), already embedded as a data URI.
 */
declare const __RENDERIZR_LOGO__: import("virtual:renderizr/set").Logo | null;

/** Font family of the workspace the page lands on (`--font`, then `renderizr.font`). */
declare const __RENDERIZR_FONT__: string | null;

/** Renderizr's own version, read from package.json at build time. */
declare const __RENDERIZR_VERSION__: string | null;

/**
 * When the site was built (or the dev server or edit mode started), as an
 * ISO timestamp: the export's title block gives its date when the workspace
 * holds no `lastModifiedDate`.
 */
declare const __RENDERIZR_BUILD_DATE__: string;

/**
 * The branding's primary color (`--primary-color`, then
 * `renderizr.primaryColor`), or `null` when neither sets one: what a silent
 * Mermaid source fills its nodes with, as a literal export can draw.
 */
declare const __RENDERIZR_PRIMARY_COLOR__: string | null;

/**
 * Whether the engine writes its geometry report (spec 15.1). Set only by the
 * acceptance harness, through `RENDERIZR_ENGINE_REPORT=1`.
 */
declare const __RENDERIZR_ENGINE_REPORT__: boolean;

/**
 * Whether edit mode's page code is compiled in (ADR 15). True only on the
 * server `renderizr edit` starts; every build sets it to false, so no edit
 * mode code reaches built output.
 */
declare const __RENDERIZR_EDIT_MODE__: boolean;

/** The workspace the page renders: compiled in by a build, served from disk by edit mode. */
declare module "virtual:renderizr/workspace" {
    const workspace: Record<string, unknown>;
    export default workspace;
    /** The version of `workspace.json` edit mode served; `null` in a build. */
    export const version: string | null;
    /**
     * The DSL pipeline's error while its last run failed, and whether no run
     * has succeeded yet, so there is no workspace to draw; `null` in a build.
     */
    export const error: { message: string; blank: boolean } | null;
}

/**
 * The rest of the set the page holds (ADR 26): the software system scoped
 * workspaces the landscape scoped workspace maps. A lone workspace's set
 * names none. `scripts/plugins.js` compiles it in.
 */
declare module "virtual:renderizr/set" {
    /** A header logo, embedded as a data URI. */
    export type Logo = {
        src: string;
        alt: string;
        href: string | null;
        width: number | null;
        height: number | null;
    };
    /** A workspace's branding, applied when the reader enters it. */
    export type Branding = {
        logo: Logo | null;
        /**
         * The font's family and its embedded `@font-face` rules, `css: null`
         * when the page already holds them.
         */
        font: { family: string; css: string | null } | null;
        primaryColor: string | null;
    };
    /** An element of one workspace that leads into another of the set. */
    export type Crossing = {
        element: string;
        slug: string;
        via: "workspace-link" | "followed-link" | "name";
        url?: string;
    };
    /** A workspace of the set as the page enters it: `<slug>.json`. */
    export type WorkspacePayload = {
        workspace: Record<string, unknown>;
        branding: Branding;
        crossings: Crossing[];
    };
    /** The landscape scoped workspace's crossings. */
    export const crossings: Crossing[];
    /** The set's other workspaces, by slug and name. */
    export const workspaces: { slug: string; name: string }[];
    /** Every other workspace by slug under `--single-file`; `null` otherwise. */
    export const inlined: Record<string, WorkspacePayload> | null;
}
