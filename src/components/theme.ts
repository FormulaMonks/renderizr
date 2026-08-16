import { readSetting, writeSetting } from "../storage";

/**
 * Page theme controller.
 *
 * Owns the *page* colour scheme only. Diagrams keep their own, independent
 * preference (see `current-view.ts`), so a reader can view diagrams in light
 * mode while reading documentation in dark mode, or the other way around.
 *
 * The resolved theme is always mirrored onto `<html data-theme="light|dark">`
 * so CSS never has to branch on `prefers-color-scheme`, and onto
 * `<html data-theme-mode="light|dark|system">` so the toggle can render the
 * mode the reader actually picked rather than the one it resolved to.
 */

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "renderizr:theme";

const MODES: ThemeMode[] = ["system", "light", "dark"];

const listeners = new Set<(resolved: ResolvedTheme, mode: ThemeMode) => void>();

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function readStoredMode(): ThemeMode {
    const stored = readSetting(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
    }

    return "system";
}

let mode: ThemeMode = readStoredMode();

export function getMode(): ThemeMode {
    return mode;
}

export function getResolvedTheme(): ResolvedTheme {
    if (mode !== "system") return mode;
    return darkQuery().matches ? "dark" : "light";
}

function apply() {
    const resolved = getResolvedTheme();
    const root = document.documentElement;

    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;

    for (const listener of listeners) listener(resolved, mode);
}

export function setMode(next: ThemeMode): void {
    mode = next;
    writeSetting(THEME_STORAGE_KEY, next);
    apply();
}

/** Cycles system -> light -> dark -> system. */
export function cycleMode(): ThemeMode {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    setMode(next);
    return next;
}

/** Subscribe to resolved-theme changes. Returns an unsubscribe function. */
export function onThemeChange(
    listener: (resolved: ResolvedTheme, mode: ThemeMode) => void,
): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

let initialised = false;

export function initTheme(): void {
    if (initialised) return;
    initialised = true;

    darkQuery().addEventListener("change", () => {
        // Only the "system" mode tracks the OS preference.
        if (mode === "system") apply();
    });

    apply();
}
