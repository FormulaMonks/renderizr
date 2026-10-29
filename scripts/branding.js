import { dirname, relative, resolve, sep } from "node:path";
import { isDataUri, isUrl, loadFont, loadLogo } from "./assets.js";

/**
 * Branding: the header logo with its alt text and link, the font family and
 * the primary color, chosen from the branding flags and the workspace's
 * `renderizr.*` properties. `renderizr`, `renderizr edit` and `pnpm dev`
 * all choose it here, so the three render the same branding.
 *
 * Renderizr reads the properties and never writes them (ADR 16), and skips
 * Structurizr's `branding` block. A flag overrides its property for the run.
 * In a set, a workspace that sets no property of its own takes the landscape
 * scoped workspace's (ADR 26).
 */

/** The workspace property each branding value comes from. */
export const BRANDING_PROPERTIES = {
    logo: "renderizr.logo",
    logoAlt: "renderizr.logoAlt",
    logoHref: "renderizr.logoHref",
    font: "renderizr.font",
    primaryColor: "renderizr.primaryColor",
};

/**
 * The branding flags of a run that passed none, in the shape `cli.js`
 * hands them over: `null` for each value, and the font options' defaults.
 */
export const NO_BRANDING_FLAGS = Object.freeze({
    logo: null,
    logoAlt: null,
    logoHref: null,
    font: null,
    fontWeights: ["400", "700"],
    fontSubsets: ["latin"],
    fontItalic: false,
    primaryColor: null,
});

/* ------------------------------------------------------------- values */

/**
 * Whether `value` reads as one CSS color: a hex color, a color function such
 * as `rgb()`, `hsl()` or `oklch()`, or a color keyword. Anything else could
 * close the rule the page sets it in, so it never reaches the page.
 */
export function isCssColor(value) {
    return (
        /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ||
        /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([\w\s.,%/+-]+\)$/i.test(
            value,
        ) ||
        /^[a-z]+$/i.test(value)
    );
}

/**
 * What is wrong with the color `value` that `name` sets, or `null` when
 * nothing is.
 */
export const colorError = (value, name = "--primary-color") =>
    value === undefined || value === null || isCssColor(value)
        ? null
        : `${name} takes a CSS color, such as "#e4572e" or "rgb(228 87 46)"; got "${value}".`;

/** The five `renderizr.*` values `workspace` sets, `null` for each it doesn't. */
export function brandingProperties(workspace) {
    const properties = workspace?.properties ?? {};
    return Object.fromEntries(
        Object.entries(BRANDING_PROPERTIES).map(([key, property]) => {
            const value = properties[property];
            return [key, typeof value === "string" && value ? value : null];
        }),
    );
}

/** Where the workspace's logo `value` points, read beside `source`. */
const workspaceLogo = (value, source, cwd) => {
    if (isUrl(value) || isDataUri(value)) return value;
    if (isUrl(source)) return new URL(value, source).href;
    return resolve(dirname(resolve(cwd, source)), value);
};

/** Where `--logo <value>` points: the working directory for a path. */
const flagLogo = (value, cwd) =>
    isUrl(value) || isDataUri(value) ? value : resolve(cwd, value);

/* ------------------------------------------------------------ choosing */

/**
 * @typedef {"flag" | "workspace" | "landscape" | null} BrandingOrigin
 *   Where a branding value came from: its flag, the workspace's own
 *   property, the landscape scoped workspace's property, or nowhere.
 */

/**
 * The branding for one workspace (flag, then the workspace's property, then
 * the landscape scoped workspace's property, then the default), as
 * `loadLogo` and `loadFont` take it, and where each part came from. `flags`
 * are the branding flags `cli.js` parses, `null` where not passed; `source`
 * is the workspace's path or URL. `landscape`, `{ workspace, source }`, is
 * the landscape scoped workspace when `workspace` is another workspace of
 * its set (ADR 26), and `null` otherwise. Throws when a workspace value the
 * run uses is invalid, naming the property and the file that sets it.
 */
