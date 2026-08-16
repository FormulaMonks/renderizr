/**
 * `src/components/theme.ts` and `src/storage.ts`.
 *
 * The theme is the one preference that has to survive being published as a
 * Claude artifact, where the document runs in an opaque-origin frame and
 * `localStorage` throws on contact. A preference that cannot be saved must
 * degrade to "not saved" and never to a blank page, so the failure is asserted
 * here rather than assumed.
 */

import assert from "node:assert/strict";
import { beforeEach } from "node:test";
import { dom, importSrc, srcTest as test } from "./support/ts.js";

const theme = await importSrc("components/theme");
const { readSetting, writeSetting } = await importSrc("storage");

const { document, window } = dom;
const realStorage = window.localStorage;

beforeEach(() => {
    dom.reset();
    window.localStorage = realStorage;
    globalThis.localStorage = realStorage;
    theme.setMode("system");
});

/* ------------------------------------------------------------------ theme -- */

test("system mode resolves against the operating system", () => {
    assert.equal(theme.getResolvedTheme(), "light");

    dom.setColorScheme("dark");

    assert.equal(theme.getResolvedTheme(), "dark");
    assert.equal(theme.getMode(), "system", "resolving is not choosing");
});

test("an explicit mode ignores the operating system", () => {
    theme.setMode("light");
    dom.setColorScheme("dark");

    assert.equal(theme.getResolvedTheme(), "light");
});

test("the resolved theme and the chosen mode both reach the root element", () => {
    // The stylesheet branches on `data-theme`; the toggle needs to show the
    // mode the reader picked, which is not always the one it resolved to.
    theme.setMode("dark");

    assert.equal(document.documentElement.dataset.theme, "dark");
    assert.equal(document.documentElement.dataset.themeMode, "dark");

    theme.setMode("system");

    assert.equal(document.documentElement.dataset.theme, "light");
    assert.equal(document.documentElement.dataset.themeMode, "system");
});

test("cycleMode goes system, light, dark, system", () => {
    assert.equal(theme.cycleMode(), "light");
    assert.equal(theme.cycleMode(), "dark");
    assert.equal(theme.cycleMode(), "system");
});

test("subscribers hear the resolved theme and the mode, and can unsubscribe", () => {
    const seen = [];
    const unsubscribe = theme.onThemeChange((resolved, mode) =>
        seen.push(`${mode}:${resolved}`),
    );

    theme.setMode("dark");
    unsubscribe();
    theme.setMode("light");

    assert.deepEqual(seen, ["dark:dark"]);
});

test("initTheme follows the system while the reader is on system", () => {
    theme.initTheme();
    theme.setMode("system");

    dom.setColorScheme("dark");
    assert.equal(document.documentElement.dataset.theme, "dark");

    // …and stops following once they have chosen for themselves.
    theme.setMode("light");
    dom.setColorScheme("light");
    dom.setColorScheme("dark");
    assert.equal(document.documentElement.dataset.theme, "light");
});

test("initTheme is idempotent, so a re-render cannot stack up listeners", () => {
    const before = window.mediaQueries.size;

    theme.initTheme();
    theme.initTheme();

    assert.ok(window.mediaQueries.size - before <= 1);
});

/* ---------------------------------------------------------------- storage -- */

test("a setting written is a setting read back", () => {
    writeSetting("renderizr:theme", "dark");

    assert.equal(readSetting("renderizr:theme"), "dark");
    assert.equal(readSetting("renderizr:missing"), null);
});

test("storage that throws on read reports no setting", () => {
    // Exactly what an opaque-origin frame does.
    window.localStorage = {
        getItem() {
            throw new DOMException("denied");
        },
        setItem() {
            throw new DOMException("denied");
        },
    };

    assert.equal(readSetting("renderizr:theme"), null);
});

test("storage that throws on write is not an error the reader ever sees", () => {
    window.localStorage = {
        getItem: () => null,
        setItem() {
            throw new DOMException("denied");
        },
    };

    assert.doesNotThrow(() => writeSetting("renderizr:theme", "dark"));
    assert.doesNotThrow(() => theme.setMode("dark"));
    assert.equal(
        document.documentElement.dataset.theme,
        "dark",
        "the theme still applies; only its persistence is lost",
    );
});
