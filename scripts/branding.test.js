import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
    brandingChanges,
    brandingNotices,
    brandingProperties,
    checkBranding,
    chooseBranding,
    loadBranding,
    NO_BRANDING_FLAGS,
} from "./branding.js";
import { fixture, withFetch, withTempDir } from "./__fixtures__/helpers.js";

const PNG = await readFile(fixture("logo.png"));

const flags = (set = {}) => ({ ...NO_BRANDING_FLAGS, ...set });

/** A workspace with `properties` set at its root. */
const workspaceWith = (properties = {}, views = {}) => ({
    name: "Acme",
    properties,
    views,
});

const ALL_PROPERTIES = {
    "renderizr.logo": "logo.svg",
    "renderizr.logoAlt": "Acme",
    "renderizr.logoHref": "https://acme.example",
    "renderizr.font": "Inter",
    "renderizr.primaryColor": "#e4572e",
};

const SOURCE = "/work/arch/workspace.json";
const CWD = "/work";

/* ------------------------------------------------------- chooseBranding */

test("with no flags and no properties, nothing is branded and the logo's alt text stays empty", () => {
    const chosen = chooseBranding({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith(),
        source: SOURCE,
        cwd: CWD,
    });
    assert.equal(chosen.logo, null);
    assert.equal(chosen.font, null);
    assert.equal(chosen.primaryColor, null);
});

test("the workspace's renderizr.* properties brand the site when no flag is passed", () => {
    const chosen = chooseBranding({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith(ALL_PROPERTIES),
        source: SOURCE,
        cwd: CWD,
    });
    assert.deepEqual(chosen.logo, {
        source: "/work/arch/logo.svg",
        alt: "Acme",
        href: "https://acme.example",
    });
    assert.deepEqual(chosen.font, {
        family: "Inter",
        weights: ["400", "700"],
        subsets: ["latin"],
        italic: false,
    });
    assert.equal(chosen.primaryColor, "#e4572e");
});

test("every flag overrides its workspace property for the run", () => {
    const chosen = chooseBranding({
        flags: flags({
            logo: "brand/other.png",
            logoAlt: "Other",
            logoHref: "https://other.example",
            font: "Lora",
            fontWeights: ["300"],
            primaryColor: "rebeccapurple",
        }),
        workspace: workspaceWith(ALL_PROPERTIES),
        source: SOURCE,
        cwd: CWD,
    });
    assert.deepEqual(chosen.logo, {
        source: "brand/other.png",
        alt: "Other",
        href: "https://other.example",
    });
    assert.equal(chosen.font.family, "Lora");
    assert.deepEqual(chosen.font.weights, ["300"]);
    assert.equal(chosen.primaryColor, "rebeccapurple");
});

test("--logo-alt and --logo-href apply to the workspace's logo", () => {
    const { logo } = chooseBranding({
        flags: flags({ logoAlt: "Flagged" }),
        workspace: workspaceWith({ "renderizr.logo": "logo.svg" }),
        source: SOURCE,
        cwd: CWD,
    });
    assert.equal(logo.alt, "Flagged");
    assert.equal(logo.href, null);
});

test("a relative renderizr.logo resolves against the workspace file, or the workspace URL", () => {
    const cases = [
        [SOURCE, "logo.svg", "/work/arch/logo.svg"],
        [SOURCE, "../brand/logo.svg", "/work/brand/logo.svg"],
        ["arch/workspace.json", "logo.svg", resolve("arch/logo.svg")],
        [
            "https://example.test/arch/workspace.json",
            "logo.svg",
            "https://example.test/arch/logo.svg",
        ],
        [
            SOURCE,
            "https://cdn.example/logo.svg",
            "https://cdn.example/logo.svg",
        ],
        [SOURCE, "data:image/svg+xml,<svg/>", "data:image/svg+xml,<svg/>"],
    ];
    for (const [source, value, expected] of cases) {
        const { logo } = chooseBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({ "renderizr.logo": value }),
            source,
            cwd: process.cwd(),
        });
        assert.equal(logo.source, expected, `${value} in ${source}`);
    }
});

test("a renderizr.primaryColor that isn't a CSS color fails, naming the property and the workspace", () => {
    assert.throws(
        () =>
            chooseBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith({
                    "renderizr.primaryColor": "red; } body { x",
                }),
                source: SOURCE,
                cwd: CWD,
            }),
        /renderizr\.primaryColor in \/work\/arch\/workspace\.json takes a CSS color.*got "red; } body \{ x"/,
    );
});

test("a workspace value that a flag overrides is never checked", () => {
    const { primaryColor } = chooseBranding({
        flags: flags({ primaryColor: "#fff" }),
        workspace: workspaceWith({ "renderizr.primaryColor": "not a color" }),
        source: SOURCE,
        cwd: CWD,
    });
    assert.equal(primaryColor, "#fff");
});

/* ------------------------------------------------------ brandingNotices */

test("a branding block with a logo or a font and no matching property draws a one-line notice", () => {
    const block = { configuration: { branding: { font: { name: "Inter" } } } };
    for (const [properties, expected] of [
        [{}, 1],
        [{ "renderizr.font": "Inter" }, 0],
    ]) {
        const notices = brandingNotices({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith(properties, block),
            source: SOURCE,
            cwd: CWD,
        });
        assert.equal(notices.length, expected, JSON.stringify(properties));
    }
    const [notice] = brandingNotices({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith(
            {},
            { configuration: { branding: { logo: "x" } } },
        ),
        source: SOURCE,
        cwd: CWD,
    });
    assert.match(notice, /renderizr\.logo/);
    assert.match(notice, /renderizr\.font/);
    assert.ok(!notice.includes("\n"), "the notice spans more than one line");
});