export function chooseBranding({
    flags,
    workspace,
    source,
    landscape = null,
    cwd = process.cwd(),
}) {
    const own = brandingProperties(workspace);
    const inherited = brandingProperties(landscape?.workspace);
    /** @returns {BrandingOrigin} */
    const from = (key) =>
        flags[key] !== null && flags[key] !== undefined
            ? "flag"
            : own[key] !== null
              ? "workspace"
              : landscape && inherited[key] !== null
                ? "landscape"
                : null;
    const values = { flag: flags, workspace: own, landscape: inherited };
    const pick = (key) => values[from(key)]?.[key] ?? null;
    /** The file that sets the value of `key`, which its errors name. */
    const sourceOf = (key) =>
        from(key) === "landscape" ? landscape.source : source;
    /** Whether a workspace, its own or the landscape, sets `key`. */
    const fromWorkspace = (key) =>
        from(key) === "workspace" || from(key) === "landscape";

    if (fromWorkspace("primaryColor")) {
        const wrong = colorError(
            pick("primaryColor"),
            `${BRANDING_PROPERTIES.primaryColor} in ${sourceOf("primaryColor")}`,
        );
        if (wrong) throw new Error(wrong);
    }

    const origin = {
        logo: from("logo"),
        font: from("font"),
        primaryColor: from("primaryColor"),
    };
    const logoSource =
        origin.logo === "flag"
            ? flags.logo
            : origin.logo
              ? workspaceLogo(pick("logo"), sourceOf("logo"), cwd)
              : null;

    return {
        logo: logoSource
            ? {
                  source: logoSource,
                  alt: pick("logoAlt") ?? "",
                  href: pick("logoHref"),
              }
            : null,
        font: origin.font
            ? {
                  family: pick("font"),
                  weights: flags.fontWeights,
                  subsets: flags.fontSubsets,
                  italic: flags.fontItalic,
              }
            : null,
        primaryColor: pick("primaryColor"),
        origin,
        sources: { logo: sourceOf("logo"), font: sourceOf("font") },
    };
}

/** `loading`, with a workspace value's error naming its property and `source`. */
const naming = (loading, property, source) =>
    loading.catch((error) => {
        throw new Error(`${property} in ${source}: ${error.message}`);
    });

/**
 * `loading`, the value of `key` loading, with its errors naming the property
 * and its file when a workspace sets it.
 */
const namingWhenSet = (loading, key, { origin, sources }) =>
    origin[key] === "workspace" || origin[key] === "landscape"
        ? naming(loading, BRANDING_PROPERTIES[key], sources[key])
        : loading;

/** The chosen logo, loaded. */
const loadChosenLogo = (chosen) =>
    namingWhenSet(loadLogo(chosen.logo), "logo", chosen);

/**
 * The chosen font, loaded once per run however many workspaces of a set
 * take it: `fonts` holds each font loading, by what `loadFont` takes.
 */
const loadChosenFont = (chosen, fonts) => {
    const key = JSON.stringify(chosen.font);
    if (!fonts.has(key)) fonts.set(key, loadFont(chosen.font));
    return namingWhenSet(fonts.get(key), "font", chosen);
};

/**
 * The branding for one workspace, loaded: the logo as a data URI, the font's
 * faces embedded, the primary color, and the `notices` to print once at
 * start (see `brandingNotices`). `landscape` is as `chooseBranding` takes
 * it, and `set` says the workspace is a set's landscape scoped workspace.
 * `fonts` lets a set load a font its workspaces share once. Fails on a
 * workspace value that won't load, naming its property and its file.
 */
export async function loadBranding({
    flags,
    workspace,
    source,
    landscape = null,
    set = false,
    cwd = process.cwd(),
    fonts = new Map(),
}) {
    const chosen = chooseBranding({ flags, workspace, source, landscape, cwd });
    const [logo, font] = await Promise.all([
        loadChosenLogo(chosen),
        loadChosenFont(chosen, fonts),
    ]);
    return {
        logo,
        font,
        primaryColor: chosen.primaryColor,
        notices: brandingNotices({
            flags,
            workspace,
            source,
            landscape,
            set,
            cwd,
        }),
    };
}

/**
 * The branding of every workspace of `set`, as `loadSet` gives it, loaded:
 * the landscape scoped workspace's (or a lone workspace's) as `landscape`,
 * and the others' as `workspaces`, in the set's order. A font the
 * workspaces share loads once.
 */
export async function loadSetBranding({ flags, set, cwd = process.cwd() }) {
    const fonts = new Map();
    const [landscape, ...workspaces] = await Promise.all([
        loadBranding({
            flags,
            workspace: set.landscape.workspace,
            source: set.landscape.source,
            set: set.workspaces.length > 0,
            cwd,
            fonts,
        }),
        ...set.workspaces.map((member) =>
            loadBranding({
                flags,
                workspace: member.workspace,
                source: member.source,
                landscape: set.landscape,
                cwd,
                fonts,
            }),
        ),
    ]);
    return { landscape, workspaces };
}

