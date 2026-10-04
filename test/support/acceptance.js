/**
 * The acceptance set (spec 15.3) and how each workspace in it is built for the
 * harness: `test/acceptance.test.js` checks the React Flow engine's report for
 * every view, and `test/contact-sheet.js` screenshots every view under both
 * engines for people to review (ADR 11).
 *
 * Workspaces from the pinned `submodules/structurizr` checkout are skipped,
 * with a reason, where the submodule is absent. Builds run offline: remote
 * themes and their icons come from committed copies, or are dropped, before
 * the CLI sees the workspace, and `fetch` is poisoned in the CLI's process
 * besides.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
    fixture,
    REPO_ROOT,
    runCli,
} from "../../scripts/__fixtures__/helpers.js";

/** Where the Structurizr repository keeps the workspaces its exporters test against. */
const STRUCTURIZR_RESOURCES = join(
    REPO_ROOT,
    "submodules/structurizr/structurizr-export/src/test/resources",
);

/**
 * Every workspace whose views the engine has to draw. More join with #51:
 * the purpose-built fixture, the large views and the two invalid ones.
 */
export const ACCEPTANCE_SET = [
    {
        name: "Big Bank plc",
        source: join(STRUCTURIZR_RESOURCES, "big-bank-plc.json"),
        submodule: true,
    },
    {
        name: "groups",
        source: join(STRUCTURIZR_RESOURCES, "groups.json"),
        submodule: true,
    },
    {
        name: "Amazon Web Services",
        source: join(STRUCTURIZR_RESOURCES, "amazon-web-services.json"),
        submodule: true,
    },
    {
        // Big Bank with every view's separations at 100 instead of 300:
        // Dagre never sizes a boundary, so at these separations they crowd
        // each other unless the engine makes room for them (spec 7.1, 8).
        name: "Big Bank plc (tight)",
        source: join(REPO_ROOT, "test/__fixtures__/big-bank-plc-tight.json"),
        submodule: false,
    },
    {
        name: "Renderizr",
        source: join(REPO_ROOT, "architecture/workspace.json"),
        submodule: false,
    },
    {
        // One stored-layout view per edge-routing case of spec 10, until #51's
        // purpose-built fixture covers them.
        name: "Edge routing",
        source: join(REPO_ROOT, "test/__fixtures__/edge-routing.json"),
        submodule: false,
    },
    {
        // Stored-layout views with unplaced elements (spec 7.2), each placed
        // beside its neighbors, clear of a foreign boundary, or to the right
        // of the view when every slot is taken.
        name: "Unplaced elements",
        source: join(REPO_ROOT, "test/__fixtures__/unplaced-elements.json"),
        submodule: false,
    },
    {
        // The filtered, custom and image views of spec 12, until #51's
        // purpose-built fixture covers them.
        name: "View types",
        source: join(REPO_ROOT, "test/__fixtures__/view-types.json"),
        submodule: false,
    },
    {
        // structurizr/ui's Big Bank, every view with its stored layout: the
        // other Big Bank lays every view out automatically, so the layouts
        // Structurizr's editor saves were never drawn here (#72).
        name: "Big Bank plc (stored layout)",
        source: join(REPO_ROOT, "test/__fixtures__/big-bank-plc-stored.json"),
        submodule: false,
    },
    {
        // Elements, boundaries and relationships with none, one or several
        // targets and their indicators (spec 6.1, 9.2, 10.9), until #51's
        // purpose-built fixture covers them.
        name: "Activation targets",
        source: join(REPO_ROOT, "test/__fixtures__/activation-targets.json"),
        submodule: false,
    },
];

/** The committed copies of remote themes, beside this repository's fixtures. */
const THEMES = join(REPO_ROOT, "test/__fixtures__/themes");

/**
 * Remote themes the acceptance set uses, each with a committed copy so the
 * build needs no network: the theme itself, and a folder holding the icons
 * its styles name, relative to the theme's URL. The AWS theme and its icons
 * are copied verbatim from github.com/structurizr/themes at 3bfd26c, the
 * repository that serves static.structurizr.com. Of its 364 icons, only those
 * of the tags `amazon-web-services.json` uses are committed.
 */
const THEME_COPIES = new Map([
    [
        "https://static.structurizr.com/themes/amazon-web-services-2020.04.30/theme.json",
        {
            theme: join(THEMES, "amazon-web-services-2020.04.30.json"),
            icons: join(THEMES, "amazon-web-services-2020.04.30"),
        },
    ],
]);

/** The media types of the icon files committed beside theme copies. */
const ICON_TYPES = { ".png": "image/png", ".svg": "image/svg+xml" };

