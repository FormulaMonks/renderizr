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

/**
 * One switch for the whole page. Structurizr's engine keeps its own dark-mode
 * flag for the canvas; this stamps the same choice on the document so the
 * chrome around the canvas cannot end up in the opposite theme.
 */
export function applyTheme(dark: boolean): void {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
}
