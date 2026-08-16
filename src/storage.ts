/**
 * localStorage throws outright in an opaque-origin frame — which is exactly
 * where a published artifact runs. Preferences are a nicety; losing them must
 * never take the page down with them.
 */
export function readSetting(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeSetting(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        /* storage unavailable — the setting simply does not persist */
    }
}

/*
 * The page theme used to be stamped here, slaved to the diagram's dark-mode
 * flag. The two are now separate preferences — a reader can keep light
 * diagrams inside dark documentation — so the page theme lives in
 * `components/theme.ts` and the diagram's in `components/current-view.ts`.
 */
