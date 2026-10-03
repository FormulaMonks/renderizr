/**
 * The acceptance set (spec 15.3) and how each workspace in it is built for the
 * harness: `test/acceptance.test.js` checks the React Flow engine's report for
 * every view, and `test/contact-sheet.js` screenshots every view under both
 * engines for people to review (ADR 11).
 *
 * Workspaces from the pinned `submodules/structurizr` checkout are skipped,
 * with a reason, where the submodule is absent. Builds run offline: remote
 * themes come from committed copies, or are dropped, before the CLI sees the
 * workspace, and `fetch` is poisoned in the CLI's process besides.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
        name: "Renderizr",
        source: join(REPO_ROOT, "architecture/workspace.json"),
        submodule: false,
    },
];

/**
 * Remote themes the acceptance set uses, each with a committed copy so the
 * build needs no network. The AWS theme is copied verbatim from
 * github.com/structurizr/themes at 3bfd26c, the repository that serves
 * static.structurizr.com.
 */
const THEME_COPIES = new Map([
    [
        "https://static.structurizr.com/themes/amazon-web-services-2020.04.30/theme.json",
        join(
            REPO_ROOT,
            "test/__fixtures__/themes/amazon-web-services-2020.04.30.json",
        ),
    ],
]);

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
 * fetched, and dropped when there is no copy.
 *
 * A theme's icons are file names relative to the theme's URL. They would
 * have to be fetched to be inlined, so the copies' icons are left out.
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
        const theme = JSON.parse(readFileSync(copy, "utf-8"));
        const withoutIcons = ({ icon: _icon, ...style }) => style;
        styles.elements = [
            ...(theme.elements ?? []).map(withoutIcons),
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

/** Every view key in `workspace`, in the order the workspace lists them. */
export function viewKeys(workspace) {
    const keys = [];
    for (const [kind, views] of Object.entries(workspace.views ?? {})) {
        if (kind === "configuration" || !Array.isArray(views)) continue;
        for (const view of views) keys.push(view.key);
    }
    return keys;
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