test("flags that match the workspace print no hint", () => {
    const notices = brandingNotices({
        flags: flags({
            logo: "arch/logo.svg",
            font: "Inter",
            primaryColor: "#e4572e",
        }),
        workspace: workspaceWith(ALL_PROPERTIES),
        source: SOURCE,
        cwd: CWD,
    });
    assert.deepEqual(notices, []);
});

test("a flag that differs from the workspace prints a ready-to-paste properties block", () => {
    const [hint] = brandingNotices({
        flags: flags({
            logo: "brand/logo.png",
            logoAlt: "Acme",
            primaryColor: "#000",
        }),
        workspace: workspaceWith({ "renderizr.logoAlt": "Acme" }),
        source: SOURCE,
        cwd: CWD,
    });
    assert.match(
        hint,
        /properties \{\n {8}"renderizr\.logo" "\.\.\/brand\/logo\.png"\n {8}"renderizr\.primaryColor" "#000"\n {4}\}/,
    );
    assert.ok(!hint.includes("logoAlt"), "an unchanged value made the hint");
});

test("the hint leaves a local --logo out for a workspace read from a URL, and says why", () => {
    const [hint] = brandingNotices({
        flags: flags({ logo: "logo.svg", font: "Inter" }),
        workspace: workspaceWith(),
        source: "https://example.test/workspace.json",
        cwd: CWD,
    });
    assert.match(hint, /"renderizr\.font" "Inter"/);
    assert.ok(!hint.includes('"renderizr.logo"'));
    assert.match(hint, /keep --logo in the workspace: it names a local file/);
});

test("the hint prints a URL logo as given", () => {
    const [hint] = brandingNotices({
        flags: flags({ logo: "https://cdn.example/logo.svg" }),
        workspace: workspaceWith(),
        source: SOURCE,
        cwd: CWD,
    });
    assert.match(hint, /"renderizr\.logo" "https:\/\/cdn\.example\/logo\.svg"/);
});

/* --------------------------------------------------------- loadBranding */

test("loadBranding loads the workspace's logo beside the workspace file", async () => {
    await withTempDir(async (dir) => {
        const source = join(dir, "workspace.json");
        await writeFile(join(dir, "mark.png"), PNG);
        const branding = await loadBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({ "renderizr.logo": "mark.png" }),
            source,
        });
        assert.ok(branding.logo.src.startsWith("data:image/png;base64,"));
        assert.equal(branding.font, null);
        assert.deepEqual(branding.notices, []);
    });
});

test("a workspace logo that won't load fails, naming the property and the workspace", async () => {
    await withTempDir(async (dir) => {
        const source = join(dir, "workspace.json");
        await assert.rejects(
            loadBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith({
                    "renderizr.logo": fixture("logo-scripted.svg"),
                }),
                source,
            }),
            (error) => {
                assert.match(error.message, /^renderizr\.logo in /);
                assert.ok(error.message.includes(source));
                assert.match(error.message, /contains script/);
                return true;
            },
        );
    });
});

test("a workspace logo read from the workspace URL is fetched beside it", async () => {
    await withFetch(
        { "https://example.test/arch/logo.png": { body: PNG } },
        async () => {
            const { logo } = await loadBranding({
                flags: NO_BRANDING_FLAGS,
                workspace: workspaceWith({ "renderizr.logo": "logo.png" }),
                source: "https://example.test/arch/workspace.json",
            });
            assert.equal(logo.width, 120);
        },
    );
});

/* ---------------------------------------------------- edit mode reloads */

test("brandingChanges names the properties that changed and no flag overrides", () => {
    const start = brandingProperties(workspaceWith(ALL_PROPERTIES));
    const reloaded = workspaceWith({
        ...ALL_PROPERTIES,
        "renderizr.font": "Lora",
        "renderizr.primaryColor": "#000",
    });
    assert.deepEqual(brandingChanges(start, reloaded, NO_BRANDING_FLAGS), [
        "renderizr.font",
        "renderizr.primaryColor",
    ]);
    assert.deepEqual(
        brandingChanges(start, reloaded, flags({ primaryColor: "#fff" })),
        ["renderizr.font"],
    );
    assert.deepEqual(
        brandingChanges(
            start,
            workspaceWith(ALL_PROPERTIES),
            NO_BRANDING_FLAGS,
        ),
        [],
    );
});

test("checkBranding refuses an invalid color or logo and passes a valid set", async () => {
    await checkBranding({
        flags: NO_BRANDING_FLAGS,
        workspace: workspaceWith({
            "renderizr.primaryColor": "#000",
            "renderizr.logo": fixture("logo.png"),
            "renderizr.font": "Not Fetched",
        }),
        source: SOURCE,
    });
    await assert.rejects(
        checkBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({ "renderizr.primaryColor": "nope!" }),
            source: SOURCE,
        }),
        /renderizr\.primaryColor/,
    );
    await assert.rejects(
        checkBranding({
            flags: NO_BRANDING_FLAGS,
            workspace: workspaceWith({
                "renderizr.logo": fixture("logo-scripted.svg"),
            }),
            source: SOURCE,
        }),
        /renderizr\.logo/,
    );
});