/**
 * `style` with its icon inlined from the theme copy's `icons` folder, the way
 * the contact sheet has to show it (spec 15.2), or without an icon when the
 * folder has no copy of it: no acceptance view uses such a style.
 */
function withCopiedIcon({ icon, ...style }, icons) {
    const file = icon && join(icons, icon);
    const type = file && ICON_TYPES[extname(file)];
    if (!type || !existsSync(file)) return style;
    const data = readFileSync(file).toString("base64");
    return { ...style, icon: `data:${type};base64,${data}` };
}

/** Why `entry` cannot be built here, or null when it can. */
export function missingReason(entry) {
    if (existsSync(entry.source)) return null;
    return entry.submodule
        ? `${entry.name}: submodules/structurizr is not checked out; run git submodule update --init`
        : `${entry.name}: ${entry.source} is missing`;
}

/**
 * `entry`'s workspace as the harness builds it: each remote theme folded into
 * the styles from its committed copy, the way `loadWorkspace` folds in one it
 * fetched, and dropped when there is no copy. A theme's icons are file names
 * relative to the theme's URL; each is inlined from the copy's icons folder.
 */
export function prepareWorkspace(entry) {
    const workspace = JSON.parse(readFileSync(entry.source, "utf-8"));

    // An image view whose content is a URL needs the network. Offline, the
    // Structurizr renderer fails to load it and raises an `alert()`, which
    // stops headless Chrome for good; the view is drawn without its image.
    for (const view of workspace.views?.imageViews ?? []) {
        for (const field of ["content", "contentLight", "contentDark"]) {
            if (/^https?:/i.test(view[field] ?? "")) delete view[field];
        }
    }

    const configuration = workspace.views?.configuration;
    const themes = configuration?.themes ?? [];
    if (!themes.length) return workspace;

    configuration.styles ??= {};
    const styles = configuration.styles;
    for (const url of themes) {
        const copy = THEME_COPIES.get(url);
        if (!copy) continue;
        const theme = JSON.parse(readFileSync(copy.theme, "utf-8"));
        styles.elements = [
            ...(theme.elements ?? []).map((style) =>
                withCopiedIcon(style, copy.icons),
            ),
            ...(styles.elements ?? []),
        ];
        styles.relationships = [
            ...(theme.relationships ?? []),
            ...(styles.relationships ?? []),
        ];
    }
    configuration.themes = [];
    return workspace;
}

/**
 * Every view key in `workspace` the page can open, in the order the workspace
 * lists them: all but filtered views' bases, which the page hides behind
 * their filtered views, as Structurizr does.
 */
export function viewKeys(workspace) {
    const all = Object.entries(workspace.views ?? {}).flatMap(
        ([kind, views]) =>
            kind === "configuration" || !Array.isArray(views) ? [] : views,
    );
    const bases = new Set(all.map((view) => view.baseViewKey).filter(Boolean));
    return all.map((view) => view.key).filter((key) => !bases.has(key));
}

/**
 * Poison `fetch` inside the CLI so these builds prove they need no network,
 * as `test/e2e.test.js` does.
 */
const OFFLINE = {
    NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--import ${pathToFileURL(fixture("no-network.js")).href}`,
    ]
        .filter(Boolean)
        .join(" "),
};

/**
 * Build `workspace` as a single file into `out` with `engine`, writing the
 * engine report when `report` is set, and resolve with `out`.
 */
export async function buildForAcceptance(
    workspace,
    out,
    { engine, report = false },
) {
    await mkdir(out, { recursive: true });
    const source = join(out, "workspace.json");
    await writeFile(source, JSON.stringify(workspace));
    const result = await runCli(
        [
            source,
            "--out",
            join(out, "site"),
            "--single-file",
            "--engine",
            engine,
        ],
        {
            env: {
                ...OFFLINE,
                ...(report ? { RENDERIZR_ENGINE_REPORT: "1" } : {}),
            },
        },
    );
    if (result.code !== 0) {
        throw new Error(
            `building ${workspace.name} with ${engine} failed:\n${result.stdout}\n${result.stderr}`,
        );
    }
    return join(out, "site");
}

/** The URL that opens view `key` of the single file built into `site`. */
export const viewUrl = (site, key) =>
    `${pathToFileURL(join(site, "index.html")).href}#/?page=diagrams&view=${encodeURIComponent(key)}`;

/** How many Chromes run at once where nothing is being timed. */
export const BROWSERS = 4;

/** Run `body` over `items`, at most `limit` at a time, keeping their order. */
export async function mapLimit(items, limit, body) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const at = next++;
            results[at] = await body(items[at], at);
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker),
    );
    return results;
}