/**
 * Fail as `loadBranding` would on the workspace values a run would use,
 * without fetching the font: edit mode's check of a reloaded workspace.
 */
export async function checkBranding({
    flags,
    workspace,
    source,
    cwd = process.cwd(),
}) {
    const chosen = chooseBranding({ flags, workspace, source, cwd });
    if (chosen.origin.logo === "workspace") await loadChosenLogo(chosen);
}

/* ------------------------------------------------------- edit reloads */

/**
 * The `renderizr.*` properties whose value in `workspace` differs from
 * `start` and that no flag overrides: what a restart of edit mode would
 * change.
 */
export function brandingChanges(start, workspace, flags) {
    const now = brandingProperties(workspace);
    return Object.keys(BRANDING_PROPERTIES)
        .filter(
            (key) =>
                (flags[key] === null || flags[key] === undefined) &&
                (start?.[key] ?? null) !== now[key],
        )
        .map((key) => BRANDING_PROPERTIES[key]);
}

/* ------------------------------------------------------------- notices */

/** `path` relative to the folder of the workspace file `source`, with `/`. */
const besideWorkspace = (path, source, cwd) =>
    relative(dirname(resolve(cwd, source)), path)
        .split(sep)
        .join("/");

/**
 * The hint for the flags that differ from `workspace`: a `properties` block
 * the author can paste into the workspace once, or `null` when every flag
 * matches. A logo path prints relative to the workspace file; a URL prints
 * as given. For a set's landscape scoped workspace (`set`), it says the
 * block brands the whole set.
 */
function brandingHint({ flags, workspace, source, set, cwd }) {
    const properties = brandingProperties(workspace);
    const lines = [];
    let localLogo = false;
    for (const key of Object.keys(BRANDING_PROPERTIES)) {
        const value = flags[key];
        if (value === null || value === undefined) continue;
        let printed = value;
        if (key === "logo") {
            const location = flagLogo(value, cwd);
            if (
                properties.logo !== null &&
                workspaceLogo(properties.logo, source, cwd) === location
            )
                continue;
            if (isUrl(location) || isDataUri(location)) printed = location;
            else if (isUrl(source)) {
                localLogo = true;
                continue;
            } else printed = besideWorkspace(location, source, cwd);
        } else if (properties[key] === value) continue;
        lines.push(
            `        ${JSON.stringify(BRANDING_PROPERTIES[key])} ${JSON.stringify(printed)}`,
        );
    }
    const hint = lines.length
        ? [
              "To keep these branding flags without passing them, add them to the workspace's properties:",
              "",
              "    properties {",
              ...lines,
              "    }",
          ]
        : [];
    if (lines.length && set)
        hint.push(
            "",
            `${source} is the landscape scoped workspace: set there, they brand every workspace of the set that sets no value of its own.`,
        );
    if (localLogo)
        hint.push(
            ...(lines.length ? [""] : []),
            `Renderizr can't keep --logo in the workspace: it names a local file, which a workspace read from a URL can't reach.`,
        );
    if (!hint.length) return null;
    return hint.join("\n");
}

/**
 * What to print once at start about branding: a notice when Structurizr's
 * `branding` block sets a logo or a font that no `renderizr.*` property
 * does, which Renderizr skips, and the hint for flags that differ from the
 * workspace. A set prints the hint once, for its landscape scoped workspace
 * (`set`), so a workspace with a `landscape` gets none.
 */
export function brandingNotices({
    flags,
    workspace,
    source,
    landscape = null,
    set = false,
    cwd = process.cwd(),
}) {
    const notices = [];
    const block = workspace?.views?.configuration?.branding ?? {};
    const properties = brandingProperties(workspace);
    if (
        (block.logo && properties.logo === null) ||
        (block.font && properties.font === null)
    )
        notices.push(
            `Renderizr skips the branding block in ${source}: it reads the ${BRANDING_PROPERTIES.logo} and ${BRANDING_PROPERTIES.font} workspace properties instead.`,
        );
    const hint = landscape
        ? null
        : brandingHint({ flags, workspace, source, set, cwd });
    if (hint) notices.push(hint);
    return notices;
}
