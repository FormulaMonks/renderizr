/// <reference types="vite/client" />

declare const workspaceData: Record<string, unknown>;

/** Logo supplied via `--logo`, already embedded as a data URI. */
declare const __RENDERIZR_LOGO__: {
    src: string;
    alt: string;
    href: string | null;
    width: number | null;
    height: number | null;
} | null;

/** Font family supplied via `--font`. */
declare const __RENDERIZR_FONT__: string | null;

/** Renderizr's own version, read from package.json at build time. */
declare const __RENDERIZR_VERSION__: string | null;

/**
 * Whether the engine writes its geometry report (spec 15.1). Set only by the
 * acceptance harness, through `RENDERIZR_ENGINE_REPORT=1`.
 */
declare const __RENDERIZR_ENGINE_REPORT__: boolean;
